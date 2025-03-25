import type { Redis } from '@devvit/public-api';
import type { GameState, Law } from './message';

/**
 * Returns the default game state.
 */
export function getDefaultState(): GameState {
  return {
    version: 0, // initial version for optimistic concurrency
    statistics: {
      military: 100,
      economy: 100,
      healthcare: 100,
      welfare: 100,
      education: 100,
      technology: 100,
    },
    eventHistory: [],
    lawHistory: [],
    laws: [],
    polls: {
      senatorVotes: {},
      presidentVotes: {},
      impeachmentVotes: {},
    },
    citizenActions: {
      protestPercentage: 0,
      coupPercentage: 0,
    },
    positionsOfPower: {
      senators: [],
      president: null,
    },
    votingRecords: {
      senator: {},
      president: {},
    },
    lastActionTimes: {},
  };
}

/**
 * Calls the OpenAI API to generate an event.
 * The prompt instructs the API to respond with a JSON object that includes:
 * - description: a string describing the event.
 * - effects: an object with keys: military, economy, healthcare, welfare, education, technology.
 * The prompt is tailored based on the event tier.
 */
async function fetchEventFromOpenAI(
  tier: "minor" | "major" | "crisis"
): Promise<{ description: string; effects: Record<string, number> }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OpenAI API key in environment variable OPENAI_API_KEY");
  }

  // Tailor the effect description based on the tier.
  const effectDescription =
    tier === "minor"
      ? "small, subtle effects"
      : tier === "major"
      ? "moderate effects"
      : "significant, drastic effects";

  const prompt = `Generate a JSON formatted event for a political simulator game of ${tier} complexity. Output a JSON object with a "description" (string) and an "effects" object. The "effects" object must include the keys: "military", "economy", "healthcare", "welfare", "education", "technology". For each key, provide an integer value (positive or negative) reflecting ${effectDescription}.`;

  const response = await fetch("https://api.openai.com/v1/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-davinci-003",
      prompt,
      max_tokens: 150,
      temperature: 0.7,
    }),
  });

  const result = await response.json();
  const text = result.choices[0].text.trim();
  let eventObj;
  try {
    eventObj = JSON.parse(text);
  } catch (e) {
    // Fallback event if JSON parsing fails.
    eventObj = {
      description: "A quiet week passes with no significant events.",
      effects: {
        military: 0,
        economy: 0,
        healthcare: 0,
        welfare: 0,
        education: 0,
        technology: 0,
      },
    };
  }
  return eventObj;
}

/**
 * Simulate an AI-generated event that affects statistics.
 * This function randomly selects an event tier (minor, major, or crisis),
 * calls OpenAI to generate the event based on the tier,
 * prefixes the event description with the tier, and applies its effects.
 */
export async function simulateEvent(redis: Redis, state: GameState): Promise<GameState> {
  // Randomly choose event tier using weighted probabilities:
  // 70% chance for minor, 25% for major, 5% for crisis.
  const rand = Math.random();
  let tier: "minor" | "major" | "crisis";
  if (rand < 0.7) {
    tier = "minor";
  } else if (rand < 0.95) {
    tier = "major";
  } else {
    tier = "crisis";
  }

  // Fetch an event from OpenAI with the selected tier.
  const event = await fetchEventFromOpenAI(tier);

  // Prefix the event description with its tier.
  event.description = `[${tier.toUpperCase()}] ${event.description}`;

  // Apply each effect to the corresponding statistic.
  for (const key in event.effects) {
    if (state.statistics.hasOwnProperty(key)) {
      state.statistics[key] = Math.max(state.statistics[key] + event.effects[key], 0);
    }
  }
  state.eventHistory.push(event.description);

  // Recalculate overall statistic (average).
  const stats = Object.values(state.statistics);
  const overall = stats.reduce((a, b) => a + b, 0) / stats.length;
  if (overall === 0) {
    state = getDefaultState();
    state.eventHistory.push("Country collapsed! Restarting simulation.");
  }

  // Increment version to signal a state update.
  state.version = (state.version || 0) + 1;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Draft a new law.
 * Creates a pending law that must be voted on by senators.
 */
export async function draftLaw(redis: Redis, state: GameState, lawText: string): Promise<GameState> {
  const newLaw: Law = {
    id: `law_${Date.now()}`,
    text: lawText,
    votesFor: 0,
    votesAgainst: 0,
    status: "pending",
    createdAt: Date.now(),
    votes: {},
  };
  state.laws.push(newLaw);
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Senators vote on a law.
 * Enforces that each senator can vote only once on a given law.
 * When votes in favor reach 2/3 of all senators, the law is marked as approved.
 */
export async function voteOnLaw(
  redis: Redis,
  state: GameState,
  voter: string,
  lawId: string,
  vote: boolean
): Promise<GameState> {
  if (!state.positionsOfPower.senators.includes(voter)) {
    throw new Error("Only senators can vote on laws.");
  }
  const law = state.laws.find((l) => l.id === lawId);
  if (!law) {
    throw new Error("Law not found.");
  }
  // Enforce single vote per senator for this law.
  if (law.votes[voter] !== undefined) {
    throw new Error("You have already voted on this law.");
  }
  law.votes[voter] = vote;
  if (vote) {
    law.votesFor += 1;
  } else {
    law.votesAgainst += 1;
  }
  const totalSenators = state.positionsOfPower.senators.length;
  if (law.votesFor >= (2 / 3) * totalSenators) {
    law.status = "approved"; // Law is forwarded to the president for signature.
  }
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Vote for a senator.
 * Enforces that each citizen can only vote for a senator once every two weeks.
 */
export async function voteSenator(
  redis: Redis,
  state: GameState,
  voter: string,
  candidate: string
): Promise<GameState> {
  const now = Date.now();
  const lastVote = state.votingRecords.senator[voter] || 0;
  const twoWeeks = 14 * 24 * 3600 * 1000;
  if (now - lastVote < twoWeeks) {
    throw new Error("You can only vote for a senator once every two weeks.");
  }
  state.votingRecords.senator[voter] = now;
  if (!state.polls.senatorVotes[candidate]) {
    state.polls.senatorVotes[candidate] = 0;
  }
  state.polls.senatorVotes[candidate] += 1;
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Vote for a president.
 * Enforces that each citizen can only vote for president once every month.
 */
export async function votePresident(
  redis: Redis,
  state: GameState,
  voter: string,
  candidate: string
): Promise<GameState> {
  const now = Date.now();
  const lastVote = state.votingRecords.president[voter] || 0;
  const oneMonth = 30 * 24 * 3600 * 1000;
  if (now - lastVote < oneMonth) {
    throw new Error("You can only vote for president once every month.");
  }
  state.votingRecords.president[voter] = now;
  if (!state.polls.presidentVotes[candidate]) {
    state.polls.presidentVotes[candidate] = 0;
  }
  state.polls.presidentVotes[candidate] += 1;
  // For simplicity, assign the candidate as president immediately.
  state.positionsOfPower.president = candidate;
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Senators vote to impeach the president.
 * Requires a 3/4 majority of senators to pass impeachment.
 */
export async function voteToImpeach(
  redis: Redis,
  state: GameState,
  voter: string,
  vote: boolean
): Promise<GameState> {
  if (!state.positionsOfPower.senators.includes(voter)) {
    throw new Error("Only senators can vote to impeach the president.");
  }
  if (!state.polls.impeachmentVotes) {
    state.polls.impeachmentVotes = {};
  }
  if (state.polls.impeachmentVotes[voter] !== undefined) {
    throw new Error("You have already voted for impeachment.");
  }
  state.polls.impeachmentVotes[voter] = vote;
  const votesFor = Object.values(state.polls.impeachmentVotes).filter((v) => v).length;
  const totalSenators = state.positionsOfPower.senators.length;
  if (votesFor >= (3 / 4) * totalSenators) {
    state.positionsOfPower.president = null;
    state.eventHistory.push("The president has been impeached by a 3/4 majority of senators.");
  }
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Update the list of senators.
 * Automatically selects up to 40 candidates with the highest senator vote counts.
 */
export async function updateSenators(redis: Redis, state: GameState): Promise<GameState> {
  const candidates = Object.entries(state.polls.senatorVotes);
  candidates.sort((a, b) => b[1] - a[1]);
  state.positionsOfPower.senators = candidates.slice(0, 40).map(([candidate]) => candidate);
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Protest action increases the protest percentage.
 * Enforces a per-user cooldown (5 minutes) before the same user can protest again.
 * When protests reach 30%, it negatively affects the welfare statistic.
 */
export async function protest(
  redis: Redis,
  state: GameState,
  voter: string,
  protestAmount: number
): Promise<GameState> {
  const now = Date.now();
  const cooldown = 5 * 60 * 1000;
  if (!state.lastActionTimes[voter]) {
    state.lastActionTimes[voter] = { protest: 0, coup: 0 };
  }
  if (now - state.lastActionTimes[voter].protest < cooldown) {
    throw new Error("You must wait before protesting again.");
  }
  state.lastActionTimes[voter].protest = now;
  state.citizenActions.protestPercentage = Math.min(
    state.citizenActions.protestPercentage + protestAmount,
    100
  );
  if (state.citizenActions.protestPercentage >= 30) {
    state.statistics.welfare = Math.max(state.statistics.welfare - 10, 0);
  }
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Join coup increases the coup percentage.
 * Enforces a per-user cooldown (5 minutes) before the same user can join a coup again.
 * When the coup percentage reaches 70%, the government collapses and the simulation resets.
 */
export async function joinCoup(
  redis: Redis,
  state: GameState,
  voter: string,
  coupAmount: number
): Promise<GameState> {
  const now = Date.now();
  const cooldown = 5 * 60 * 1000;
  if (!state.lastActionTimes[voter]) {
    state.lastActionTimes[voter] = { protest: 0, coup: 0 };
  }
  if (now - state.lastActionTimes[voter].coup < cooldown) {
    throw new Error("You must wait before joining a coup again.");
  }
  state.lastActionTimes[voter].coup = now;
  state.citizenActions.coupPercentage = Math.min(
    state.citizenActions.coupPercentage + coupAmount,
    100
  );
  if (state.citizenActions.coupPercentage >= 70) {
    state = getDefaultState();
    state.eventHistory.push("A coup has taken over! Government collapsed. Simulation restarting.");
  }
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}