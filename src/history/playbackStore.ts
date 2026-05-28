/**
 * @file playbackStore.ts
 * @description Coordinates play/pause, track transitions, and library additions between React UI and tracking singleton.
 */

import type { Track } from "../recommendation/types";
import type { ListenContext } from "./types";

export interface PersistedPlayerState {
  track: {
    id: string;
    title: string;
    artist: string;
    artistId: string;
    album: string;
    albumId: string;
    artwork: string;        // URL — stored so artwork renders instantly
    durationMs: number;
    sourceId: string;       // provider-specific playback ID
    source: string;         // plugin name e.g. "youtube-music"
  } | null;
  positionMs: number;       // exact ms when last saved
  savedAt: number;          // Date.now() when state was saved
  queue: Array<{
    id: string;
    title: string;
    artist: string;
    artwork: string;
    durationMs: number;
    sourceId: string;
    source: string;
  }>;
  queueIndex: number;       // index of active track in queue
  volume: number;           // 0.0–1.0
  shuffle: boolean;
  repeat: "off" | "one" | "all";
  version: number;          // schema version, currently 1
}

type ListenerMap = {
  trackChange: ((track: Track | null) => void)[];
  playStateChange: ((isPlaying: boolean) => void)[];
  likeToggle: ((trackId: string, isLiked: boolean) => void)[];
  positionChange: ((positionMs: number) => void)[];
  volumeChange: ((volume: number) => void)[];
  shuffleChange: ((shuffle: boolean) => void)[];
  repeatChange: ((repeat: "off" | "one" | "all") => void)[];
  queueChange: ((queue: Track[]) => void)[];
};

/**
 * PlaybackStore
 * Pub/Sub class enabling low-coupling playback state updates.
 */
export class PlaybackStore {
  private listeners: ListenerMap = {
    trackChange: [],
    playStateChange: [],
    likeToggle: [],
    positionChange: [],
    volumeChange: [],
    shuffleChange: [],
    repeatChange: [],
    queueChange: [],
  };
  private currentContext: ListenContext = "unknown";

  // Active playback variables
  public currentTrack: Track | null = null;
  public queue: Track[] = [];
  public queueIndex: number = -1;
  public positionMs: number = 0;
  public volume: number = 1.0;
  public shuffle: boolean = false;
  public repeat: "off" | "one" | "all" = "off";
  public isPlaying: boolean = false;
  public isRestored: boolean = false;

  /**
   * Initializes the store variables from a loaded localStorage state.
   */
  public initFromSavedState(saved: PersistedPlayerState): void {
    if (!saved || !saved.track) return;
    
    // Map persisted track back to the Track model
    this.currentTrack = {
      id: saved.track.id,
      title: saved.track.title,
      artist: saved.track.artist,
      artistId: saved.track.artistId,
      album: saved.track.album,
      albumId: saved.track.albumId,
      genres: [],
      tempo: 120,
      energy: 0.5,
      valence: 0.5,
      danceability: 0.5,
      acousticness: 0.5,
      instrumentalness: 0,
      durationMs: saved.track.durationMs,
      releaseYear: 2024,
      popularity: 50,
      playCount: 0,
      lastPlayedAt: saved.savedAt,
      likedAt: null,
      addedToLibraryAt: null,
      thumbnail: saved.track.artwork,
      source: saved.track.source,
      sourceId: saved.track.sourceId,
    } as any;

    // Map persisted queue back to Track models
    this.queue = saved.queue.map(item => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      artistId: item.id.toLowerCase().replace(/\s+/g, '-'),
      album: "Single",
      albumId: "single",
      genres: [],
      tempo: 120,
      energy: 0.5,
      valence: 0.5,
      danceability: 0.5,
      acousticness: 0.5,
      instrumentalness: 0,
      durationMs: item.durationMs,
      releaseYear: 2024,
      popularity: 50,
      playCount: 0,
      lastPlayedAt: null,
      likedAt: null,
      addedToLibraryAt: null,
      thumbnail: item.artwork,
      source: item.source,
      sourceId: item.sourceId,
    } as any));

    this.queueIndex = saved.queueIndex;
    this.positionMs = saved.positionMs;
    this.volume = saved.volume;
    this.shuffle = saved.shuffle;
    this.repeat = saved.repeat;
    this.isPlaying = false;       // ALWAYS start paused
    this.isRestored = true;        // flag — used to show "Resume" badge
  }

  /**
   * Retrieves the current tracking context.
   * @returns {ListenContext} Current listen context.
   */
  public getContext(): ListenContext {
    return this.currentContext;
  }

  /**
   * Sets the current tracking context.
   * @param {ListenContext} context - The context playback started from.
   */
  public setContext(context: ListenContext): void {
    this.currentContext = context;
  }

  /**
   * Subscribes to a playback state event.
   * @param {K} event - Event name.
   * @param {ListenerMap[K][number]} callback - The callback function.
   * @returns {() => void} Unsubscribe function.
   */
  public subscribe<K extends keyof ListenerMap>(event: K, callback: ListenerMap[K][number]): () => void {
    this.listeners[event].push(callback as any);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback) as any;
    };
  }

  /**
   * Triggers the trackChange event.
   * @param {Track | null} track - The active track.
   * @param {ListenContext} [context="unknown"] - Context of the play trigger.
   */
  public triggerTrackChange(track: Track | null, context: ListenContext = "unknown"): void {
    this.currentTrack = track;
    this.currentContext = context;
    this.listeners.trackChange.forEach(cb => cb(track));
  }

  /**
   * Triggers the playStateChange event.
   * @param {boolean} isPlaying - Playing state of audio player.
   */
  public triggerPlayStateChange(isPlaying: boolean): void {
    this.isPlaying = isPlaying;
    this.listeners.playStateChange.forEach(cb => cb(isPlaying));
  }

  /**
   * Triggers the likeToggle event.
   * @param {string} trackId - Track identifier.
   * @param {boolean} isLiked - Current like status in library.
   */
  public triggerLikeToggle(trackId: string, isLiked: boolean): void {
    this.listeners.likeToggle.forEach(cb => cb(trackId, isLiked));
  }

  /**
   * Triggers the positionChange event.
   * @param {number} positionMs - The current position in milliseconds.
   */
  public triggerPositionChange(positionMs: number): void {
    this.positionMs = positionMs;
    this.listeners.positionChange.forEach(cb => cb(positionMs));
  }

  /**
   * Triggers the volumeChange event.
   * @param {number} volume - Volume level (0.0 - 1.0).
   */
  public triggerVolumeChange(volume: number): void {
    this.volume = volume;
    this.listeners.volumeChange.forEach(cb => cb(volume));
  }

  /**
   * Triggers the shuffleChange event.
   * @param {boolean} shuffle - True if shuffle is active.
   */
  public triggerShuffleChange(shuffle: boolean): void {
    this.shuffle = shuffle;
    this.listeners.shuffleChange.forEach(cb => cb(shuffle));
  }

  /**
   * Triggers the repeatChange event.
   * @param {"off" | "one" | "all"} repeat - The active repeat mode.
   */
  public triggerRepeatChange(repeat: "off" | "one" | "all"): void {
    this.repeat = repeat;
    this.listeners.repeatChange.forEach(cb => cb(repeat));
  }

  /**
   * Triggers the queueChange event.
   * @param {Track[]} queue - The updated queue.
   */
  public triggerQueueChange(queue: Track[], queueIndex: number): void {
    this.queue = queue;
    this.queueIndex = queueIndex;
    this.listeners.queueChange.forEach(cb => cb(queue));
  }
}

export const playbackStore = new PlaybackStore();

