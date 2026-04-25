import { useState, useRef, useEffect, useCallback } from 'react'

const API = 'http://localhost:3001/api'

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function Icon({ name, className = '', ...props }) {
  return <span className={`material-symbols-outlined ${className}`} {...props}>{name}</span>
}

export default function App() {
  const [currentTrack, setCurrentTrack] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [activeNav, setActiveNav] = useState('home')
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(0)
  const [volume, setVolume] = useState(1)
  const [showOptions, setShowOptions] = useState(false)
  const [sleepTimer, setSleepTimer] = useState(null)
  
  const [liked, setLiked] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mics_liked') || '[]')) }
    catch { return new Set() }
  })
  const [likedTracks, setLikedTracks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mics_liked_tracks') || '[]') }
    catch { return [] }
  })
  
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  
  const [trending, setTrending] = useState([])
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mics_recent') || '[]') }
    catch { return [] }
  })
  const [queue, setQueue] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const audioRef = useRef(null)
  const rafRef = useRef(null)
  const searchTimerRef = useRef(null)
  const playNextRef = useRef(null)
  const lastAddedTrackIdRef = useRef(null)
  const sleepTimeoutRef = useRef(null)

  // ===== Options Handlers =====
  const handleSleepTimer = (value) => {
    if (sleepTimeoutRef.current) clearTimeout(sleepTimeoutRef.current)
    
    if (sleepTimer === value) {
      // Toggle off
      setSleepTimer(null)
      return
    }

    setSleepTimer(value)
    
    if (value !== 'End of Track') {
      const mins = parseInt(value)
      if (!isNaN(mins)) {
        sleepTimeoutRef.current = setTimeout(() => {
          setIsPlaying(false)
          setSleepTimer(null)
          if (audioRef.current) audioRef.current.pause()
        }, mins * 60 * 1000)
      }
    }
  }

  // ===== Render functions =====
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
    audio.addEventListener('playing', () => { setIsPlaying(true); setIsLoading(false); startRAF() })
    audio.addEventListener('pause', () => { setIsPlaying(false); stopRAF() })
    audio.addEventListener('waiting', () => setIsLoading(true))
    audio.addEventListener('canplay', () => setIsLoading(false))
    audio.addEventListener('error', (e) => {
      console.error('Audio error:', e)
      setIsLoading(false)
      setIsPlaying(false)
    })

    return () => { audio.pause(); stopRAF() }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const handler = () => {
      stopRAF()
      
      // If sleep timer is 'End of Track', pause instead of playing next
      if (sleepTimer === 'End of Track') {
        setIsPlaying(false)
        setSleepTimer(null)
        return
      }

      if (repeat === 2) {
        audio.currentTime = 0
        audio.play()
      } else {
        playNextRef.current?.()
      }
    }
    audio.addEventListener('ended', handler)
    return () => audio.removeEventListener('ended', handler)
  }, [repeat, sleepTimer])

  // Sync volume state with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  const updateProgress = useCallback(() => {
    const audio = audioRef.current
    if (audio && !audio.paused && audio.duration) {
      setCurrentTime(audio.currentTime)
      setDuration(audio.duration)
      setProgress((audio.currentTime / audio.duration) * 100)
    }
    rafRef.current = requestAnimationFrame(updateProgress)
  }, [])

  const startRAF = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(updateProgress)
  }, [updateProgress])

  const stopRAF = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  // ===== Load trending =====
  useEffect(() => {
    fetch(`${API}/trending`)
      .then(r => r.json())
      .then(t => { if (t.length) setTrending(t) })
      .catch(() => {})
  }, [])

  // ===== Persist =====
  useEffect(() => {
    localStorage.setItem('mics_liked', JSON.stringify([...liked]))
    localStorage.setItem('mics_liked_tracks', JSON.stringify(likedTracks))
  }, [liked, likedTracks])

  useEffect(() => {
    localStorage.setItem('mics_recent', JSON.stringify(recentlyPlayed))
  }, [recentlyPlayed])

  // Reset the increment tracker when track changes
  useEffect(() => {
    lastAddedTrackIdRef.current = null
  }, [currentTrack?.id])

  // ===== Highly Played Tracks (Jump back in) =====
  useEffect(() => {
    if (currentTrack && currentTime > 30 && lastAddedTrackIdRef.current !== currentTrack.id) {
      lastAddedTrackIdRef.current = currentTrack.id // Mark as counted for this play session
      
      setRecentlyPlayed(prev => {
        let exists = false
        const updated = prev.map(t => {
          if (t.id === currentTrack.id) {
            exists = true
            return { ...t, playCount: (t.playCount || 1) + 1, lastPlayed: Date.now() }
          }
          return t
        })
        
        if (!exists) {
          updated.push({ ...currentTrack, playCount: 1, lastPlayed: Date.now() })
        }
        
        // Sort by play count (highly played), then by most recent tie-breaker
        updated.sort((a, b) => {
          const countB = b.playCount || 1
          const countA = a.playCount || 1
          if (countB !== countA) return countB - countA
          return (b.lastPlayed || 0) - (a.lastPlayed || 0)
        })
        
        return updated.slice(0, 30)
      })
    }
  }, [currentTrack, currentTime])

  // ===== Search =====
  const handleSearch = useCallback((q) => {
    setSearch(q)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!q.trim()) { setSearchResults([]); setSearching(false); return }
    setSearching(true)
    setActiveNav('search')
    searchTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/search?q=${encodeURIComponent(q)}`)
        const data = await r.json()
        setSearchResults(data)
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 500)
  }, [])

  // ===== Play Track =====
  const playTrack = useCallback((track, fromQueue = false) => {
    if (!track?.id) return
    const audio = audioRef.current
    setCurrentTrack(track)
    setIsLoading(true)
    setIsPlaying(false)
    setCurrentTime(0)
    setProgress(0)
    setDuration(track.duration || 0)

    audio.src = `${API}/stream/${track.id}`
    audio.load()
    audio.play().catch((err) => console.error('Audio play error:', err))

    if (!fromQueue) {
      fetch(`${API}/suggestions/${track.id}`)
        .then(r => r.json())
        .then(suggestions => {
          if (suggestions && suggestions.length > 0) {
            setQueue([track, ...suggestions])
          }
        })
        .catch(() => {})
    }
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return
    if (isPlaying) audio.pause()
    else audio.play().catch((err) => console.error('Audio toggle error:', err))
  }, [currentTrack, isPlaying])

  const playNext = useCallback(() => {
    if (queue.length === 0) return
    
    if (shuffle) {
      // Pick a random index different from current (if possible)
      const currentIndex = queue.findIndex(t => t.id === currentTrack?.id)
      let nextIndex = Math.floor(Math.random() * queue.length)
      if (queue.length > 1 && nextIndex === currentIndex) {
        nextIndex = (nextIndex + 1) % queue.length
      }
      playTrack(queue[nextIndex], true)
      return
    }

    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id)
    if (currentIndex >= 0) {
      let nextIndex = currentIndex + 1
      if (nextIndex >= queue.length) {
        if (repeat === 1) nextIndex = 0
        else return
      }
      playTrack(queue[nextIndex], true)
    }
  }, [queue, currentTrack, repeat, shuffle, playTrack])

  playNextRef.current = playNext

  const playPrev = useCallback(() => {
    if (queue.length === 0) return
    const currentIndex = queue.findIndex(t => t.id === currentTrack?.id)
    if (currentIndex > 0) {
      playTrack(queue[currentIndex - 1], true)
    } else if (audioRef.current) {
      audioRef.current.currentTime = 0
    }
  }, [queue, currentTrack, playTrack])

  const handleSeek = useCallback((e) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const bounds = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - bounds.left, bounds.width))
    const pct = x / bounds.width
    audio.currentTime = pct * duration
    setProgress(pct * 100)
    setCurrentTime(audio.currentTime)
  }, [duration])

  const handleVolume = useCallback((e) => {
    const bounds = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - bounds.left, bounds.width))
    const pct = x / bounds.width
    setVolume(pct)
  }, [])

  const toggleMute = useCallback(() => {
    setVolume(v => v > 0 ? 0 : 1)
  }, [])

  const toggleLike = useCallback((e, track) => {
    e.stopPropagation()
    const newLiked = new Set(liked)
    let newTracks = [...likedTracks]
    if (newLiked.has(track.id)) {
      newLiked.delete(track.id)
      newTracks = newTracks.filter(t => t.id !== track.id)
    } else {
      newLiked.add(track.id)
      newTracks.unshift(track)
    }
    setLiked(newLiked)
    setLikedTracks(newTracks)
  }, [liked, likedTracks])

  // Track Card Render Function
  const renderTrackCard = (track) => (
    <div 
      key={`card-${track.id}`}
      className="bg-zinc-900 p-md rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer group relative"
      onClick={() => playTrack(track)}
    >
      <div className="aspect-square w-full mb-md overflow-hidden rounded-md relative shadow-lg">
        <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        <button 
          className="absolute bottom-2 right-2 bg-primary text-black w-10 h-10 rounded-full flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all shadow-xl"
          onClick={(e) => { e.stopPropagation(); playTrack(track) }}
        >
          <Icon name="play_arrow" className="text-xl" />
        </button>
      </div>
      <h3 className="font-headline-md text-sm text-white truncate mb-1">{track.title}</h3>
      <p className="font-body-md text-xs text-zinc-400 truncate">{track.artist}</p>
    </div>
  )

  // List Item Render Function
  const renderTrackListItem = (track, onPlay) => (
    <div 
      key={`list-${track.id}`}
      className="flex items-center gap-md p-sm rounded-lg hover:bg-zinc-800/50 cursor-pointer group transition-colors"
      onClick={() => onPlay ? onPlay(track) : playTrack(track)}
    >
      <div className="w-12 h-12 relative flex-shrink-0">
        <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover rounded-md" />
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
          <Icon name="play_arrow" className="text-white text-lg" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className={`text-sm font-semibold truncate ${currentTrack?.id === track.id ? 'text-primary' : 'text-white'}`}>{track.title}</h4>
        <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
      </div>
      <div className="flex items-center gap-sm text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => toggleLike(e, track)} className="hover:text-white p-1">
          <Icon name="favorite" className={liked.has(track.id) ? "text-primary" : ""} />
        </button>
        <span className="text-xs">{formatTime(track.duration)}</span>
      </div>
    </div>
  )

  return (
    <div className="bg-background text-on-surface font-body-md antialiased min-h-screen flex">
      {/* SideNavBar (WEB) */}
      <nav className="hidden md:flex bg-zinc-900 font-inter text-sm font-medium fixed left-0 top-0 h-full w-64 border-r border-zinc-800 flex-col p-6 gap-y-2 z-40">
        <div className="flex items-center gap-2 mb-8">
          <img src="/logo.svg" alt="Mics Logo" className="w-8 h-8" />
          <div className="text-2xl font-black tracking-tighter text-white">Mics</div>
        </div>
        
        <div className="flex flex-col gap-xs mb-lg">
          <button onClick={() => setActiveNav('home')} className={`flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200 w-full text-left ${activeNav === 'home' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
            <Icon name="home" /> <span>Home</span>
          </button>
          <button onClick={() => setActiveNav('search')} className={`flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200 w-full text-left ${activeNav === 'search' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
            <Icon name="search" /> <span>Search</span>
          </button>
          <button onClick={() => setActiveNav('library')} className={`flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200 w-full text-left ${activeNav === 'library' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
            <Icon name="library_music" /> <span>Your Library</span>
          </button>
        </div>
        
        <div className="flex flex-col gap-xs mt-lg mb-auto">
          <button onClick={() => setActiveNav('liked')} className={`flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200 w-full text-left ${activeNav === 'liked' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
            <Icon name="favorite" /> <span>Liked Songs</span>
          </button>
          <button onClick={() => setActiveNav('queue')} className={`flex items-center gap-md px-md py-sm rounded-lg transition-colors duration-200 w-full text-left ${activeNav === 'queue' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
            <Icon name="queue_music" /> <span>Play Queue</span>
          </button>
        </div>
        
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 ml-0 md:ml-64 mb-24 flex flex-col h-screen overflow-y-auto no-scrollbar pb-10">
        {/* TopAppBar */}
        <header className="bg-zinc-950/90 backdrop-blur-md font-inter text-sm font-semibold sticky top-0 z-30 w-full flex justify-between items-center px-6 py-4">
          <div className="flex items-center gap-md w-full max-w-md">
            <div className="relative w-full">
              <Icon name="search" className="absolute left-md top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full bg-[#282828] text-white rounded-full py-sm pl-12 pr-md border-none focus:ring-2 focus:ring-primary-container text-body-md h-10 outline-none" 
                placeholder="What do you want to listen to?" 
                type="text"
              />
            </div>
          </div>
          <div className="hidden md:flex items-center gap-lg">
            <button className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center">
              <Icon name="person" className="text-zinc-400" />
            </button>
          </div>
        </header>

        <div className="p-6 md:p-8 flex-1 max-w-[1600px] mx-auto w-full">
          
          {/* HOME VIEW */}
          {activeNav === 'home' && (
            <>
              {recentlyPlayed.filter(t => (t.playCount || 0) > 1).length > 0 && (
                <section className="mb-12">
                  <h2 className="font-headline-md text-2xl font-bold text-white mb-6">Jump back in</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {recentlyPlayed.filter(t => (t.playCount || 0) > 1).slice(0, 5).map(track => renderTrackCard(track))}
                  </div>
                </section>
              )}
              
              <section className="mb-16">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-headline-md text-3xl font-black tracking-tight text-white flex items-center gap-3">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400 drop-shadow-sm">Trending</span>
                    Global
                    <Icon name="local_fire_department" className="text-primary text-3xl animate-pulse drop-shadow-[0_0_15px_rgba(83,224,118,0.5)]" />
                  </h2>
                </div>

                {trending.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 md:grid-rows-2 gap-4 md:h-[420px]">
                    {/* #1 Track - Massive Hero Item */}
                    <div 
                      onClick={() => playTrack(trending[0])}
                      className="col-span-2 row-span-2 relative rounded-[32px] overflow-hidden cursor-pointer group shadow-2xl border border-white/5 hover:border-primary/30 transition-colors duration-500"
                    >
                      <img src={trending[0].thumbnail} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" alt={trending[0].title} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>
                      
                      <div className="absolute top-5 left-5 w-14 h-14 bg-black/40 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/10 shadow-lg">
                        <span className="text-primary font-black text-2xl drop-shadow-[0_0_10px_rgba(83,224,118,0.8)]">#1</span>
                      </div>

                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="w-20 h-20 bg-primary/90 text-black rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(83,224,118,0.6)] backdrop-blur-md scale-90 group-hover:scale-100 transition-transform duration-300">
                          <Icon name="play_arrow" className="text-5xl ml-1" />
                        </div>
                      </div>

                      <div className="absolute bottom-0 left-0 w-full p-6 md:p-8">
                        <h3 className="text-3xl md:text-5xl font-black text-white mb-2 leading-tight tracking-tight drop-shadow-xl">{trending[0].title}</h3>
                        <p className="text-lg md:text-xl text-zinc-300 font-medium drop-shadow-md">{trending[0].artist}</p>
                      </div>
                    </div>

                    {/* Tracks 2-5 */}
                    {trending.slice(1, 5).map((track, i) => (
                      <div 
                        key={track.id}
                        onClick={() => playTrack(track)}
                        className="relative rounded-3xl overflow-hidden cursor-pointer group shadow-lg border border-white/5 hover:border-white/20 transition-all duration-300"
                      >
                        <img src={track.thumbnail} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" alt={track.title} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity"></div>
                        
                        <div className="absolute top-3 left-3 w-8 h-8 bg-black/40 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/10">
                          <span className="text-white font-bold text-sm">#{i + 2}</span>
                        </div>

                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="w-12 h-12 bg-primary text-black rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(83,224,118,0.5)] scale-75 group-hover:scale-100 transition-transform duration-300">
                            <Icon name="play_arrow" className="text-3xl ml-0.5" />
                          </div>
                        </div>

                        <div className="absolute bottom-0 left-0 w-full p-4">
                          <h3 className="text-base md:text-lg font-bold text-white truncate mb-1 drop-shadow-md">{track.title}</h3>
                          <p className="text-xs md:text-sm text-zinc-300 truncate drop-shadow-md">{track.artist}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Tracks 6-10 List Style */}
                {trending.length > 5 && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {trending.slice(5, 11).map((track, i) => (
                      <div 
                        key={track.id}
                        onClick={() => playTrack(track)}
                        className="flex items-center gap-4 bg-zinc-900/40 hover:bg-zinc-800/80 p-3 rounded-2xl cursor-pointer transition-all duration-300 border border-transparent hover:border-white/10 group shadow-sm hover:shadow-md"
                      >
                        <div className="w-8 text-center font-black text-xl text-zinc-600 group-hover:text-primary transition-colors">
                          {i + 6}
                        </div>
                        <div className="w-12 h-12 md:w-14 md:h-14 relative rounded-[14px] overflow-hidden shrink-0 shadow-md">
                          <img src={track.thumbnail} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={track.title} />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Icon name="play_arrow" className="text-white text-xl" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                          <h4 className="font-bold text-sm md:text-base text-white truncate">{track.title}</h4>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{track.artist}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* SEARCH VIEW */}
          {activeNav === 'search' && (
            <section className="mb-12">
               <h2 className="font-headline-md text-2xl font-bold text-white mb-6">
                 {search ? `Results for "${search}"` : 'Search for a song'}
               </h2>
               {searching ? (
                 <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
               ) : (
                 <div className="flex flex-col gap-2 max-w-4xl">
                   {searchResults.map(track => renderTrackListItem(track))}
                 </div>
               )}
            </section>
          )}

          {/* LIKED VIEW */}
          {activeNav === 'liked' && (
            <section className="mb-12">
               <div className="flex items-center gap-6 mb-8">
                 <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-800 rounded-lg shadow-xl flex items-center justify-center">
                   <Icon name="favorite" className="text-white text-5xl" />
                 </div>
                 <div>
                   <h2 className="font-headline-md text-4xl font-bold text-white mb-2">Liked Songs</h2>
                   <p className="text-zinc-400">{likedTracks.length} tracks</p>
                 </div>
               </div>
               <div className="flex flex-col gap-2 max-w-4xl">
                 {likedTracks.map(track => renderTrackListItem(track))}
                 {likedTracks.length === 0 && <p className="text-zinc-500 py-10">You haven't liked any songs yet.</p>}
               </div>
            </section>
          )}
          
          {/* QUEUE VIEW */}
          {activeNav === 'queue' && (
            <section className="mb-12">
               <h2 className="font-headline-md text-2xl font-bold text-white mb-6">Now Playing & Up Next</h2>
               <div className="flex flex-col gap-2 max-w-4xl">
                 {queue.map((track, i) => (
                   <div key={`q-${i}-${track.id}`} className={currentTrack?.id === track.id ? 'bg-zinc-800/80 rounded-lg' : ''}>
                     {renderTrackListItem(track, () => playTrack(track, true))}
                   </div>
                 ))}
                 {queue.length === 0 && <p className="text-zinc-500 py-10">Queue is empty.</p>}
               </div>
            </section>
          )}
          
        </div>
      </main>

      {/* Bottom Player (WEB & MOBILE) */}
      <nav className="bg-zinc-950 text-white font-inter text-xs fixed bottom-0 w-full h-24 z-50 border-t border-zinc-800 flex justify-between items-center px-4 md:px-6">
        
        {/* Now Playing Info */}
        <div className="flex items-center gap-md w-1/3 min-w-0">
          {currentTrack ? (
            <>
              <img src={currentTrack.thumbnail} alt="Album Art" className="w-14 h-14 rounded-md object-cover hidden sm:block shadow-md" />
              <div className="flex flex-col truncate px-2">
                <span className="font-semibold text-sm text-white truncate">{currentTrack.title}</span>
                <span className="text-xs text-zinc-400 truncate mt-0.5">{currentTrack.artist}</span>
              </div>
              <button onClick={(e) => toggleLike(e, currentTrack)} className="text-zinc-400 hover:text-white ml-2 hidden sm:block">
                <Icon name="favorite" className={liked.has(currentTrack.id) ? "text-primary" : ""} />
              </button>
            </>
          ) : (
            <div className="text-zinc-500 text-sm hidden sm:block">No track playing</div>
          )}
        </div>

        {/* Controls & Scrubber */}
        <div className="flex flex-col items-center justify-center w-full max-w-md md:w-1/3">
          <div className="flex items-center gap-4 md:gap-6 mb-2">
            <button onClick={() => setShuffle(!shuffle)} className={`hidden sm:block hover:scale-110 transition-transform ${shuffle ? 'text-primary' : 'text-zinc-400 hover:text-white'}`}>
              <Icon name="shuffle" />
            </button>
            <button onClick={playPrev} className="text-zinc-400 hover:text-white hover:scale-110 transition-transform">
              <Icon name="skip_previous" />
            </button>
            <button onClick={togglePlay} className="text-black hover:scale-105 transition-transform bg-white rounded-full flex items-center justify-center p-2 w-10 h-10 shadow-lg">
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Icon name={isPlaying ? "pause" : "play_arrow"} />
              )}
            </button>
            <button onClick={playNext} className="text-zinc-400 hover:text-white hover:scale-110 transition-transform">
              <Icon name="skip_next" />
            </button>
            <button onClick={() => setRepeat((repeat + 1) % 3)} className={`hidden sm:block hover:scale-110 transition-transform ${repeat > 0 ? 'text-primary' : 'text-zinc-400 hover:text-white'}`}>
              <Icon name={repeat === 2 ? "repeat_one" : "repeat"} />
            </button>
          </div>
          
          <div className="w-full flex items-center gap-3">
            <span className="text-[11px] text-zinc-400 w-8 text-right">{formatTime(currentTime)}</span>
            <div className="flex-1 h-10 flex items-center cursor-pointer group" onClick={handleSeek}>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative pointer-events-none">
                <div className="h-full bg-white group-hover:bg-primary transition-colors rounded-full" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
            <span className="text-[11px] text-zinc-400 w-8">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume & Extras (Desktop) */}
        <div className="flex items-center justify-end gap-4 w-1/3 hidden md:flex text-zinc-400">
          <button onClick={() => setShowOptions(true)} className="hover:text-white hover:scale-110 transition-transform">
            <Icon name="settings" className="text-[20px]" />
          </button>
          <button onClick={() => setActiveNav('queue')} className={`hover:text-white hover:scale-110 transition-transform ${activeNav === 'queue' ? 'text-primary' : ''}`}>
            <Icon name="queue_music" className="text-[20px]" />
          </button>
          <div className="flex items-center gap-2 w-24">
            <button onClick={toggleMute} className="hover:text-white transition-colors flex items-center">
              <Icon name={volume === 0 ? "volume_off" : volume < 0.5 ? "volume_down" : "volume_up"} className="text-[18px]" />
            </button>
            <div className="flex-1 h-10 flex items-center cursor-pointer group" onClick={handleVolume}>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative pointer-events-none">
                <div className="h-full bg-white group-hover:bg-primary transition-colors rounded-full" style={{ width: `${volume * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
        
      </nav>
      
      {/* Mobile Bottom Nav (replaces sidebar on small screens) */}
      <nav className="md:hidden bg-zinc-900/95 backdrop-blur-md text-white fixed bottom-24 w-full h-16 z-40 border-t border-zinc-800 flex justify-around items-center px-2">
        <button onClick={() => setActiveNav('home')} className={`flex flex-col items-center p-2 ${activeNav === 'home' ? 'text-white' : 'text-zinc-500'}`}>
          <Icon name="home" />
        </button>
        <button onClick={() => setActiveNav('search')} className={`flex flex-col items-center p-2 ${activeNav === 'search' ? 'text-white' : 'text-zinc-500'}`}>
          <Icon name="search" />
        </button>
        <button onClick={() => setActiveNav('liked')} className={`flex flex-col items-center p-2 ${activeNav === 'liked' ? 'text-white' : 'text-zinc-500'}`}>
          <Icon name="favorite" />
        </button>
        <button onClick={() => setActiveNav('queue')} className={`flex flex-col items-center p-2 ${activeNav === 'queue' ? 'text-white' : 'text-zinc-500'}`}>
          <Icon name="queue_music" />
        </button>
      </nav>
      
      {/* Player Options Modal */}
      {showOptions && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowOptions(false)}>
          <div className="bg-[#121212] w-full max-w-md rounded-[20px] shadow-2xl border border-neutral-800/50 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-neutral-800/50 flex justify-between items-center">
              <h2 className="font-headline-md text-white font-bold text-lg">Player Options</h2>
              <button onClick={() => setShowOptions(false)} className="hover:text-white transition-colors text-neutral-400">
                <Icon name="close" />
              </button>
            </div>
            
            <div className="max-h-[70vh] overflow-y-auto no-scrollbar pb-6">
              {currentTrack && (
                <div className="p-6 flex items-center gap-4 bg-[#1a1a1a]">
                  <img src={currentTrack.thumbnail} className="w-16 h-16 rounded-lg object-cover shadow-md" alt="Thumbnail" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-white truncate">{currentTrack.title}</h3>
                    <p className="text-sm text-neutral-400 truncate">{currentTrack.artist}</p>
                  </div>
                </div>
              )}
              
              <div className="p-6 space-y-4">
                <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.15em]">Sleep Timer</h4>
                <div className="space-y-2">
                  {['5 minutes', '10 minutes', '30 minutes', '60 minutes', 'End of Track'].map(t => (
                    <div 
                      key={t} 
                      onClick={() => handleSleepTimer(t)}
                      className={`flex justify-between items-center py-2 text-sm cursor-pointer transition-colors ${sleepTimer === t ? 'text-primary font-bold' : 'text-neutral-300 hover:text-white'}`}
                    >
                      <span>{t}</span>
                      {sleepTimer === t && <Icon name="check" className="text-sm" />}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="h-px bg-neutral-800 mx-6"></div>
              
              <div className="p-6 space-y-4">
                <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.15em]">Playback</h4>
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white">Crossfade</span>
                    <div className="w-10 h-5 bg-zinc-800 rounded-full relative cursor-pointer">
                      <div className="absolute left-1 top-1 w-3 h-3 bg-neutral-400 rounded-full"></div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-white">Gapless Playback</span>
                    <div className="w-10 h-5 bg-primary rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-3 h-3 bg-black rounded-full"></div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="h-px bg-neutral-800 mx-6"></div>
              
              <div className="p-6 space-y-4">
                <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.15em]">Queue Management</h4>
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => { setQueue([]); setShowOptions(false); }} className="flex items-center gap-3 w-full py-3 px-4 bg-[#282828] hover:bg-[#333333] transition-colors rounded-lg text-sm text-white font-medium">
                    <Icon name="delete_sweep" className="text-lg" /> Clear current queue
                  </button>
                  <button className="flex items-center gap-3 w-full py-3 px-4 bg-[#282828] hover:bg-[#333333] transition-colors rounded-lg text-sm text-white font-medium">
                    <Icon name="playlist_add" className="text-lg" /> Save queue as playlist
                  </button>
                  <button onClick={() => setShuffle(!shuffle)} className="flex items-center gap-3 w-full py-3 px-4 bg-[#282828] hover:bg-[#333333] transition-colors rounded-lg text-sm text-white font-medium">
                    <Icon name="shuffle" className={`text-lg ${shuffle ? 'text-primary' : ''}`} /> Shuffle entire queue
                  </button>
                </div>
              </div>
              
              <div className="h-px bg-neutral-800 mx-6"></div>
              
              <div className="p-6 space-y-4">
                <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.15em]">Track Actions</h4>
                <div className="space-y-1">
                  <div className="flex items-center gap-4 py-2 text-sm text-neutral-300 hover:text-white cursor-pointer">
                    <Icon name="add_circle" /> <span>Add to playlist</span>
                  </div>
                  <div className="flex items-center gap-4 py-2 text-sm text-neutral-300 hover:text-white cursor-pointer">
                    <Icon name="person" /> <span>Go to artist</span>
                  </div>
                  <div className="flex items-center gap-4 py-2 text-sm text-neutral-300 hover:text-white cursor-pointer">
                    <Icon name="share" /> <span>Share track</span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-neutral-800 mx-6"></div>
              
              <div className="p-6 space-y-4">
                <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.15em]">Audio Quality</h4>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 text-[11px] font-bold uppercase tracking-widest border border-neutral-700 rounded-full text-neutral-400 hover:text-white hover:border-neutral-500 transition-all">Low</button>
                  <button className="flex-1 py-2 text-[11px] font-bold uppercase tracking-widest border border-neutral-700 rounded-full text-neutral-400 hover:text-white hover:border-neutral-500 transition-all">Normal</button>
                  <button className="flex-1 py-2 text-[11px] font-bold uppercase tracking-widest bg-primary text-black border border-primary rounded-full shadow-[0_0_15px_rgba(29,185,84,0.3)]">High</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
