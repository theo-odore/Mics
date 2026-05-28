/**
 * @file profileBuilder.ts
 * @description Compiles and updates user profiles based on historical listening events.
 * Implements exponential recency decay to reflect evolving user tastes.
 */

import type { ListenEvent, Track, UserProfile } from "./types.ts";

/**
 * Computes the positive/negative weight of a specific listening event.
 * Completion rate serves as the baseline, likes double the weight, and skips restrict it to 10%.
 * @param event - ListenEvent payload
 * @returns {number} Computed weight in range 0.0 to 2.0
 */
export const computeEventWeight = (event: ListenEvent): number => {
  let weight = event.completionRate; // base rate: 0.0 to 1.0
  if (event.likedDuring) {
    weight *= 2.0; // likes double the positive signal weight
  }
  if (event.skipped) {
    weight *= 0.1; // skips penalize weight value down to 10%
  }
  return Math.min(weight, 2.0); // cap total weight contribution at 2.0
};

/**
 * Applies time-decay factor (0.98 per day) to existing genre and artist scores.
 * Long-inactive tastes decay back toward a neutral 0.5 baseline to accommodate taste shifts.
 * @param profile - existing UserProfile
 * @param days - float count of days elapsed since last update
 * @returns {UserProfile} time-decayed UserProfile
 */
export const applyTimeDecay = (profile: UserProfile, days: number): UserProfile => {
  const decayFactor = Math.pow(0.98, days);
  const decayedGenres: Record<string, number> = {};
  const decayedArtists: Record<string, number> = {};

  // Shift genre scores toward neutral 0.5 using the decay factor
  for (const [genre, score] of Object.entries(profile.topGenres)) {
    decayedGenres[genre] = 0.5 + (score - 0.5) * decayFactor;
  }

  // Shift artist scores toward neutral 0.5
  for (const [artistId, score] of Object.entries(profile.topArtists)) {
    decayedArtists[artistId] = 0.5 + (score - 0.5) * decayFactor;
  }

  return {
    ...profile,
    topGenres: decayedGenres,
    topArtists: decayedArtists,
  };
};

/**
 * Builds and updates the UserProfile state from historical listen events.
 * @param events - complete array of ListenEvent logs
 * @param tracks - lookup catalog of Track items mapped by ID
 * @param existing - existing UserProfile or null
 * @returns {UserProfile} updated UserProfile
 */
export const buildUserProfile = (
  events: ListenEvent[],
  tracks: Record<string, Track>,
  existing: UserProfile | null
): UserProfile => {
  const now = Date.now();
  let profile: UserProfile = existing
    ? { ...existing }
    : {
        topGenres: {},
        topArtists: {},
        avgTempo: 120,
        avgEnergy: 0.5,
        avgValence: 0.5,
        avgDanceability: 0.5,
        totalPlayTime: 0,
        sessionCount: 0,
        lastUpdated: now,
      };

  // Apply time decay if updating an existing profile
  if (existing) {
    const elapsedDays = (now - existing.lastUpdated) / (1000 * 60 * 60 * 24);
    if (elapsedDays > 0.05) { // decay if at least ~1 hour has passed
      profile = applyTimeDecay(profile, elapsedDays);
    }
  }

  profile.lastUpdated = now;
  profile.sessionCount += events.length;

  let totalWeight = 0;
  let weightedTempo = 0;
  let weightedEnergy = 0;
  let weightedValence = 0;
  let weightedDance = 0;

  // Process all new listening events
  events.forEach((event) => {
    const track = tracks[event.trackId];
    if (!track) return;

    const weight = computeEventWeight(event);
    profile.totalPlayTime += event.durationListenedMs;
    totalWeight += weight;

    // Accumulate weighted audio features
    weightedTempo += (track.tempo || 120) * weight;
    weightedEnergy += (track.energy || 0.5) * weight;
    weightedValence += (track.valence || 0.5) * weight;
    weightedDance += (track.danceability || 0.5) * weight;

    // Update artist affinity scores
    const artistId = track.artistId || track.artist;
    const currentArtistScore = profile.topArtists[artistId] ?? 0.5;
    // Boost artist score if track is completed/liked, penalize if skipped
    const artistShift = event.skipped ? -0.15 : (event.likedDuring ? 0.25 : 0.08);
    profile.topArtists[artistId] = Math.max(0.01, Math.min(1.0, currentArtistScore + artistShift * weight));

    // Update genre affinity scores
    const genres = track.genres && track.genres.length > 0 ? track.genres : ["unknown"];
    genres.forEach((genre) => {
      const currentGenreScore = profile.topGenres[genre] ?? 0.5;
      const genreShift = event.skipped ? -0.10 : (event.likedDuring ? 0.20 : 0.05);
      profile.topGenres[genre] = Math.max(0.01, Math.min(1.0, currentGenreScore + genreShift * weight));
    });
  });

  // Blend new session averages with existing profile averages
  if (totalWeight > 0) {
    const sessionAvgTempo = weightedTempo / totalWeight;
    const sessionAvgEnergy = weightedEnergy / totalWeight;
    const sessionAvgValence = weightedValence / totalWeight;
    const sessionAvgDance = weightedDance / totalWeight;

    // Blend: 70% historical profile weight, 30% new session weight
    const blendFactor = existing ? 0.7 : 0;
    profile.avgTempo = profile.avgTempo * blendFactor + sessionAvgTempo * (1 - blendFactor);
    profile.avgEnergy = profile.avgEnergy * blendFactor + sessionAvgEnergy * (1 - blendFactor);
    profile.avgValence = profile.avgValence * blendFactor + sessionAvgValence * (1 - blendFactor);
    profile.avgDanceability = profile.avgDanceability * blendFactor + sessionAvgDance * (1 - blendFactor);
  }

  return profile;
};
