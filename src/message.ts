/**
 * Law type representing a pending or approved law.
 */
export type Law = {
  id: string;
  text: string;
  votesFor: number;
  votesAgainst: number;
  status: "pending" | "approved" | "rejected" | "amended";
  createdAt: number;
  votes: Record<string, boolean>; // tracks each senator’s vote (true for yes, false for no)
};

/** Message from Devvit to the web view. */
export type DevvitMessage =
  | { type: 'initialData'; data: { username: string; gameState: GameState } }
  | { type: 'updateGameState'; data: { gameState: GameState } };

/** Message from the web view to Devvit. */
export type WebViewMessage =
  | { type: 'webViewReady' }
  | { type: 'simulateEvent' }
  | { type: 'draftLaw'; data: { law: string } }
  | { type: 'voteOnLaw'; data: { voter: string; lawId: string; vote: boolean } }
  | { type: 'voteSenator'; data: { voter: string; candidate: string } }
  | { type: 'votePresident'; data: { voter: string; candidate: string } }
  | { type: 'voteImpeach'; data: { voter: string; vote: boolean } }
  | { type: 'protest'; data: { voter: string; protestAmount: number } }
  | { type: 'joinCoup'; data: { voter: string; coupAmount: number } };

/**
 * Extended GameState type representing the simulation state.
 */
export type GameState = {
  statistics: {
    military: number;
    economy: number;
    healthcare: number;
    welfare: number;
    education: number;
    technology: number;
  };
  eventHistory: string[];
  lawHistory: string[]; // history log for laws that have completed the process
  laws: Law[]; // active laws pending senate vote or awaiting presidential signature
  polls: {
    senatorVotes: Record<string, number>;     // cumulative votes per candidate for senator
    presidentVotes: Record<string, number>;     // cumulative votes per candidate for president
    impeachmentVotes?: Record<string, boolean>;   // record of impeachment votes by senators
  };
  citizenActions: {
    protestPercentage: number;
    coupPercentage: number;
  };
  positionsOfPower: {
    senators: string[]; // list of usernames (up to 40) selected as senators
    president: string | null;
  };
  votingRecords: {
    senator: Record<string, number>;   // tracks last senator vote timestamp per voter (in ms)
    president: Record<string, number>;   // tracks last president vote timestamp per voter (in ms)
  };
  lastActionTimes: Record<string, { protest: number; coup: number }>; // cooldowns per user (ms timestamps)
};