/**
 * @file homeInfluence.ts
 * @description Generates parameters from listening history to steer feed and playlist recommendations.
 */

import type { ListeningProfile, TrackSummary, SectionInfluenceParams } from "./types";
import type { Track as CatalogTrack } from "../recommendation/types";

/**
 * Returns parameters based on listen history for personalizing feed items.
 * 
 * @param {ListeningProfile} profile - The user listening profile.
 * @param {TrackSummary[]} summaries - The track summaries.
 * @param {number} [nowMs=Date.now()] - Target timestamp.
 * @returns {SectionInfluenceParams} Personalization steer parameters.
 */
export const getSectionInfluenceParams = (
  profile: ListeningProfile,
  summaries: TrackSummary[],
  nowMs: number = Date.now()
): SectionInfluenceParams => {
  const hour = new Date(nowMs).getHours();

  // Seed tracks: highest affinity tracks not played in the last 24 hours
  const seedTrackIds = summaries
    .filter(s => s.lastPlayedAt < nowMs - 24 * 60 * 60 * 1000)
    .sort((a, b) => (b.affinityScore || 0) - (a.affinityScore || 0))
    .slice(0, 5)
    .map(s => s.trackId);

  // Top 3 genres by profile affinity
  const boostedGenres = Object.entries(profile.genreAffinities || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([genre]) => genre);

  // Top 5 artists by profile affinity
  const boostedArtistIds = Object.entries(profile.artistAffinities || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([artistId]) => artistId);

  // Target energy by hour (user profile or default)
  const targetEnergy = profile.hourlyEnergyProfile?.[hour] ?? defaultEnergyForHour(hour);

  // Exclude tracks played in the last 2 hours (to avoid high repetition)
  const excludeTrackIds = summaries
    .filter(s => s.lastPlayedAt >= nowMs - 2 * 60 * 60 * 1000)
    .map(s => s.trackId);

  return {
    seedTrackIds,
    boostedGenres,
    boostedArtistIds,
    targetEnergy,
    targetValence: profile.avgValence || 0.5,
    freshnessCutoffMs: 2 * 60 * 60 * 1000,
    excludeTrackIds,
  };
};

/**
 * Fallback energy levels for various times of day.
 * 
 * @param {number} hour - Hour of the day (0-23).
 * @returns {number} Default target energy (0.0-1.0).
 */
const defaultEnergyForHour = (hour: number): number => {
  if (hour >= 6 && hour < 11) return 0.35; // morning — gentle
  if (hour >= 11 && hour < 17) return 0.55; // afternoon — moderate
  if (hour >= 17 && hour < 22) return 0.65; // evening — engaging
  return 0.75;                              // late night — intense or ambient
};

/**
 * Scores a catalog track against the user taste profile and influence parameters.
 * Returns a boost coefficient between 0.0 and 1.0.
 * 
 * Formula:
 *   genreBoost = average affinity score of matching genres * 0.35
 *   artistBoost = artist affinity * 0.30
 *   energyMatch = (1 - absolute difference in energy) * 0.20
 *   valenceMatch = (1 - absolute difference in valence) * 0.15
 * 
 * @param {CatalogTrack} track - Catalog track to evaluate.
 * @param {SectionInfluenceParams} params - Derived section parameters.
 * @param {ListeningProfile} profile - Current user listening profile.
 * @returns {number} Boost score (0.0 to 1.0).
 */
export const scoreTrackAgainstHistory = (
  track: CatalogTrack,
  params: SectionInfluenceParams,
  profile: ListeningProfile
): number => {
  const genres = track.genres || [];
  const genreBoost = genres.reduce((sum, g) =>
    sum + (profile.genreAffinities?.[g] ?? 0), 0
  ) / Math.max(genres.length, 1) * 0.35;

  const artistBoost = (profile.artistAffinities?.[track.artistId] ?? 0) * 0.30;

  const energyMatch = (1 - Math.abs((track.energy ?? 0.5) - params.targetEnergy)) * 0.20;
  const valenceMatch = (1 - Math.abs((track.valence ?? 0.5) - params.targetValence)) * 0.15;

  return Math.max(0.0, Math.min(1.0, genreBoost + artistBoost + energyMatch + valenceMatch));
};
