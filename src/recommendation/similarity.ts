/**
 * @file similarity.ts
 * @description Pure functions for calculating content-based similarity between tracks.
 * Combines Jaccard overlap on genres and weighted Cosine similarity on audio features.
 */

import type { Track } from "./types.ts";

/**
 * Computes the weighted cosine similarity between two track audio feature vectors.
 * Feature Vector: [energy, valence, danceability, acousticness, instrumentalness, normalizedTempo]
 * Weights: energy * 1.5, valence * 1.2, danceability * 1.0, acousticness * 0.8, instrumentalness * 0.6, tempo * 0.9
 * @param trackA - Left track
 * @param trackB - Right track
 * @returns {number} Score in range 0.0 (unlike) to 1.0 (identical)
 */
export const computeAudioSimilarity = (trackA: Track, trackB: Track): number => {
  const weights = [1.5, 1.2, 1.0, 0.8, 0.6, 0.9];
  
  // Normalize tempos (range 60-200 BPM) relative to max bounds
  const tempoA = (trackA.tempo || 120) / 200;
  const tempoB = (trackB.tempo || 120) / 200;

  const vecA = [
    trackA.energy ?? 0.5,
    trackA.valence ?? 0.5,
    trackA.danceability ?? 0.5,
    trackA.acousticness ?? 0.1,
    trackA.instrumentalness ?? 0.0,
    tempoA,
  ];

  const vecB = [
    trackB.energy ?? 0.5,
    trackB.valence ?? 0.5,
    trackB.danceability ?? 0.5,
    trackB.acousticness ?? 0.1,
    trackB.instrumentalness ?? 0.0,
    tempoB,
  ];

  // Weighted dot product
  let dot = 0;
  let sqMagA = 0;
  let sqMagB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const w = weights[i];
    const valA = vecA[i] * w;
    const valB = vecB[i] * w;
    dot += valA * valB;
    sqMagA += valA * valA;
    sqMagB += valB * valB;
  }

  const magA = Math.sqrt(sqMagA);
  const magB = Math.sqrt(sqMagB);

  return magA > 0 && magB > 0 ? dot / (magA * magB) : 0;
};

/**
 * Computes Jaccard similarity score between genre tags of two tracks.
 * Formula: |intersection| / |union|
 * @param trackA - Left track
 * @param trackB - Right track
 * @returns {number} Overlap ratio in range 0.0 to 1.0
 */
export const computeGenreOverlap = (trackA: Track, trackB: Track): number => {
  const genresA = trackA.genres || [];
  const genresB = trackB.genres || [];

  if (genresA.length === 0 && genresB.length === 0) return 0.5; // neutral fallback
  if (genresA.length === 0 || genresB.length === 0) return 0;

  const setA = new Set(genresA.map(g => g.toLowerCase()));
  const setB = new Set(genresB.map(g => g.toLowerCase()));

  const intersection = [...setA].filter((g) => setB.has(g)).length;
  const union = new Set([...setA, ...setB]).size;

  return union > 0 ? intersection / union : 0;
};

/**
 * Computes a combined structural similarity score between two tracks.
 * Weights: Audio Cosine Similarity (50%), Genre Overlap (30%), Same Artist (20%)
 * @param trackA - Left track
 * @param trackB - Right track
 * @returns {number} Score in range 0.0 to 1.0
 */
export const computeTrackSimilarity = (trackA: Track, trackB: Track): number => {
  const audioScore = computeAudioSimilarity(trackA, trackB) * 0.50;
  const genreScore = computeGenreOverlap(trackA, trackB) * 0.30;
  
  const isSameArtist = trackA.artistId && trackB.artistId 
    ? trackA.artistId === trackB.artistId 
    : trackA.artist.toLowerCase() === trackB.artist.toLowerCase();
    
  const artistScore = (isSameArtist ? 1.0 : 0.0) * 0.20;

  return audioScore + genreScore + artistScore;
};
