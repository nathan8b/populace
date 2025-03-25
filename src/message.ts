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
  version: number;
  statistics: {
    military: number;
    economy: number;
    healthcare: number;
    welfare: number;
    education: number;
    technology: number;
  };
  eventHistory: string[];
  lawHistory: string[];
  laws: Law[];
  polls: {
    senatorVotes: Record<string, number>;
    presidentVotes: Record<string, number>;
    impeachmentVotes: Record<string, boolean>;
  };
  citizenActions: {
    protestPercentage: number;
    coupPercentage: number;
  };
  positionsOfPower: {
    senators: string[];
    president: string | null;
  };
  votingRecords: {
    senator: Record<string, number>;
    president: Record<string, number>;
  };
  lastActionTimes: Record<string, { protest: number; coup: number }>;
  lastExecutiveOrderTime: number; // <-- Add this property
};