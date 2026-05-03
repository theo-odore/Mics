import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const API = 'http://localhost:3001/api'

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function getNowPlayingPanelWidth(title) {
  const textLength = (title || '').trim().length
  const estimatedWidth = 170 + textLength * 7.5
  return clamp(Math.round(estimatedWidth), 220, 520)
}

function normalizeRgb([r, g, b]) {
  // Keep ambient colors soft and premium by avoiding both muddy darks and neon highs.
  return [
    clamp(Math.round(r * 0.75 + 45), 42, 205),
    clamp(Math.round(g * 0.78 + 45), 42, 205),
    clamp(Math.round(b * 0.8 + 45), 42, 205)
  ]
}

async function extractCoverColor(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        const size = 56
        canvas.width = size
        canvas.height = size
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data

        let r = 0
        let g = 0
        let b = 0
        let count = 0

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3]
          if (alpha < 90) continue
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          count += 1
        }

        if (!count) {
          resolve([29, 185, 84])
          return
        }

        resolve(normalizeRgb([r / count, g / count, b / count]))
      } catch {
        resolve([29, 185, 84])
      }
    }

    img.onerror = () => resolve([29, 185, 84])
    img.src = imageUrl
  })
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
  const [ambientRgb, setAmbientRgb] = useState([29, 185, 84])
  const [ambientIntensity, setAmbientIntensity] = useState(() => {
    try { return parseFloat(localStorage.getItem('mics_ambient_intensity') || '0.27') } catch { return 0.27 }
  })
  
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
  const [trendingScope, setTrendingScope] = useState('global') // 'global' or 'national'
  const [trendingCountry, setTrendingCountry] = useState(() => (navigator?.language?.toUpperCase?.()?.includes('IN') ? 'IN' : 'US'))
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mics_recent') || '[]') }
    catch { return [] }
  })
  const [queue, setQueue] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [volume, setVolume] = useState(() => {
    try { return parseFloat(localStorage.getItem('mics_volume') || '1') } catch { return 1 }
  })
  const [isMuted, setIsMuted] = useState(false)
  const prevVolumeRef = useRef(1)
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState(false)
  const footerRef = useRef(null)
  const [modalImageLoaded, setModalImageLoaded] = useState(false)
  const [modalImageError, setModalImageError] = useState(false)
  const visualizerCanvasRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const mediaSourceRef = useRef(null)
  const rafVisualizerRef = useRef(null)

  const audioRef = useRef(null)
  const rafRef = useRef(null)
  const searchTimerRef = useRef(null)
  const playNextRef = useRef(null)
  const volumeBarRef = useRef(null)
  const isVolumeScrubbingRef = useRef(false)
  // Stores API-provided duration; fallback when audio.duration is Infinity (chunked stream)
  const trackDurationRef = useRef(0)

  // ===== Audio Engine =====
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    // Restore persisted volume
    try { audio.volume = parseFloat(localStorage.getItem('mics_volume') || '1') } catch { audio.volume = 1 }
    audioRef.current = audio

    // Setup AudioContext, MediaElementSource and Analyser once here to avoid multiple creations
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) {
        const ctx = audioCtxRef.current || new AC()
        audioCtxRef.current = ctx

        // create media source if not already created
        if (!mediaSourceRef.current) {
          try {
            mediaSourceRef.current = ctx.createMediaElementSource(audio)
          } catch (err) {
            mediaSourceRef.current = null
          }
        }

        if (!analyserRef.current && mediaSourceRef.current) {
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          mediaSourceRef.current.connect(analyser)
          analyser.connect(ctx.destination)
          analyserRef.current = analyser
        }
      }
    } catch (err) {
      // ignore audio context setup errors
    }

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
      if (repeat === 2) {
        audio.currentTime = 0
        audio.play()
      } else {
        playNextRef.current?.()
      }
    }
    audio.addEventListener('ended', handler)
    return () => audio.removeEventListener('ended', handler)
  }, [repeat])

  const updateProgress = useCallback(() => {
    const audio = audioRef.current
    if (audio && !audio.paused && Number.isFinite(audio.currentTime)) {
      const ct = audio.currentTime
      // Use audio.duration when finite; fall back to trackDurationRef when stream
      // is chunked (browser reports Infinity for duration with no Content-Length).
      const dur = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : trackDurationRef.current
      setCurrentTime(ct)
      if (dur > 0) {
        setDuration(dur)
        setProgress((ct / dur) * 100)
      }
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

  // Sync trackDurationRef whenever the track changes
  useEffect(() => {
    const d = Number(currentTrack?.duration)
    trackDurationRef.current = Number.isFinite(d) && d > 0 ? d : 0
  }, [currentTrack])

  // ===== Volume Control =====
  const applyVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolume(clamped)
    setIsMuted(clamped === 0)
    if (clamped > 0) prevVolumeRef.current = clamped
    if (audioRef.current) audioRef.current.volume = clamped
    try { localStorage.setItem('mics_volume', String(clamped)) } catch {}
  }, [])

  const toggleMute = useCallback(() => {
    if (isMuted || volume === 0) {
      applyVolume(prevVolumeRef.current || 0.7)
    } else {
      prevVolumeRef.current = volume
      applyVolume(0)
    }
  }, [isMuted, volume, applyVolume])

  const seekVolumeToClientX = useCallback((clientX) => {
    const bar = volumeBarRef.current
    if (!bar) return
    const bounds = bar.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - bounds.left, bounds.width))
    applyVolume(x / bounds.width)
  }, [applyVolume])

  const handleVolumePointerDown = useCallback((e) => {
    isVolumeScrubbingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekVolumeToClientX(e.clientX)
  }, [seekVolumeToClientX])

  const handleVolumePointerMove = useCallback((e) => {
    if (!isVolumeScrubbingRef.current) return
    seekVolumeToClientX(e.clientX)
  }, [seekVolumeToClientX])

  const handleVolumePointerUp = useCallback(() => {
    isVolumeScrubbingRef.current = false
  }, [])

  // ===== Load trending (global or national) =====
  useEffect(() => {
    const scope = trendingScope || 'global'
    const countryParam = scope === 'national' ? `?country=${encodeURIComponent(trendingCountry)}` : ''
    const url = `${API}/trending${countryParam}${scope === 'national' ? `&scope=national` : (countryParam ? '&scope=global' : '')}`
    fetch(url)
      .then(r => r.json())
      .then(t => { if (t && t.length) setTrending(t) })
      .catch(() => {})
  }, [trendingScope, trendingCountry])

  // ===== Try server-side geolocation, fallback to navigator.language =====
  useEffect(() => {
    let mounted = true
    fetch(`${API}/geolocate`).then(r => r.json()).then(j => {
      if (!mounted) return
      if (j && j.country) {
        setTrendingCountry(j.country.toUpperCase())
        // if the country is India, default to national trending
        if (j.country.toUpperCase() === 'IN') setTrendingScope('national')
      }
    }).catch(() => {
      // fallback already handled by initial state
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const targetCover = currentTrack?.thumbnail || trending[0]?.thumbnail
    if (!targetCover) return
    let cancelled = false

    extractCoverColor(targetCover).then((rgb) => {
      if (!cancelled) setAmbientRgb(rgb)
    })

    return () => {
      cancelled = true
    }
  }, [currentTrack?.thumbnail, trending])

  // Apply ambient intensity to CSS variable and persist
  useEffect(() => {
    const v = String(ambientIntensity)
    try { localStorage.setItem('mics_ambient_intensity', v) } catch {}
    document.documentElement.style.setProperty('--ambient-alpha', v)
  }, [ambientIntensity])

  // ===== Persist =====
  useEffect(() => {
    localStorage.setItem('mics_liked', JSON.stringify([...liked]))
    localStorage.setItem('mics_liked_tracks', JSON.stringify(likedTracks))
  }, [liked, likedTracks])

  useEffect(() => {
    localStorage.setItem('mics_recent', JSON.stringify(recentlyPlayed))
  }, [recentlyPlayed])

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

    setRecentlyPlayed(prev => {
      const filtered = prev.filter(t => t.id !== track.id)
      return [track, ...filtered].slice(0, 30)
    })

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

  useEffect(() => {
    const handleKeyboardShortcuts = (e) => {
      const target = e.target
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (isTypingTarget) return

      const audio = audioRef.current
      const key = e.key.toLowerCase()

      // Don't handle shortcuts when modifier keys are pressed (allow browser defaults)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (key === ' ' || key === 'spacebar') {
        if (!currentTrack) return
        e.preventDefault()
        togglePlay()
        return
      }

      if (key === 'm') {
        if (!currentTrack) return
        e.preventDefault()
        toggleMute()
        return
      }

      if (key === 'arrowleft') {
        if (!audio || !currentTrack) return
        e.preventDefault()
        audio.currentTime = Math.max(0, audio.currentTime - 5)
        return
      }

      if (key === 'arrowright') {
        if (!audio || !currentTrack) return
        e.preventDefault()
        const maxTime = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : trackDurationRef.current
        audio.currentTime = Math.min(maxTime || audio.currentTime + 5, audio.currentTime + 5)
        return
      }

      if (key === 'arrowup') {
        if (!audio || !currentTrack) return
        e.preventDefault()
        applyVolume(volume + 0.05)
        return
      }

      if (key === 'arrowdown') {
        if (!audio || !currentTrack) return
        e.preventDefault()
        applyVolume(volume - 0.05)
        return
      }

      if (key === 's') {
        e.preventDefault()
        setShuffle((value) => !value)
        return
      }

      if (key === 'r') {
        e.preventDefault()
        setRepeat((value) => (value + 1) % 3)
        return
      }

      if (key === 'l') {
        if (!currentTrack) return
        e.preventDefault()
        toggleLike({ stopPropagation: () => {} }, currentTrack)
        return
      }

      if (key === 'n') {
        if (!currentTrack) return
        e.preventDefault()
        playNext()
        return
      }

      if (key === 'p') {
        if (!currentTrack) return
        e.preventDefault()
        playPrev()
        return
      }

      if (key === '1') {
        e.preventDefault()
        setActiveNav('home')
        return
      }

      if (key === '2') {
        e.preventDefault()
        setActiveNav('search')
        return
      }

      if (key === '3') {
        e.preventDefault()
        setActiveNav('liked')
        return
      }

      if (key === '4') {
        e.preventDefault()
        setActiveNav('queue')
      }
    }

    window.addEventListener('keydown', handleKeyboardShortcuts)
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts)
  }, [applyVolume, currentTrack, playNext, playPrev, setActiveNav, toggleLike, toggleMute, togglePlay, volume])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isNowPlayingOpen) setIsNowPlayingOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isNowPlayingOpen])

  // Preload modal image and start visualizer when modal opens
  useEffect(() => {
    if (!isNowPlayingOpen || !currentTrack) return

    setModalImageLoaded(false)
    setModalImageError(false)

    // Preload thumbnail
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setModalImageLoaded(true)
    img.onerror = () => setModalImageError(true)
    img.src = currentTrack.thumbnail || ''

    // Setup visualizer
    let localAudioCtx = audioCtxRef.current
    try {
      if (!localAudioCtx) {
        localAudioCtx = new (window.AudioContext || window.webkitAudioContext)()
        audioCtxRef.current = localAudioCtx
      }
    } catch (err) {
      localAudioCtx = null
    }

    const audioEl = audioRef.current
    if (localAudioCtx && audioEl) {
      try {
        // Ensure audio context is running (user gesture may be required)
        if (localAudioCtx.state === 'suspended') {
          localAudioCtx.resume().catch(() => {})
        }
        // Create media source + analyser once and reuse them to avoid DOMException
        if (!mediaSourceRef.current) {
          try {
            mediaSourceRef.current = localAudioCtx.createMediaElementSource(audioEl)
          } catch (err) {
            // creating source may fail if already created elsewhere
            mediaSourceRef.current = null
          }
        }

        if (!analyserRef.current && mediaSourceRef.current) {
          const analyser = localAudioCtx.createAnalyser()
          analyser.fftSize = 256
          mediaSourceRef.current.connect(analyser)
          analyser.connect(localAudioCtx.destination)
          analyserRef.current = analyser
        }

        const analyser = analyserRef.current
        if (!analyser) return
        const canvas = visualizerCanvasRef.current
        const ctx = canvas?.getContext('2d')
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        function draw() {
          rafVisualizerRef.current = requestAnimationFrame(draw)
          if (!ctx || !canvas) return
          analyser.getByteFrequencyData(dataArray)
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          const barWidth = (canvas.width / bufferLength) * 1.5
          let x = 0
          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 255
            const h = v * canvas.height
            ctx.fillStyle = `rgba(${Math.round(200 * v)}, ${Math.round(220 * v)}, ${Math.round(255 * v)}, 0.9)`
            ctx.fillRect(x, canvas.height - h, barWidth, h)
            x += barWidth + 1
          }
        }

        // Resize canvas to device pixels
        function resizeCanvas() {
          if (!visualizerCanvasRef.current || !ctx) return
          const c = visualizerCanvasRef.current
          const rect = c.getBoundingClientRect()
          const dpr = Math.max(1, window.devicePixelRatio || 1)
          c.width = Math.max(1, Math.floor(rect.width * dpr))
          c.height = Math.max(1, Math.floor(rect.height * dpr))
          c.style.width = rect.width + 'px'
          c.style.height = rect.height + 'px'
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.scale(dpr, dpr)
        }

        resizeCanvas()
        window.addEventListener('resize', resizeCanvas)
        draw()

        return () => {
          cancelAnimationFrame(rafVisualizerRef.current)
          window.removeEventListener('resize', resizeCanvas)
          try { analyser.disconnect() } catch {}
          analyserRef.current = null
        }
      } catch (err) {
        // ignore visualizer errors
      }
    }

    return () => {
      // no-op here; inner cleanup returned above
    }
  }, [isNowPlayingOpen, currentTrack])

  // Track Card Render Function
  const renderTrackCard = (track) => (
    <div 
      key={`card-${track.id}`}
      className="bg-white/5 backdrop-blur-xl p-md rounded-2xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer group relative shadow-[0_14px_40px_rgba(0,0,0,0.25)]"
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
      className="flex items-center gap-md p-sm rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer group transition-all"
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
    <div
      className="relative text-on-surface font-body-md antialiased min-h-screen flex overflow-hidden"
      style={{
        backgroundColor: '#070a10',
        '--ambient-rgb': ambientRgb.join(', ')
      }}
    >
      <div className="ambient-shell" aria-hidden="true">
        <div className="ambient-blob ambient-blob-a"></div>
        <div className="ambient-blob ambient-blob-b"></div>
        <div className="ambient-noise"></div>
      </div>

      {/* SideNavBar (WEB) */}
      <nav className="hidden md:flex bg-slate-950/55 backdrop-blur-2xl font-inter text-sm font-medium fixed left-0 top-0 h-full w-64 border-r border-white/10 flex-col p-6 gap-y-2 z-40">
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
      <main className="flex-1 ml-0 md:ml-64 mb-24 flex flex-col h-screen overflow-y-auto no-scrollbar pb-10 relative z-10">
        {/* TopAppBar */}
        <header className="bg-slate-950/45 backdrop-blur-2xl font-inter text-sm font-semibold sticky top-0 z-30 w-full flex justify-between items-center px-6 py-4 border-b border-white/10">
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
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full px-2 py-1 border border-white/6">
              <button onClick={() => setAmbientIntensity(0.14)} title="Soft" className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${ambientIntensity <= 0.14 ? 'bg-white text-black' : 'text-white/80'}`}>
                S
              </button>
              <button onClick={() => setAmbientIntensity(0.27)} title="Medium" className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${Math.abs(ambientIntensity - 0.27) < 0.01 ? 'bg-white text-black' : 'text-white/80'}`}>
                M
              </button>
              <button onClick={() => setAmbientIntensity(0.45)} title="Vibrant" className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${ambientIntensity >= 0.45 ? 'bg-white text-black' : 'text-white/80'}`}>
                V
              </button>
            </div>

            <button className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center">
              <Icon name="person" className="text-zinc-400" />
            </button>
          </div>
        </header>

        <div className="p-6 md:p-8 flex-1 max-w-[1600px] mx-auto w-full">
          
          {/* HOME VIEW */}
          {activeNav === 'home' && (
            <>
              {recentlyPlayed.length > 0 && (
                <section className="mb-12">
                  <h2 className="font-headline-md text-2xl font-bold text-white mb-6">Jump back in</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {recentlyPlayed.slice(0, 5).map(track => renderTrackCard(track))}
                  </div>
                </section>
              )}
              
              <section className="mb-16">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-headline-md text-3xl font-black tracking-tight text-white flex items-center gap-3">
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400 drop-shadow-sm">Trending</span>
                    <span className="text-zinc-300 text-base">{trendingScope === 'global' ? 'Global' : `Top in ${trendingCountry}`}</span>
                    <Icon name="local_fire_department" className="text-primary text-3xl animate-pulse drop-shadow-[0_0_15px_rgba(83,224,118,0.5)]" />
                  </h2>

                  <div className="flex items-center gap-2">
                    <button onClick={() => setTrendingScope('global')} className={`px-3 py-1 rounded ${trendingScope === 'global' ? 'bg-white text-black' : 'bg-white/5 text-white/80 hover:bg-white/10'}`}>
                      Global
                    </button>
                    <button onClick={() => { setTrendingScope('national'); }} className={`px-3 py-1 rounded ${trendingScope === 'national' ? 'bg-white text-black' : 'bg-white/5 text-white/80 hover:bg-white/10'}`}>
                      National
                    </button>
                    {trendingScope === 'national' && (
                      <select value={trendingCountry} onChange={(e) => setTrendingCountry(e.target.value)} className="ml-2 bg-[#2b2b2b] text-white px-2 py-1 rounded">
                        <option value="IN">India</option>
                        <option value="US">United States</option>
                        <option value="GB">United Kingdom</option>
                        <option value="CA">Canada</option>
                        <option value="AU">Australia</option>
                      </select>
                    )}
                  </div>
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
      <nav
        ref={footerRef}
        onClick={(e) => {
          // Open modal when clicking empty space in the footer (not on controls)
          const ignore = e.target instanceof HTMLElement && (
            e.target.closest('.player-controls-center') ||
            e.target.closest('.player-right') ||
            e.target.closest('button, a, input, select, textarea')
          )
          if (ignore) return
          if (!currentTrack) return
          setIsNowPlayingOpen(true)
        }}
        className="bg-slate-950/48 backdrop-blur-2xl text-white font-inter text-xs fixed bottom-0 w-full h-24 z-50 border-t border-white/10 grid grid-cols-[minmax(0,1fr)_1fr_minmax(0,1fr)] items-center px-4 md:px-6 gap-4"
      >
        
        {/* Now Playing Info */}
        <div
          onClick={(e) => {
            // Prevent opening the modal when clicking interactive elements inside the card
            if (e.target instanceof HTMLElement && e.target.closest('button, a')) return
            if (!currentTrack) return
            setIsNowPlayingOpen(true)
          }}
          className="justify-self-start inline-flex items-center gap-md flex-none min-w-0 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl px-2 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.28)] max-w-[min(520px,calc(100vw-18rem))] cursor-pointer"
          style={{ width: currentTrack ? `${getNowPlayingPanelWidth(currentTrack.title)}px` : '220px' }}
        >
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
        <div className="player-controls-center justify-self-center flex flex-col items-center justify-center w-full">
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
            <div className="h-1.5 flex-1 bg-zinc-800 rounded-full overflow-hidden group cursor-pointer relative" onClick={handleSeek}>
              <div className="h-full bg-white group-hover:bg-primary transition-colors rounded-full relative" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="text-[11px] text-zinc-400 w-8">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume & Extras (Desktop) */}
        <div className="player-right justify-self-end hidden md:flex items-center justify-end gap-4 text-zinc-400 min-w-0">
          <button onClick={() => setActiveNav('queue')} className={`hover:text-white hover:scale-110 transition-transform ${activeNav === 'queue' ? 'text-primary' : ''}`}>
            <Icon name="queue_music" className="text-[20px]" />
          </button>
          <div className="flex items-center gap-2 w-28 group/vol">
            <button onClick={toggleMute} className="hover:text-white transition-colors flex-shrink-0">
              <Icon name={volume === 0 || isMuted ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'} className="text-[18px]" />
            </button>
            <div
              ref={volumeBarRef}
              className="h-1.5 flex-1 bg-zinc-700 rounded-full cursor-pointer relative group-hover/vol:h-2 transition-all"
              onPointerDown={handleVolumePointerDown}
              onPointerMove={handleVolumePointerMove}
              onPointerUp={handleVolumePointerUp}
            >
              <div
                className="h-full bg-white group-hover/vol:bg-primary transition-colors rounded-full relative"
                style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/vol:opacity-100 transition-opacity shadow" />
              </div>
            </div>
          </div>
        </div>
        
      </nav>
      
      {/* Mobile Bottom Nav (replaces sidebar on small screens) */}
      <nav className="md:hidden bg-slate-950/58 backdrop-blur-2xl text-white fixed bottom-24 w-full h-16 z-40 border-t border-white/10 flex justify-around items-center px-2">
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
      
      {/* Now Playing Modal */}
      {isNowPlayingOpen && currentTrack && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 2147483647 }}
          onClick={(e) => {
            // close when clicking outside the modal inner content (allow clicks on controls)
            const clickedInsideModal = e.target instanceof HTMLElement && !!e.target.closest('.nowplaying-inner')
            if (!clickedInsideModal) setIsNowPlayingOpen(false)
          }}
        >
          <div
            className="absolute inset-0 bg-center bg-cover"
            style={{
              backgroundImage: `url(${currentTrack.thumbnail})`,
              filter: 'blur(28px) brightness(0.45) saturate(0.8)',
              backgroundPosition: 'center',
              backgroundSize: '160%',
              backgroundRepeat: 'no-repeat'
            }}
          />
          <div className="absolute inset-0 bg-black/48" />

          <div className="nowplaying-inner relative z-10 flex flex-col items-center gap-6 p-6 max-w-[920px] w-full mx-4">
            <div className="nowplaying-cover rounded-2xl overflow-hidden shadow-2xl bg-black/40">
              {!modalImageLoaded && !modalImageError && (
                <div className="w-[min(520px,90vw)] h-[min(520px,90vw)] flex items-center justify-center bg-zinc-900/30">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {modalImageError && (
                <div className="w-[min(520px,90vw)] h-[min(520px,90vw)] flex items-center justify-center bg-zinc-800 text-zinc-400">
                  <Icon name="music_note" className="text-4xl" />
                </div>
              )}

              {!modalImageError && (
                <img
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  className={`w-[min(520px,90vw)] h-auto object-cover block ${modalImageLoaded ? '' : 'hidden'}`}
                  onLoad={() => setModalImageLoaded(true)}
                  onError={() => { setModalImageError(true); setModalImageLoaded(false) }}
                />
              )}
            </div>

            <div className="text-center">
              <h3 className="text-white text-2xl font-semibold truncate">{currentTrack.title}</h3>
              <p className="text-zinc-300 mt-1">{currentTrack.artist}</p>
            </div>

            <div className="w-full max-w-2xl px-4">
              <div className="flex items-center gap-3 justify-center mb-3">
                <button onClick={() => setShuffle(!shuffle)} className={`hover:scale-110 transition-transform ${shuffle ? 'text-primary' : 'text-zinc-400 hover:text-white'}`}>
                  <Icon name="shuffle" />
                </button>
                <button onClick={playPrev} className="text-zinc-400 hover:text-white hover:scale-110 transition-transform">
                  <Icon name="skip_previous" />
                </button>
                <button onClick={togglePlay} className="text-black hover:scale-105 transition-transform bg-white rounded-full flex items-center justify-center p-2 w-12 h-12 shadow-lg">
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Icon name={isPlaying ? 'pause' : 'play_arrow'} />
                  )}
                </button>
                <button onClick={playNext} className="text-zinc-400 hover:text-white hover:scale-110 transition-transform">
                  <Icon name="skip_next" />
                </button>
                <button onClick={() => setRepeat((repeat + 1) % 3)} className={`hidden sm:block hover:scale-110 transition-transform ${repeat > 0 ? 'text-primary' : 'text-zinc-400 hover:text-white'}`}>
                  <Icon name={repeat === 2 ? 'repeat_one' : 'repeat'} />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-300 w-12 text-right">{formatTime(currentTime)}</span>
                <div className="h-1.5 flex-1 bg-zinc-800 rounded-full overflow-hidden group cursor-pointer relative" onClick={(e) => handleSeek(e)}>
                  <div className="h-full bg-white group-hover:bg-primary transition-colors rounded-full relative" style={{ width: `${progress}%` }}></div>
                </div>
                <span className="text-sm text-zinc-300 w-12 text-left">{formatTime(duration)}</span>
              </div>

              <div className="mt-4">
                <canvas ref={visualizerCanvasRef} className="w-full h-24 bg-transparent" />
              </div>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  )
}
