/**
 * @file scoring.ts
 * @description Helper functions for calculating user profile affinity metrics and list filters.
 */

import type { Track, UserProfile, RecommendationResult } from "./types.ts";

/**
 * Calculates genre affinity score.
 * Sums matching genre scores from user profile and normalizes by matching count.
 * @param track - target Track
 * @param profile - UserProfile
 * @returns {number} Score in range 0.0 to 1.0
 */
export const scoreGenreAffinity = (track: Track, profile: UserProfile): number => {
  const genres = track.genres || [];
  if (genres.length === 0) return 0.3; // neutral fallback
  
  let scoreSum = 0;
  let matches = 0;

  genres.forEach((genre) => {
    const key = genre.toLowerCase();
    if (profile.topGenres[key] !== undefined) {
      scoreSum += profile.topGenres[key];
      matches++;
    }
  });

  // Blend matched genres score (or default to neutral 0.5)
  const avgMatched = matches > 0 ? scoreSum / matches : 0.5;
  return avgMatched;
};

/**
 * Calculates artist affinity score.
 * Returns the profile value or a default neutral fallback.
 * @param track - target Track
 * @param profile - UserProfile
 * @returns {number} Score in range 0.0 to 1.0
 */
export const scoreArtistAffinity = (track: Track, profile: UserProfile): number => {
  const artistId = track.artistId || track.artist;
  return profile.topArtists[artistId] ?? 0.4;
};

/**
 * Calculates feature distance from user profile averages.
 * Uses Euclidean distance in normalized feature space, inverted so closer = higher score.
 * @param track - target Track
 * @param profile - UserProfile
 * @returns {number} Score in range 0.0 to 1.0
 */
export const scoreAudioFeatureMatch = (track: Track, profile: UserProfile): number => {
  const dEnergy = (track.energy ?? 0.5) - profile.avgEnergy;
  const dValence = (track.valence ?? 0.5) - profile.avgValence;
  const dDance = (track.danceability ?? 0.5) - profile.avgDanceability;
  
  // Normalize tempos (range 60-200 BPM) relative to max bounds
  const tempoTrack = (track.tempo || 120) / 200;
  const tempoProfile = profile.avgTempo / 200;
  const dTempo = tempoTrack - tempoProfile;

  const distance = Math.sqrt(
    dEnergy * dEnergy +
    dValence * dValence +
    dDance * dDance +
    dTempo * dTempo
  );

  // Invert distance to represent affinity match score
  return Math.max(0.01, 1 - distance / 2);
};

/**
 * Computes a recency freshness factor.
 * Deducts weight if track has been played recently.
 * @param track - target Track
 * @param historyMap - Map of trackId -> lastPlayed timestamp
 * @param now - current timestamp
 * @returns {number} multiplier in range 0.1 to 1.0
 */
export const computeFreshnessFactor = (
  track: Track, 
  historyMap: Map<string, number>,
  now = Date.now()
): number => {
  const lastPlayed = historyMap.get(track.id);
  if (!lastPlayed) return 1.0; // never played is fully fresh

  const msSincePlay = now - lastPlayed;
  const hoursSincePlay = msSincePlay / (1000 * 60 * 60);

  if (hoursSincePlay < 1)   return 0.1;  // heavily penalise plays within the last hour
  if (hoursSincePlay < 24)  return 0.3;  // penalise plays within the last day
  if (hoursSincePlay < 168) return 0.65; // moderate penalty within the last week
  if (hoursSincePlay < 720) return 0.85; // slight penalty within the last month
  return 1.0;
};

/**
 * Computes a novelty bonus.
 * Encourages exploration by boosting tracks the user has never played.
 * @param track - target Track
 * @param historyMap - Map of trackId -> lastPlayed timestamp
 * @returns {number} Score bonus (0.05 or 0)
 */
export const computeNoveltyBonus = (track: Track, historyMap: Map<string, number>): number => {
  return historyMap.has(track.id) ? 0.0 : 0.08;
};

/**
 * Computes time-of-day energy affinity.
 * Returns multiplier 0.8–1.2 based on how well the track's energy matches the hour of day.
 * - Morning (6–11): quiet/calm energy (< 0.4)
 * - Afternoon (11–17): standard/lively
 * - Evening (17–22): moderate (0.4–0.7)
 * - Night (22–6): intense (> 0.7) or ambient instrumental (> 0.4)
 */
export const computeTimeOfDayAffinity = (track: Track, hour: number): number => {
  const energy = track.energy ?? 0.5;
  const isInstrumental = (track.instrumentalness ?? 0) > 0.4;

  if (hour >= 6 && hour < 11) {
    // Morning: favors low energy
    return energy < 0.45 ? 1.2 : (energy > 0.7 ? 0.8 : 1.0);
  } else if (hour >= 11 && hour < 17) {
    // Afternoon: favor higher energy
    return energy > 0.6 ? 1.2 : 1.0;
  } else if (hour >= 17 && hour < 22) {
    // Evening: favors moderate energy
    return energy >= 0.4 && energy <= 0.75 ? 1.2 : 0.9;
  } else {
    // Night: favors ambient/low-energy instrumental or very high energy electronic
    if (isInstrumental && energy < 0.4) return 1.2;
    return energy > 0.7 ? 1.15 : (energy > 0.4 ? 0.9 : 1.0);
  }
};

/**
 * Diversity Filter
 * Post-processes a list of sorted recommendation results, capping tracks from the same artist to prevent monopoly.
 * @param results - ranked results list
 * @param maxPerArtist - max allowed track results per artist (default: 2)
 * @returns {RecommendationResult[]} filtered results list
 */
export const applyDiversityFilter = (
  results: RecommendationResult[],
  maxPerArtist = 2
): RecommendationResult[] => {
  const artistCounts = new Map<string, number>();
  const filtered: RecommendationResult[] = [];

  for (const res of results) {
    const artistId = res.track.artistId || res.track.artist;
    const count = artistCounts.get(artistId) ?? 0;

    if (count < maxPerArtist) {
      filtered.push(res);
      artistCounts.set(artistId, count + 1);
    }
  }

  return filtered;
};
