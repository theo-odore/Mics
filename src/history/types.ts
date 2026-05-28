/**
 * @file types.ts
 * @description Type definitions for tracking, persisting, and deriving user listening history.
 */

/**
 * A single listen event — recorded once per track interaction.
 * Created when a track starts playing. Updated as the user listens.
 * Finalized (frozen) when the track ends, is skipped, or app closes.
 */
export interface ListenEvent {
  id: string;                    // uuid — unique per event
  trackId: string;               // provider track ID
  title: string;                 // stored denormalized for fast UI rendering
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  artwork: string;               // artwork URL — stored so Listen Again renders without re-fetching
  genres: string[];
  energy: number;                // 0.0–1.0
  valence: number;               // 0.0–1.0 (sad → happy)
  danceability: number;          // 0.0–1.0
  acousticness: number;          // 0.0–1.0
  tempo: number;                 // BPM

  startedAt: number;             // Date.now() when playback began
  endedAt: number | null;        // Date.now() when finalized, null if still playing
  durationMs: number;            // total track duration
  listenedMs: number;            // actual ms the user heard (pause time excluded)
  completionRate: number;        // listenedMs / durationMs, 0.0–1.0
  
  skipped: boolean;              // true if user manually skipped before 80% completion
  skippedAtMs: number | null;    // ms into the track when skipped
  likedDuring: boolean;          // true if user liked the track during this play
  addedToQueueDuring: boolean;   // true if user added to queue/playlist during play
  
  context: ListenContext;        // where playback was triggered from
  source: string;                // plugin/provider name e.g. "youtube-music"

  hourOfDay: number;             // 0–23, hour when this listen started
  dayOfWeek: number;             // 0–6, 0 = Sunday
}

export type ListenContext =
  | "home_listen_again"
  | "home_quick_picks"
  | "home_mixed_for_you"
  | "home_new_releases"
  | "home_forgotten_favorites"
  | "home_mood"
  | "search_result"
  | "artist_page"
  | "album_page"
  | "playlist"
  | "queue"
  | "speed_dial"
  | "autoplay"
  | "unknown";

/**
 * A compact summary of a track distilled from its listen events.
 * Used for fast rendering of Listen Again, Quick Picks, and influence scoring.
 * Recomputed from raw events whenever new events are added.
 */
export interface TrackSummary {
  trackId: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  artwork: string;
  genres: string[];
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
  tempo: number;

  totalPlays: number;
  totalListenedMs: number;
  avgCompletionRate: number;      // average across all events for this track
  lastPlayedAt: number;           // most recent startedAt
  firstPlayedAt: number;
  likeCount: number;              // how many times liked across all events
  skipCount: number;
  isLiked: boolean;               // current like state (from library)

  // Derived affinity score — how much does this user love this track?
  // Recomputed each time summaries are rebuilt
  affinityScore: number;          // 0.0–1.0
}

/**
 * The user's listening profile — derived from all TrackSummaries.
 * Represents taste as numeric vectors for fast similarity scoring.
 */
export interface ListeningProfile {
  // Genre affinities — genre string → score 0.0–1.0
  genreAffinities: Record<string, number>;
  // Artist affinities — artistId → score 0.0–1.0
  artistAffinities: Record<string, number>;
  // Audio feature averages (weighted by affinityScore)
  avgEnergy: number;
  avgValence: number;
  avgDanceability: number;
  avgAcousticness: number;
  avgTempo: number;
  // Time-of-day preferences — hour (0–23) → avg energy listened at that hour
  hourlyEnergyProfile: Record<number, number>;
  // Day-of-week activity — 0–6 → total listens
  dayOfWeekActivity: Record<number, number>;
  // Total stats
  totalTracks: number;
  totalListenedMs: number;
  lastUpdated: number;
}

/**
 * Album summary derived from track summaries.
 */
export interface AlbumSummary {
  albumId: string;
  album: string;
  artist: string;
  artistId: string;
  artwork: string;
  trackCount: number;
  lastPlayedAt: number;
  score: number;
}

/**
 * Inputs passed to recommendation algorithms to influence sections.
 */
export interface SectionInfluenceParams {
  seedTrackIds: string[];
  boostedGenres: string[];
  boostedArtistIds: string[];
  targetEnergy: number;
  targetValence: number;
  freshnessCutoffMs: number;
  excludeTrackIds: string[];
}
