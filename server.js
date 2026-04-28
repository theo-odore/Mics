import express from 'express'
import cors from 'cors'
import YTMusic from 'ytmusic-api'
import youtubeSr from 'youtube-sr'
import youtubedl from 'youtube-dl-exec'
import https from 'https'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

const YouTube = youtubeSr.default || youtubeSr;
const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// ===== YouTube Music API (Primary Search Engine) =====
let ytmusic = null
let ytmusicReady = false

async function initYTMusic() {
  try {
    ytmusic = new YTMusic()
    await ytmusic.initialize()
    ytmusicReady = true
    console.log('  ✅ YouTube Music API initialized successfully')
  } catch (err) {
    console.error('  ❌ YouTube Music API init failed:', err.message)
    ytmusicReady = false
  }
}

// Retry init if it fails
async function ensureYTMusic() {
  if (ytmusicReady && ytmusic) return true
  try {
    ytmusic = new YTMusic()
    await ytmusic.initialize()
    ytmusicReady = true
    return true
  } catch {
    return false
  }
}

// ===== Helper: Parse duration string "3:42" to seconds =====
function parseDuration(durStr) {
  if (!durStr || typeof durStr !== 'string') return 0
  const parts = durStr.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

// Helper: wrap thumbnail URL through our proxy for reliable loading
function proxyThumb(url) {
  if (!url) return ''
  // Upscale googleusercontent URLs to 544x544 through our proxy
  if (url.includes('googleusercontent.com') && url.includes('=w')) {
    url = url.replace(/=w\d+-h\d+[^&\s]*/g, '=w544-h544-l90-rj')
  }
  return `http://localhost:3001/api/thumb?url=${encodeURIComponent(url)}`
}

// ===== Helper: Get best thumbnail =====
function getBestThumbnail(thumbnails, videoId) {
  let url = ''
  if (thumbnails && Array.isArray(thumbnails) && thumbnails.length > 0) {
    const sorted = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))
    url = sorted[0].url || ''
  } else if (videoId) {
    url = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  }
  return proxyThumb(url)
}

// ===== Map ytmusic-api song result to our track format =====
function mapYTMusicTrack(song) {
  const videoId = song.videoId || song.id || ''
  return {
    id: videoId,
    title: song.name || song.title || '',
    artist: song.artist?.name || song.artists || '',
    thumbnail: getBestThumbnail(song.thumbnails, videoId) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: song.duration ? (typeof song.duration === 'number' ? song.duration : parseDuration(song.duration)) : 0,
    views: song.views || 0,
    album: song.album?.name || '',
  }
}

// ===== Map youtube-sr video to our track format (fallback) =====
function mapYouTubeSrTrack(v) {
  const thumbUrl = v.thumbnail?.url || v.thumbnails?.[v.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
  return {
    id: v.id,
    title: v.title || '',
    artist: v.channel?.name || '',
    thumbnail: proxyThumb(thumbUrl),
    duration: Math.round((v.duration || 0) / 1000),
    views: v.views || 0,
  }
}

// ===== Thumbnail Proxy (avoids browser rate-limiting from Google) =====
app.get('/api/thumb', async (req, res) => {
  const url = req.query.url
  if (!url) return res.status(400).end()
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    })
    if (!response.ok) return res.status(response.status).end()
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    const buffer = Buffer.from(await response.arrayBuffer())
    res.send(buffer)
  } catch {
    res.status(502).end()
  }
})



// ===== Search YouTube Music =====
app.get('/api/search', async (req, res) => {
  const q = req.query.q
  if (!q) return res.json([])

  try {
    // Primary: YouTube Music API (returns actual songs, not video compilations)
    if (await ensureYTMusic()) {
      try {
        const songs = await ytmusic.searchSongs(q)
        if (songs && songs.length > 0) {
          console.log(`[Search] YTMusic: "${q}" → ${songs.length} songs`)
          return res.json(songs.map(mapYTMusicTrack))
        }
      } catch (err) {
        console.warn(`[Search] YTMusic search failed for "${q}":`, err.message?.slice(0, 80))
      }
    }

    // Fallback: youtube-sr with song filtering
    console.log(`[Search] Falling back to youtube-sr for "${q}"`)
    const results = await YouTube.search(`${q} song`, { limit: 20, type: 'video' })
    // Filter out compilations (>10 min) and non-music content
    const filtered = results.filter(v => {
      const dur = (v.duration || 0) / 1000
      return dur > 30 && dur < 600 // Between 30s and 10 min
    })
    res.json((filtered.length > 0 ? filtered : results).map(mapYouTubeSrTrack))
  } catch (err) {
    console.error('Search error:', err.message)
    res.json([])
  }
})

// ===== Search Suggestions (Autocomplete) =====
app.get('/api/search/suggestions', async (req, res) => {
  const q = req.query.q
  if (!q) return res.json([])

  try {
    if (await ensureYTMusic()) {
      const suggestions = await ytmusic.getSearchSuggestions(q)
      return res.json(suggestions || [])
    }
    res.json([])
  } catch (err) {
    console.error('Suggestions error:', err.message)
    res.json([])
  }
})

// ===== Get Up Next (Related Songs) =====
app.get('/api/suggestions/:id', async (req, res) => {
  try {
    // Primary: YouTube Music "Up Next" (proper radio-style queue)
    if (await ensureYTMusic()) {
      try {
        const upNext = await ytmusic.getUpNexts(req.params.id)
        if (upNext && upNext.length > 0) {
          const tracks = upNext
            .filter(t => t.videoId !== req.params.id)
            .map(t => ({
              id: t.videoId,
              title: t.title || t.name || '',
              artist: t.artists || t.artist?.name || '',
              thumbnail: getBestThumbnail(t.thumbnails, t.videoId) || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
              duration: t.duration ? parseDuration(t.duration) : 0,
            }))
          console.log(`[UpNext] YTMusic: ${req.params.id} → ${tracks.length} tracks`)
          return res.json(tracks)
        }
      } catch (err) {
        console.warn(`[UpNext] YTMusic failed:`, err.message?.slice(0, 80))
      }
    }

    // Fallback: youtube-sr search-based suggestions
    let searchQuery = 'trending music 2025'
    try {
      const video = await YouTube.getVideo(`https://youtube.com/watch?v=${req.params.id}`)
      searchQuery = video.channel?.name ? `${video.channel.name} songs` : (video.title || searchQuery)
    } catch {}

    const results = await YouTube.search(searchQuery, { limit: 15, type: 'video' })
    const tracks = results
      .filter(v => v.id !== req.params.id && (v.duration || 0) / 1000 < 600)
      .map(mapYouTubeSrTrack)
    res.json(tracks)
  } catch (err) {
    console.error('Suggestions error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ===== Home Sections (YouTube Music Discover Feed) =====
app.get('/api/home', async (req, res) => {
  try {
    if (await ensureYTMusic()) {
      try {
        const sections = await ytmusic.getHomeSections()
        if (sections && sections.length > 0) {
          const mapped = sections.map(section => ({
            title: section.title || '',
            contents: (section.contents || []).map(item => ({
              id: item.videoId || item.playlistId || '',
              type: item.type || 'SONG',
              title: item.name || item.title || '',
              artist: item.artist?.name || item.artists || '',
              thumbnail: getBestThumbnail(item.thumbnails, item.videoId),
              duration: item.duration ? parseDuration(item.duration) : 0,
              playlistId: item.playlistId || null,
            }))
          }))
          console.log(`[Home] ${mapped.length} sections loaded`)
          return res.json(mapped)
        }
      } catch (err) {
        console.warn('[Home] YTMusic home sections failed:', err.message?.slice(0, 80))
      }
    }
    res.json([])
  } catch (err) {
    console.error('Home error:', err.message)
    res.json([])
  }
})

// ===== Trending (curated from YouTube Music) =====
app.get('/api/trending', async (req, res) => {
  try {
    // Try YouTube Music search for trending songs
    if (await ensureYTMusic()) {
      try {
        const songs = await ytmusic.searchSongs('trending songs 2025')
        if (songs && songs.length > 0) {
          console.log(`[Trending] YTMusic: ${songs.length} songs`)
          return res.json(songs.map(mapYTMusicTrack))
        }
      } catch (err) {
        console.warn('[Trending] YTMusic failed:', err.message?.slice(0, 80))
      }
    }

    // Fallback: youtube-sr
    const results = await YouTube.search('trending music 2025', { limit: 20, type: 'video' })
    const filtered = results.filter(v => (v.duration || 0) / 1000 < 600)
    res.json((filtered.length > 0 ? filtered : results).map(mapYouTubeSrTrack))
  } catch (err) {
    console.error('Trending error:', err.message)
    res.json([])
  }
})

// ===== Song Info =====
app.get('/api/info/:id', async (req, res) => {
  try {
    if (await ensureYTMusic()) {
      try {
        const song = await ytmusic.getSong(req.params.id)
        if (song) {
          return res.json(mapYTMusicTrack(song))
        }
      } catch {}
    }
    // Fallback
    const video = await YouTube.getVideo(`https://youtube.com/watch?v=${req.params.id}`)
    res.json(mapYouTubeSrTrack(video))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ===== Streaming Infrastructure =====
const urlCache = new Map()

class BrowserQueue {
  constructor(limit) {
    this.limit = limit
    this.active = 0
    this.queue = []
  }
  async acquire() {
    if (this.active >= this.limit) {
      await new Promise(resolve => this.queue.push(resolve))
    }
    this.active++
  }
  release() {
    this.active--
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      next()
    }
  }
}
const browserQueue = new BrowserQueue(2)

// Headless fallback to manually extract the googlevideo URL
async function getAudioUrlViaPuppeteer(id, attempt = 1) {
  console.log(`[Fallback] Booting headless browser for ${id} (Attempt ${attempt})...`)
  await browserQueue.acquire()
  
  let browser = null
  let audioUrl = null

  try {
    browser = await puppeteer.launch({ headless: 'new' })
    const page = await browser.newPage()

    await page.setRequestInterception(true)
    page.on('request', req => {
      const url = req.url()
      if (['image', 'stylesheet', 'font', 'other'].includes(req.resourceType())) {
        req.abort()
        return
      }
      if (url.includes('googlevideo.com/videoplayback') && url.includes('mime=audio')) {
        audioUrl = url
      }
      req.continue()
    })

    await page.goto(`https://www.youtube.com/watch?v=${id}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
    let attempts = 0
    while (!audioUrl && attempts < 50) {
      await new Promise(r => setTimeout(r, 200))
      attempts++
    }
  } catch (err) {
    console.error(`[Fallback] Puppeteer error on attempt ${attempt}:`, err.message)
  } finally {
    if (browser) await browser.close()
    browserQueue.release()
  }

  if (!audioUrl) {
    if (attempt < 2) {
      console.log(`[Fallback] Retrying Puppeteer for ${id}...`)
      return await getAudioUrlViaPuppeteer(id, attempt + 1)
    }
    console.error(`[Fallback] FATAL: Headless interception failed after 2 attempts.`)
    throw new Error("Fallback failed: Could not intercept audio URL via headless browser.")
  }
  
  console.log(`[Fallback] Success! Extracted raw stream URL via Puppeteer.`)
  return audioUrl
}

// yt-dlp primary extraction with retry and delay
async function extractPrimary(id, attempt = 1) {
  try {
    const url = `https://www.youtube.com/watch?v=${id}`
    const rawOutput = await youtubedl(url, { dumpJson: true, format: 'bestaudio' })
    console.log(`[yt-dlp] Success! Extracted URL for ${id} on attempt ${attempt}.`)
    return rawOutput.url
  } catch (err) {
    console.warn(`[yt-dlp] Extraction failed on attempt ${attempt} for ${id}: ${err.message?.slice(0, 80)}`)
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * attempt))
      console.log(`[yt-dlp] Retrying (attempt ${attempt + 1})...`)
      return await extractPrimary(id, attempt + 1)
    }
    throw err
  }
}

// ===== Stream audio =====
app.get('/api/stream/:id', async (req, res) => {
  try {
    const id = req.params.id
    let directUrl = urlCache.get(id)

    if (!directUrl) {
      try {
        directUrl = await extractPrimary(id)
      } catch (err) {
        console.warn(`[yt-dlp] Primary extraction completely failed for ${id}. Triggering headless fallback...`)
        directUrl = await getAudioUrlViaPuppeteer(id)
      }
      
      urlCache.set(id, directUrl)
      setTimeout(() => urlCache.delete(id), 5 * 60 * 1000)
    }

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      }
    }
    if (req.headers.range) {
      options.headers.Range = req.headers.range
    }

    const proxyReq = https.get(directUrl, options, (streamRes) => {
      if (streamRes.statusCode === 403) {
        urlCache.delete(id)
      }
      const proxyHeaders = { ...streamRes.headers, 'Access-Control-Allow-Origin': '*' }
      res.writeHead(streamRes.statusCode, proxyHeaders)
      streamRes.pipe(res)
    })

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message)
      if (!res.headersSent) res.status(500).json({ error: err.message })
    })

    req.on('close', () => {
      proxyReq.destroy()
    })

  } catch (err) {
    console.error('Stream error:', err.message)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    }
  }
})

// ===== Boot =====
async function boot() {
  await initYTMusic()

  app.listen(PORT, () => {
    console.log(`\n  🎵 Mics Server running at http://localhost:${PORT}`)
    console.log(`  ├─ Search:      GET /api/search?q=song+name`)
    console.log(`  ├─ Suggestions: GET /api/search/suggestions?q=blind`)
    console.log(`  ├─ Stream:      GET /api/stream/:videoId`)
    console.log(`  ├─ Up Next:     GET /api/suggestions/:videoId`)
    console.log(`  ├─ Home Feed:   GET /api/home`)
    console.log(`  ├─ Info:        GET /api/info/:videoId`)
    console.log(`  └─ Trending:    GET /api/trending\n`)
  })
}

boot()
