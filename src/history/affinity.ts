/**
 * @file affinity.ts
 * @description Pure calculation functions to derive track affinity scores and user taste profiles.
 */

import type { TrackSummary, ListenEvent, ListeningProfile } from "./types";

/**
 * Computes a user's affinity score for a specific track.
 * Returns a value between 0.0 and 1.0 (higher = greater affinity).
 * 
 * Formula:
 *   completionSignal = avgCompletionRate^1.5 (non-linear completion weight)
 *   repeatSignal = 1 - 1 / (1 + totalPlays * 0.3) (diminishing return play count signal)
 *   likeSignal = likeCount > 0 ? 0.3 : 0.0 (like bonus)
 *   skipPenalty = (skipCount / totalPlays) * 0.4 (subtracted)
 *   affinityScore = clamp((completionSignal * 0.45) + (repeatSignal * 0.30) + likeSignal - skipPenalty, 0.0, 1.0)
 * 
 * @param {Pick<TrackSummary, "avgCompletionRate" | "totalPlays" | "likeCount" | "skipCount">} summary - Track summary fields.
 * @returns {number} Derived affinity score (0.0 to 1.0).
 */
export const computeAffinityScore = (
  summary: Pick<TrackSummary, "avgCompletionRate" | "totalPlays" | "likeCount" | "skipCount">
): number => {
  const completionSignal = Math.pow(summary.avgCompletionRate || 0, 1.5);
  const repeatSignal = 1 - 1 / (1 + (summary.totalPlays || 0) * 0.3);
  const likeSignal = (summary.likeCount || 0) > 0 ? 0.3 : 0.0;
  const skipPenalty = ((summary.skipCount || 0) / Math.max(summary.totalPlays || 1, 1)) * 0.4;
  
  const raw = completionSignal * 0.45 + repeatSignal * 0.30 + likeSignal - skipPenalty;
  return Math.max(0.0, Math.min(1.0, raw));
};

/**
 * Generates a comprehensive taste profile based on accumulated track summary data.
 * Items with affinityScore < 0.1 are omitted as background noise.
 * 
 * @param {TrackSummary[]} summaries - Collected track play summaries.
 * @param {ListenEvent[]} events - History of all listen events.
 * @returns {ListeningProfile} The rebuilt taste profile vectors.
 */
export const buildListeningProfile = (
  summaries: TrackSummary[],
  events: ListenEvent[]
): ListeningProfile => {
  const relevant = summaries.filter(s => (s.affinityScore || 0) >= 0.1);
  const totalWeight = relevant.reduce((sum, s) => sum + (s.affinityScore || 0), 0) || 1;

  // Genre affinities
  const genreAffinities: Record<string, number> = {};
  for (const s of relevant) {
    const genres = s.genres || [];
    for (const genre of genres) {
      genreAffinities[genre] = (genreAffinities[genre] ?? 0) + s.affinityScore;
    }
  }
  // Normalize genres to 0.0–1.0 range
  const maxGenre = Math.max(...Object.values(genreAffinities), 1);
  for (const g in genreAffinities) {
    genreAffinities[g] /= maxGenre;
  }

  // Artist affinities
  const artistAffinities: Record<string, number> = {};
  for (const s of relevant) {
    if (s.artistId) {
      artistAffinities[s.artistId] = (artistAffinities[s.artistId] ?? 0) + s.affinityScore;
    }
  }
  // Normalize artists to 0.0–1.0 range
  const maxArtist = Math.max(...Object.values(artistAffinities), 1);
  for (const a in artistAffinities) {
    artistAffinities[a] /= maxArtist;
  }

  // Weighted average of numeric audio features
  const avg = (fn: (s: TrackSummary) => number) =>
    relevant.reduce((sum, s) => sum + (fn(s) || 0.5) * (s.affinityScore || 0), 0) / totalWeight;

  // Hourly energy profiles
  const hourlyEnergyProfile: Record<number, number> = {};
  const hourCounts: Record<number, number> = {};
  for (const e of events) {
    const energy = typeof e.energy === "number" ? e.energy : 0.5;
    hourlyEnergyProfile[e.hourOfDay] = (hourlyEnergyProfile[e.hourOfDay] ?? 0) + energy;
    hourCounts[e.hourOfDay] = (hourCounts[e.hourOfDay] ?? 0) + 1;
  }
  for (const h in hourlyEnergyProfile) {
    const hr = Number(h);
    hourlyEnergyProfile[hr] /= hourCounts[hr];
  }

  // Day of week activity counts
  const dayOfWeekActivity: Record<number, number> = {};
  for (const e of events) {
    dayOfWeekActivity[e.dayOfWeek] = (dayOfWeekActivity[e.dayOfWeek] ?? 0) + 1;
  }

  return {
    genreAffinities,
    artistAffinities,
    avgEnergy: avg(s => s.energy),
    avgValence: avg(s => s.valence),
    avgDanceability: avg(s => s.danceability),
    avgAcousticness: avg(s => s.acousticness),
    avgTempo: avg(s => s.tempo || 120),
    hourlyEnergyProfile,
    dayOfWeekActivity,
    totalTracks: relevant.length,
    totalListenedMs: relevant.reduce((sum, s) => sum + (s.totalListenedMs || 0), 0),
    lastUpdated: Date.now(),
  };
};
