/**
 * @file listenAgain.ts
 * @description Ranking algorithms to extract the top tracks and albums from listening history.
 */

import type { TrackSummary, AlbumSummary } from "./types";

/**
 * Returns a list of recently listened tracks prioritized by recency and user affinity.
 * Filters out tracks played in the last 20 minutes or with low engagement metrics.
 * Limits recommendations to a maximum of 2 tracks per artist to keep the feed diverse.
 * 
 * @param {TrackSummary[]} summaries - Raw track summary stats.
 * @param {number} [count=12] - Maximum number of tracks to return.
 * @param {number} [nowMs=Date.now()] - Target timestamp (injectable for testing).
 * @returns {TrackSummary[]} Ranked list of track summaries.
 */
export const getListenAgainTracks = (
  summaries: TrackSummary[],
  count: number = 12,
  nowMs: number = Date.now()
): TrackSummary[] => {
  const twentyMinMs = 20 * 60 * 1000;

  // Filter out:
  // 1. Played in the last 20 minutes
  // 2. Average completion rate < 15%
  // 3. Skipped more than 70% of the plays
  const filtered = summaries.filter(s =>
    s.lastPlayedAt < nowMs - twentyMinMs &&
    (s.avgCompletionRate || 0) >= 0.15 &&
    ((s.skipCount || 0) / Math.max(s.totalPlays || 1, 1)) < 0.7
  );

  // Score tracks based on recency (55%) and affinity (45%)
  const scored = filtered.map(s => {
    const hoursSince = (nowMs - s.lastPlayedAt) / (1000 * 60 * 60);
    const recencyScore = 1 / (hoursSince / 24 + 1); // 24h decay curve
    const finalScore = recencyScore * 0.55 + (s.affinityScore || 0) * 0.45;
    return { summary: s, score: finalScore };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Diversity pass — max 2 per artist
  const artistCount: Record<string, number> = {};
  const result: TrackSummary[] = [];
  for (const { summary } of scored) {
    if (result.length >= count) break;
    const currentArtistCount = artistCount[summary.artistId] ?? 0;
    if (currentArtistCount < 2) {
      result.push(summary);
      artistCount[summary.artistId] = currentArtistCount + 1;
    }
  }

  return result;
};

/**
 * Returns a list of recently listened albums compiled from track history.
 * Groups tracks by albumId and ranks them by combined recency and affinity metrics.
 * 
 * @param {TrackSummary[]} summaries - Raw track summaries.
 * @param {number} [count=8] - Maximum number of albums to return.
 * @returns {AlbumSummary[]} Ranked list of album summaries.
 */
export const getListenAgainAlbums = (
  summaries: TrackSummary[],
  count: number = 8
): AlbumSummary[] => {
  // Group tracks by albumId and keep track of the most recent play timestamp
  const albumMap: Record<string, { tracks: TrackSummary[]; lastPlayedAt: number }> = {};
  for (const s of summaries) {
    const albumKey = s.albumId || "single";
    if (!albumMap[albumKey]) {
      albumMap[albumKey] = { tracks: [], lastPlayedAt: 0 };
    }
    albumMap[albumKey].tracks.push(s);
    albumMap[albumKey].lastPlayedAt = Math.max(albumMap[albumKey].lastPlayedAt, s.lastPlayedAt);
  }

  // Calculate scores for each album and map to AlbumSummary structure
  const albums = Object.entries(albumMap).map(([albumId, { tracks, lastPlayedAt }]) => {
    const avgAffinity = tracks.reduce((sum, t) => sum + (t.affinityScore || 0), 0) / tracks.length;
    const hoursSince = (Date.now() - lastPlayedAt) / (1000 * 60 * 60);
    const recency = 1 / (hoursSince / 24 + 1);
    
    return {
      albumId,
      album: tracks[0].album || "Single",
      artist: tracks[0].artist,
      artistId: tracks[0].artistId,
      artwork: tracks[0].artwork || "",
      trackCount: tracks.length,
      lastPlayedAt,
      score: recency * 0.55 + avgAffinity * 0.45,
    };
  });

  // Sort descending by score
  albums.sort((a, b) => b.score - a.score);
  return albums.slice(0, count);
};
