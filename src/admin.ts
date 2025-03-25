import type { Redis } from '@devvit/public-api';
import type { GameState, Law } from './message';
import { getDefaultState } from './simulation';

/**
 * Appends a log entry for any moderator or user action.
 * Logs are stored in Redis under the key "auditLogs".
 */
export async function auditLog(redis: Redis, action: string, details: any): Promise<void> {
  const logEntry = {
    timestamp: Date.now(),
    action,
    details,
  };
  // Assuming redis.lpush is available; adjust if your Redis client uses a different API.
  const logsKey = "auditLogs";
  await redis.lpush(logsKey, JSON.stringify(logEntry));
}

/**
 * Retrieves all audit logs.
 */
export async function getAuditLogs(redis: Redis): Promise<any[]> {
  const logsKey = "auditLogs";
  // Adjust the command based on your Redis client; here we assume lrange is available.
  const logs = await redis.lrange(logsKey, 0, -1);
  return logs.map((log: string) => JSON.parse(log));
}

/**
 * Returns all pending law proposals for moderator review.
 */
export async function reviewLaws(state: GameState): Promise<Law[]> {
  return state.laws.filter(law => law.status === "pending");
}

/**
 * Allows a moderator to manually adjust game state statistics.
 * The `adjustments` object should contain key-value pairs for any of the statistics.
 */
export async function adjustGameState(
  redis: Redis,
  state: GameState,
  adjustments: Partial<GameState["statistics"]>
): Promise<GameState> {
  for (const key in adjustments) {
    if (state.statistics.hasOwnProperty(key)) {
      state.statistics[key] = adjustments[key];
    }
  }
  // Log the manual adjustment action.
  await auditLog(redis, "adjustGameState", { adjustments, newStatistics: state.statistics });
  state.version++;
  await redis.set("gameState", JSON.stringify(state));
  return state;
}

/**
 * Allows a moderator to override and approve a law manually.
 */
export async function approveLaw(
  redis: Redis,
  state: GameState,
  lawId: string
): Promise<GameState> {
  const law = state.laws.find(l => l.id === lawId);
  if (!law) {
    throw new Error("Law not found.");
  }
  law.status = "approved";
  await auditLog(redis, "approveLaw", { lawId });
  state.version++;
  await redis.set("gameState", JSON.stringify(state));
  return state;
}

/**
 * Provides a mechanism for moderators to manage disruptive behavior.
 * For example, this function clears a user's voting records and cooldown timers.
 */
export async function manageDisruptiveBehavior(
  redis: Redis,
  state: GameState,
  voter: string,
  action: string
): Promise<GameState> {
  delete state.votingRecords.senator[voter];
  delete state.votingRecords.president[voter];
  delete state.lastActionTimes[voter];
  await auditLog(redis, "manageDisruptiveBehavior", { voter, action });
  state.version++;
  await redis.set("gameState", JSON.stringify(state));
  return state;
}