import cron from 'node-cron';
import { getDefaultState, simulateEvent } from './simulation.js';
import type { Redis } from '@devvit/public-api';

/**
 * Example helper to get a Redis instance.
 * Adjust this based on your environment.
 */
async function getRedisInstance(): Promise<Redis> {
  // This is a placeholder. In a real Devvit environment,
  // you might have a globally available Redis client.
  // For example, if you're running in the same context as main.tsx,
  // you could export your Redis instance from a shared module.
  // Here we assume that there is a function to retrieve it.
  const redis: Redis = await (global as any).devvitRedis;
  return redis;
}

/**
 * Runs the scheduled event.
 */
async function runScheduledEvent() {
  try {
    const redis = await getRedisInstance();
    let storedState = await redis.get('gameState');
    let state;
    if (storedState) {
      state = JSON.parse(storedState);
    } else {
      state = getDefaultState();
    }
    const updatedState = await simulateEvent(redis, state);
    console.log("Scheduled event triggered. Updated game state:", updatedState);
  } catch (error) {
    console.error("Error running scheduled event:", error);
  }
}

/**
 * Schedule the simulateEvent function twice a week.
 * 
 * This cron expression "0 12 * * Tue,Fri" runs at 12:00 PM on Tuesday and Friday.
 * Adjust the schedule as needed.
 */
cron.schedule('0 12 * * Tue,Fri', runScheduledEvent);

console.log("Scheduler for simulateEvent is set up to run twice a week.");