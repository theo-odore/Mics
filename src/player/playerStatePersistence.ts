import type { PlaybackStore, PersistedPlayerState } from "../history/playbackStore";

export class PlayerStatePersistence {

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  public init(store: PlaybackStore): void {
    // Subscribe to all store changes
    store.subscribe("trackChange",     () => this.scheduleSave(store));
    store.subscribe("positionChange",  () => this.scheduleSave(store));
    store.subscribe("volumeChange",    () => this.scheduleSave(store));
    store.subscribe("shuffleChange",   () => this.scheduleSave(store));
    store.subscribe("repeatChange",    () => this.scheduleSave(store));
    store.subscribe("queueChange",     () => this.scheduleSave(store));

    // Position checkpoint every 10 seconds during playback
    setInterval(() => {
      if (store.isPlaying) this.scheduleSave(store);
    }, 10_000);

    // Immediate saves on tab hide / close
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.saveNow(store);
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload",  () => this.saveNow(store));
      window.addEventListener("pagehide",      () => this.saveNow(store));
    }
  }

  private scheduleSave(store: PlaybackStore): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(store), 1000);
  }

  private saveNow(store: PlaybackStore): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (!store.currentTrack) return; // nothing to save
    const state: PersistedPlayerState = {
      track:      {
        id: store.currentTrack.id,
        title: store.currentTrack.title,
        artist: store.currentTrack.artist,
        artistId: store.currentTrack.artistId || "",
        album: store.currentTrack.album || "Single",
        albumId: store.currentTrack.albumId || "single",
        artwork: store.currentTrack.thumbnail || "",
        durationMs: store.currentTrack.durationMs || 0,
        sourceId: (store.currentTrack as any).sourceId || store.currentTrack.id,
        source: (store.currentTrack as any).source || "youtube-music",
      },
      positionMs: store.positionMs,
      savedAt:    Date.now(),
      queue:      store.queue.map(item => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        artwork: item.thumbnail || "",
        durationMs: item.durationMs || 0,
        sourceId: (item as any).sourceId || item.id,
        source: (item as any).source || "youtube-music",
      })),
      queueIndex: store.queueIndex,
      volume:     store.volume,
      shuffle:    store.shuffle,
      repeat:     store.repeat,
      version:    1,
    };
    try {
      localStorage.setItem("mics_player_state", JSON.stringify(state));
    } catch {}
  }

  public loadSavedState(): PersistedPlayerState | null {
    try {
      const raw = localStorage.getItem("mics_player_state");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedPlayerState;
      if (parsed.version !== 1) return null;
      if (!parsed.track || !Array.isArray(parsed.queue)) return null;
      // Handle near-end position
      if (parsed.positionMs >= parsed.track.durationMs - 3000) {
        parsed.positionMs = 0;
      }
      return parsed;
    } catch { return null; }
  }

  public clearSavedState(): void {
    try { localStorage.removeItem("mics_player_state"); } catch {}
  }
}

export const playerStatePersistence = new PlayerStatePersistence();
