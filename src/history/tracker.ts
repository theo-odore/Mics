/**
 * @file tracker.ts
 * @description Listens to playback events in real time and compiles structured listen events.
 */

import type { PlaybackStore } from "./playbackStore";
import type { HistoryStore } from "./store";
import type { ListenEvent, ListenContext } from "./types";
import type { Track } from "../recommendation/types";

/**
 * ListenTracker
 * Singleton class tracking play session times and recording listen events.
 */
export class ListenTracker {
  private currentEvent: ListenEvent | null = null;
  private listenedMsAccumulator: number = 0;
  private lastTickAt: number | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initializes the tracker, registering listeners on playbackStore and tab close events.
   * @param {PlaybackStore} playbackStore - The global playback store interface.
   * @param {HistoryStore} historyStore - The history persistence store.
   */
  public init(playbackStore: PlaybackStore, historyStore: HistoryStore): void {
    // Subscribe to track changes
    playbackStore.subscribe("trackChange", (newTrack: Track | null) => {
      if (this.currentEvent) {
        this.finalizeCurrentEvent(historyStore);
      }
      if (newTrack) {
        this.openNewEvent(newTrack, playbackStore.getContext());
      }
    });

    // Subscribe to play/pause to accumulate active play time
    playbackStore.subscribe("playStateChange", (isPlaying: boolean) => {
      if (isPlaying) {
        this.startTicking();
      } else {
        this.pauseTicking();
      }
    });

    // Subscribe to like updates
    playbackStore.subscribe("likeToggle", (trackId: string, isLiked: boolean) => {
      if (this.currentEvent && this.currentEvent.trackId === trackId && isLiked) {
        this.currentEvent.likedDuring = true;
      }
    });

    // Finalize on tab closes or page navigates away
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        if (this.currentEvent) {
          this.finalizeCurrentEvent(historyStore);
        }
      });
      window.addEventListener("pagehide", () => {
        if (this.currentEvent) {
          this.finalizeCurrentEvent(historyStore);
        }
      });
    }
  }

  /**
   * Creates a new listen event instance when a song starts.
   * @param {Track} track - Track that started playing.
   * @param {ListenContext} context - Page environment where play was clicked.
   */
  private openNewEvent(track: Track, context: ListenContext): void {
    const now = Date.now();
    const safeUUID = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15) + now.toString(36);

    this.currentEvent = {
      id: safeUUID,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      artistId: track.artistId,
      album: track.album || "Single",
      albumId: track.albumId || "single",
      artwork: track.thumbnail || "",
      genres: track.genres || [],
      energy: track.energy || 0.5,
      valence: track.valence || 0.5,
      danceability: track.danceability || 0.5,
      acousticness: track.acousticness || 0.5,
      tempo: track.tempo || 120,
      startedAt: now,
      endedAt: null,
      durationMs: track.durationMs || 200000,
      listenedMs: 0,
      completionRate: 0,
      skipped: false,
      skippedAtMs: null,
      likedDuring: false,
      addedToQueueDuring: false,
      context,
      source: (track as any).source || "youtube-music",
      hourOfDay: new Date(now).getHours(),
      dayOfWeek: new Date(now).getDay(),
    };
    this.listenedMsAccumulator = 0;
    this.lastTickAt = now;
    this.startTicking();
  }

  /**
   * Starts or resumes periodic update intervals.
   */
  private startTicking(): void {
    if (this.tickInterval) return;
    this.lastTickAt = Date.now();
    this.tickInterval = setInterval(() => {
      if (!this.currentEvent) return;
      const now = Date.now();
      const delta = now - (this.lastTickAt ?? now);
      this.listenedMsAccumulator += delta;
      this.currentEvent.listenedMs = this.listenedMsAccumulator;
      this.currentEvent.completionRate = Math.min(
        this.listenedMsAccumulator / this.currentEvent.durationMs,
        1.0
      );
      this.lastTickAt = now;
    }, 5000);
  }

  /**
   * Suspends periodic time accumulator ticks and flushes pending deltas.
   */
  private pauseTicking(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.lastTickAt && this.currentEvent) {
      const delta = Date.now() - this.lastTickAt;
      this.listenedMsAccumulator += delta;
      this.currentEvent.listenedMs = this.listenedMsAccumulator;
      this.currentEvent.completionRate = Math.min(
        this.listenedMsAccumulator / this.currentEvent.durationMs,
        1.0
      );
    }
    this.lastTickAt = null;
  }

  /**
   * Finalizes the current play session, stamps completion rate, and logs skip flag if skipped under 80%.
   * @param {HistoryStore} historyStore - The history persistence store.
   */
  private finalizeCurrentEvent(historyStore: HistoryStore): void {
    if (!this.currentEvent) return;
    this.pauseTicking();
    const event = this.currentEvent;
    event.endedAt = Date.now();
    event.completionRate = Math.min(event.listenedMs / event.durationMs, 1.0);
    
    // Only mark as skipped if less than 80% complete
    if (event.completionRate < 0.8) {
      event.skipped = true;
      event.skippedAtMs = event.listenedMs;
    }
    
    historyStore.addEvent(event);
    this.currentEvent = null;
    this.listenedMsAccumulator = 0;
  }
}

export const listenTracker = new ListenTracker();
