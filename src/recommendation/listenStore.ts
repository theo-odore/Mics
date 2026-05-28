/**
 * @file listenStore.ts
 * @description Manages persistence of ListenEvents in localStorage.
 * Automatically triggers user profile rebuilding routines on a regular interval.
 */

import type { ListenEvent, Track } from "./types.ts";
import { buildUserProfile } from "./profileBuilder.ts";

const HISTORY_KEY = "mics_listen_history_v2";
const PROFILE_KEY = "mics_user_profile_v2";
const MAX_HISTORY_LEN = 500;

/**
 * Retrieves the stored listening history logs.
 * @returns {ListenEvent[]} Array of ListenEvents
 */
export const getListenHistory = (): ListenEvent[] => {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem(HISTORY_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to parse listen history:", e);
    }
  }
  return [];
};

/**
 * Clears the stored listening logs and profile data.
 */
export const clearListenHistory = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(PROFILE_KEY);
};

/**
 * Compiles a lookup mapping trackId -> last played timestamp.
 * @returns {Map<string, number>} mapping of trackId to last played timestamp
 */
export const getHistoryMap = (): Map<string, number> => {
  const history = getListenHistory();
  const map = new Map<string, number>();
  history.forEach((event) => {
    const prev = map.get(event.trackId) ?? 0;
    map.set(event.trackId, Math.max(prev, event.startedAt));
  });
  return map;
};

/**
 * Records a new listen event.
 * Automatically saves to local storage and updates user profile values.
 * @param event - ListenEvent payload
 * @param catalogTracks - Complete lookup catalog of tracks mapping trackId -> Track
 */
export const recordListenEvent = (event: ListenEvent, catalogTracks: Record<string, Track>): void => {
  if (typeof window === "undefined") return;

  const history = getListenHistory();
  history.unshift(event); // prepend to have newest first

  // Prune history to limit storage footprint
  const pruned = history.slice(0, MAX_HISTORY_LEN);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(pruned));

  // Retrieve existing user profile
  let existingProfile = null;
  const savedProfile = localStorage.getItem(PROFILE_KEY);
  if (savedProfile) {
    try {
      existingProfile = JSON.parse(savedProfile);
    } catch (e) {
      console.warn("Failed to parse user profile:", e);
    }
  }

  // Rebuild user profile with the new event
  const updatedProfile = buildUserProfile([event], catalogTracks, existingProfile);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(updatedProfile));
};
