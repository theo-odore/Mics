import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { historyStore } from './history/store'
import { listenTracker } from './history/tracker'
import { playbackStore } from './history/playbackStore'
import { playerStatePersistence } from './player/playerStatePersistence'

// 1. Hydrate store FIRST — synchronous, must complete before any component renders
historyStore.hydrate();

// 2. Load saved player state
const savedPlayerState = playerStatePersistence.loadSavedState();

// 3. Init playback store with saved state (if any)
if (savedPlayerState) {
  playbackStore.initFromSavedState(savedPlayerState);
}

// 4. Init listen tracker — subscribes to playback store
listenTracker.init(playbackStore, historyStore);

// 5. Init persistence (starts auto-saving from now on)
playerStatePersistence.init(playbackStore);

// 6. Now render the app
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App initialPlayerState={savedPlayerState} />
  </React.StrictMode>
)

// Expose stores in development for verification and E2E tests
if (import.meta.env.DEV) {
  window.historyStore = historyStore;
  window.playbackStore = playbackStore;
  window.listenTracker = listenTracker;
  window.playerStatePersistence = playerStatePersistence;
}
