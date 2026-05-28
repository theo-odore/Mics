/**
 * @file store.ts
 * @description Manages persistence of ListenEvents, TrackSummaries, and ListeningProfile in localStorage.
 */

import type { ListenEvent, TrackSummary, ListeningProfile } from "./types";
import { computeAffinityScore, buildListeningProfile } from "./affinity";
import { buildUserProfile } from "../recommendation/profileBuilder";

const EVENTS_KEY = "mics_listen_events";
const SUMMARIES_KEY = "mics_track_summaries";
const PROFILE_KEY = "mics_listen_profile";

/**
 * HistoryStore
 * Handles hydration from storage, list pruning, summary merges, and profile updates.
 */
export class HistoryStore {
  private events: ListenEvent[] = [];
  private summaries: Map<string, TrackSummary> = new Map();
  private profile: ListeningProfile | null = null;
  private eventsSinceLastProfileRebuild: number = 0;
  private readonly PROFILE_REBUILD_THRESHOLD = 5;
  private readonly MAX_EVENTS = 300;
  private listeners: (() => void)[] = [];

  /**
   * Registers a store change listener.
   * @param {() => void} listener - Callback executed on store changes.
   * @returns {() => void} Unsubscribe function.
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notifies all active subscribers that store data has changed.
   */
  private notify(): void {
    this.listeners.forEach(cb => {
      try { cb(); } catch (err) { console.error("Error in history store subscriber:", err); }
    });
  }

  /**
   * Hydrates in-memory state from localStorage on app boot.
   * Wrapped in try/catch block to ensure errors do not block loading.
   */
  public hydrate(): void {
    try {
      const rawEvents = localStorage.getItem(EVENTS_KEY);
      this.events = rawEvents ? JSON.parse(rawEvents) : [];
    } catch (err) {
      console.warn("Failed to hydrate listen events:", err);
      this.events = [];
    }

    try {
      const rawSummaries = localStorage.getItem(SUMMARIES_KEY);
      const arr: TrackSummary[] = rawSummaries ? JSON.parse(rawSummaries) : [];
      this.summaries = new Map(arr.map(s => [s.trackId, s]));
    } catch (err) {
      console.warn("Failed to hydrate track summaries:", err);
      this.summaries = new Map();
    }

    try {
      const rawProfile = localStorage.getItem(PROFILE_KEY);
      this.profile = rawProfile ? JSON.parse(rawProfile) : null;
    } catch (err) {
      console.warn("Failed to hydrate user listening profile:", err);
      this.profile = null;
    }
  }

  /**
   * Appends a finalized ListenEvent.
   * Updates track summary statistics and schedules taste profile regeneration.
   * @param {ListenEvent} event - The finalized listen event.
   */
  public addEvent(event: ListenEvent): void {
    // Skip events under 10 seconds — accidental plays, buffering glitches
    if (event.listenedMs < 10000) return;

    this.events.push(event);
    if (this.events.length > this.MAX_EVENTS) {
      this.events = this.events.slice(-this.MAX_EVENTS);
    }

    this.upsertSummary(event);
    this.eventsSinceLastProfileRebuild++;

    if (this.eventsSinceLastProfileRebuild >= this.PROFILE_REBUILD_THRESHOLD || !this.profile) {
      this.rebuildProfile();
      this.eventsSinceLastProfileRebuild = 0;
    }

    this.persist();

    // Sync to old recommendation engine
    try {
      const mapContextToOld = (ctx: string): "search" | "recommendation" | "library" | "queue" | "speeddial" => {
        if (ctx.startsWith("home_")) return "recommendation";
        if (ctx === "search_result") return "search";
        if (ctx === "library_song") return "library";
        if (ctx === "queue") return "queue";
        if (ctx === "speed_dial") return "speeddial";
        return "recommendation";
      };

      const oldEvent = {
        trackId: event.trackId,
        startedAt: event.startedAt,
        durationListenedMs: event.listenedMs,
        completionRate: event.completionRate,
        context: mapContextToOld(event.context),
        likedDuring: event.likedDuring,
        skipped: event.skipped
      };
      
      const trackObj = {
        id: event.trackId,
        title: event.title,
        artist: event.artist,
        artistId: event.artistId,
        album: event.album,
        albumId: event.albumId,
        genres: event.genres,
        tempo: event.tempo,
        energy: event.energy,
        valence: event.valence,
        danceability: event.danceability,
        acousticness: event.acousticness,
        instrumentalness: 0,
        durationMs: event.durationMs,
        releaseYear: 2024,
        popularity: 50,
        playCount: 0,
        lastPlayedAt: event.startedAt,
        likedAt: event.likedDuring ? event.startedAt : null,
        addedToLibraryAt: null,
        thumbnail: event.artwork
      };

      const HISTORY_KEY = "mics_listen_history_v2";
      const OLD_PROFILE_KEY = "mics_user_profile_v2";
      
      const rawHistory = localStorage.getItem(HISTORY_KEY);
      const oldHistory = rawHistory ? JSON.parse(rawHistory) : [];
      oldHistory.unshift(oldEvent);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(oldHistory.slice(0, 500)));

      let existingProfile = null;
      const savedProfile = localStorage.getItem(OLD_PROFILE_KEY);
      if (savedProfile) {
        try { existingProfile = JSON.parse(savedProfile); } catch {}
      }
      
      const updatedProfile = buildUserProfile([oldEvent], { [event.trackId]: trackObj }, existingProfile);
      localStorage.setItem(OLD_PROFILE_KEY, JSON.stringify(updatedProfile));
    } catch (e) {
      console.warn("Failed to sync to old recommendation engine:", e);
    }

    this.notify();
  }

  /**
   * Merges a new listen event's data into the track's TrackSummary.
   * Uses pure running averages to update summaries without full scans.
   * @param {ListenEvent} event - The listen event.
   */
  private upsertSummary(event: ListenEvent): void {
    const existing = this.summaries.get(event.trackId);
    if (existing) {
      const totalPlays = existing.totalPlays + 1;
      const avgCompletion = (existing.avgCompletionRate * existing.totalPlays + event.completionRate) / totalPlays;
      
      const updatedSummary: TrackSummary = {
        ...existing,
        totalPlays,
        totalListenedMs: existing.totalListenedMs + event.listenedMs,
        avgCompletionRate: avgCompletion,
        lastPlayedAt: event.startedAt,
        likeCount: existing.likeCount + (event.likedDuring ? 1 : 0),
        skipCount: existing.skipCount + (event.skipped ? 1 : 0),
        isLiked: existing.isLiked || event.likedDuring,
        affinityScore: 0 // Will be set below
      };

      updatedSummary.affinityScore = computeAffinityScore(updatedSummary);
      this.summaries.set(event.trackId, updatedSummary);
    } else {
      const summary: TrackSummary = {
        trackId: event.trackId,
        title: event.title,
        artist: event.artist,
        artistId: event.artistId,
        album: event.album,
        albumId: event.albumId,
        artwork: event.artwork,
        genres: event.genres,
        energy: event.energy,
        valence: event.valence,
        danceability: event.danceability,
        acousticness: event.acousticness,
        tempo: event.tempo,
        totalPlays: 1,
        totalListenedMs: event.listenedMs,
        avgCompletionRate: event.completionRate,
        lastPlayedAt: event.startedAt,
        firstPlayedAt: event.startedAt,
        likeCount: event.likedDuring ? 1 : 0,
        skipCount: event.skipped ? 1 : 0,
        isLiked: event.likedDuring,
        affinityScore: 0 // Will be set below
      };

      summary.affinityScore = computeAffinityScore(summary);
      this.summaries.set(event.trackId, summary);
    }
  }

  public getEvents(): ListenEvent[] {
    return [...this.events];
  }

  public getSummaries(): TrackSummary[] {
    return [...this.summaries.values()];
  }

  public getSummary(trackId: string): TrackSummary | null {
    return this.summaries.get(trackId) ?? null;
  }

  public getProfile(): ListeningProfile | null {
    return this.profile;
  }

  /**
   * Retrieves events logged in the last delta milliseconds.
   * @param {number} limitMs - Delta constraint.
   * @returns {ListenEvent[]} Recent events list.
   */
  public getRecentEvents(limitMs: number): ListenEvent[] {
    const cutoff = Date.now() - limitMs;
    return this.events.filter(e => e.startedAt >= cutoff);
  }

  /**
   * Rebuilds the ListeningProfile based on current summaries and events.
   */
  private rebuildProfile(): void {
    this.profile = buildListeningProfile([...this.summaries.values()], this.events);
  }

  /**
   * Saves local storage values inside try/catch to absorb quota-limit alerts.
   */
  private persist(): void {
    try {
      localStorage.setItem(EVENTS_KEY, JSON.stringify(this.events));
    } catch (err) {
      console.warn("Storage quota exceeded while saving listen events:", err);
    }
    
    try {
      localStorage.setItem(SUMMARIES_KEY, JSON.stringify([...this.summaries.values()]));
    } catch (err) {
      console.warn("Storage quota exceeded while saving track summaries:", err);
    }
    
    if (this.profile) {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
      } catch (err) {
        console.warn("Storage quota exceeded while saving user profile:", err);
      }
    }
  }

  /**
   * Resets all locally stored history and alerts subscribers.
   */
  public clear(): void {
    this.events = [];
    this.summaries.clear();
    this.profile = null;
    
    try { localStorage.removeItem(EVENTS_KEY); } catch {}
    try { localStorage.removeItem(SUMMARIES_KEY); } catch {}
    try { localStorage.removeItem(PROFILE_KEY); } catch {}
    try { localStorage.removeItem("mics_player_state"); } catch {}
    
    this.notify();
  }
}

export const historyStore = new HistoryStore();
