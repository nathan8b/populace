import type { Redis } from '@devvit/public-api';
import type { GameState, Law } from './message';

/**
 * Returns the default game state.
 */
export function getDefaultState(): GameState {
  return {
    version: 0, 
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
    lastExecutiveOrderTime: 0,
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
 * Uses the OpenAI API to determine if a given law text is relevant to a specified statistic.
 * The function prompts the LLM to answer only "YES" or "NO", and returns true if the answer is "YES".
 */
async function isLawRelevantToStat(lawText: string, stat: string): Promise<boolean> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OpenAI API key in environment variable OPENAI_API_KEY");
  }
  
  const prompt = `Determine if the following law is related to the "${stat}" statistic in a political simulator game. Respond with only "YES" or "NO". Law text: ${lawText}`;
  
  const response = await fetch("https://api.openai.com/v1/completions", {
    method: "POST",
    headers: {
       "Content-Type": "application/json",
       "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
       model: "text-davinci-003",
       prompt: prompt,
       max_tokens: 5,
       temperature: 0.0,
    }),
  });
  
  const result = await response.json();
  const answer = result.choices[0].text.trim().toUpperCase();
  return answer === "YES";
}

/**
 * Simulate an AI-generated event that affects statistics.
 * This function:
 *  - Randomly selects an event tier (minor, major, or crisis)
 *  - Calls OpenAI to generate the event based on the tier
 *  - Uses an LLM call to determine for each approved law if it's related to each statistic
 *  - Adjusts the event's effects based on the number of relevant laws:
 *       * Negative effects are mitigated by 20% per relevant law.
 *       * Positive effects are boosted by 10% per relevant law.
 */
export async function simulateEvent(redis: Redis, state: GameState): Promise<GameState> {
  // Choose event tier: 70% minor, 25% major, 5% crisis.
  const rand = Math.random();
  let tier: "minor" | "major" | "crisis";
  if (rand < 0.7) {
    tier = "minor";
  } else if (rand < 0.95) {
    tier = "major";
  } else {
    tier = "crisis";
  }
  
  // Generate the event.
  const event = await fetchEventFromOpenAI(tier);
  event.description = `[${tier.toUpperCase()}] ${event.description}`;
  
  // Filter approved laws.
  const approvedLaws = state.laws.filter(law => law.status === "approved");
  
  // For each statistic, check each approved law's relevance using LLM.
  for (const key in event.effects) {
    if (state.statistics.hasOwnProperty(key)) {
      let relevantCount = 0;
      for (const law of approvedLaws) {
        const isRelevant = await isLawRelevantToStat(law.text, key);
        if (isRelevant) {
          relevantCount++;
        }
      }
      
      let modifier = 1;
      if (relevantCount > 0) {
        if (event.effects[key] < 0) {
          modifier = 1 + 0.2 * relevantCount; // mitigate negative effects
        } else if (event.effects[key] > 0) {
          modifier = 1 + 0.1 * relevantCount; // boost positive effects
        }
      }
      
      const adjustedEffect = event.effects[key] * modifier;
      state.statistics[key] = Math.max(state.statistics[key] + adjustedEffect, 0);
    }
  }
  
  state.eventHistory.push(event.description);
  
  // Recalculate overall average statistic.
  const stats = Object.values(state.statistics);
  const overall = stats.reduce((a, b) => a + b, 0) / stats.length;
  if (overall === 0) {
    state = getDefaultState();
    state.eventHistory.push("Country collapsed! Restarting simulation.");
  }
  
  // Increment version and save state.
  state.version = (state.version || 0) + 1;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Draft a new law.
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
 * When votes in favor reach 2/3 of all senators, the law's status is set to "awaiting_president"
 * so that the president must take action.
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
  const law = state.laws.find(l => l.id === lawId);
  if (!law) {
    throw new Error("Law not found.");
  }
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
    // Instead of immediately approving, flag for presidential review.
    law.status = "awaiting_president";
  }
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * The president can pass a law that is awaiting presidential review.
 */
export async function passLawByPresident(
  redis: Redis,
  state: GameState,
  voter: string,
  lawId: string
): Promise<GameState> {
  if (voter !== state.positionsOfPower.president) {
    throw new Error("Only the president can pass laws.");
  }
  const law = state.laws.find(l => l.id === lawId);
  if (!law) {
    throw new Error("Law not found.");
  }
  if (law.status !== "awaiting_president") {
    throw new Error("Law is not awaiting presidential action.");
  }
  law.status = "passed";
  state.lawHistory.push(`Law "${law.text}" passed by president.`);
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * The president can veto a law that is awaiting presidential review.
 */
export async function vetoLawByPresident(
  redis: Redis,
  state: GameState,
  voter: string,
  lawId: string
): Promise<GameState> {
  if (voter !== state.positionsOfPower.president) {
    throw new Error("Only the president can veto laws.");
  }
  const law = state.laws.find(l => l.id === lawId);
  if (!law) {
    throw new Error("Law not found.");
  }
  if (law.status !== "awaiting_president") {
    throw new Error("Law is not awaiting presidential action.");
  }
  law.status = "vetoed";
  state.lawHistory.push(`Law "${law.text}" vetoed by president.`);
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * The president can issue an executive order once per week.
 * The order directly adjusts statistics according to the provided effects.
 */
export async function executiveOrder(
  redis: Redis,
  state: GameState,
  voter: string,
  order: { description: string; effects: Record<string, number> }
): Promise<GameState> {
  if (voter !== state.positionsOfPower.president) {
    throw new Error("Only the president can issue executive orders.");
  }
  const now = Date.now();
  const oneWeek = 7 * 24 * 3600 * 1000;
  if (now - (state.lastExecutiveOrderTime || 0) < oneWeek) {
    throw new Error("Executive orders can only be issued once per week.");
  }
  
  // Apply the order's effects directly to statistics.
  for (const key in order.effects) {
    if (state.statistics.hasOwnProperty(key)) {
      state.statistics[key] = Math.max(state.statistics[key] + order.effects[key], 0);
    }
  }
  
  state.eventHistory.push(`[EXECUTIVE ORDER] ${order.description}`);
  state.lastExecutiveOrderTime = now;
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Vote for a senator.
 * Enforces that each citizen can vote for a senator only once every two weeks.
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
 * Enforces that each citizen can vote for president only once every month.
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
  state.positionsOfPower.president = candidate;
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Senators vote to impeach the president.
 * Impeachment passes if 3/4 of senators vote in favor.
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
  const votesFor = Object.values(state.polls.impeachmentVotes).filter(v => v).length;
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
export async function updateSenators(
  redis: Redis,
  state: GameState
): Promise<GameState> {
  const candidates = Object.entries(state.polls.senatorVotes);
  candidates.sort((a, b) => b[1] - a[1]);
  state.positionsOfPower.senators = candidates.slice(0, 40).map(([candidate]) => candidate);
  state.version++;
  await redis.set('gameState', JSON.stringify(state));
  return state;
}

/**
 * Protest action increases the protest percentage.
 * Enforces a per-user cooldown (5 minutes). When protests reach 30%, the welfare statistic is decreased.
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
 * Enforces a per-user cooldown (5 minutes). When coup percentage reaches 70%, the government collapses and the simulation resets.
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