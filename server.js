import express from 'express'
import cors from 'cors'
import YTMusic from 'ytmusic-api'

const ytm = new YTMusic()
// Initialize YTMusic in the background
ytm.initialize()

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// ===== Helper for Bulletproof Thumbnail Extraction =====
function getThumbnailUrl(v) {
  let url = '';
  if (v.thumbnails && Array.isArray(v.thumbnails) && v.thumbnails.length > 0) {
    url = v.thumbnails[v.thumbnails.length - 1].url || '';
  } else if (Array.isArray(v.thumbnail) && v.thumbnail.length > 0) {
    url = v.thumbnail[v.thumbnail.length - 1].url || '';
  } else if (typeof v.thumbnail === 'string') {
    url = v.thumbnail;
  }
  return typeof url === 'string' ? url.replace(/=w\d+-h\d+.*/, '=w800-h800-l90-rj') : '';
}

// ===== Search YouTube Music =====
app.get('/api/search', async (req, res) => {
  const q = req.query.q
  if (!q) return res.json([])

  try {
    const results = await ytm.searchSongs(q)
    const tracks = results
      .map(v => ({
        id: v.videoId,
        title: v.name || '',
        artist: v.artist?.name || '',
        thumbnail: getThumbnailUrl(v),
        duration: v.duration || 0,
        views: 0, // Not provided by YTMusic
      }))
    res.json(tracks)
  } catch (err) {
    console.error('Search error:', err.message)
    res.json([])
  }
})

// ===== Get Suggestions (Up Next) =====
app.get('/api/suggestions/:id', async (req, res) => {
  try {
    const results = await ytm.getUpNexts(req.params.id)
    const tracks = results.map(v => {
      // Convert duration "3:59" to seconds 239
      let durationSec = 0
      if (v.duration) {
        const parts = v.duration.split(':').map(Number)
        if (parts.length === 2) durationSec = parts[0] * 60 + parts[1]
        else if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2]
      }
      return {
        id: v.videoId,
        title: v.title || '',
        artist: v.artists || '',
        thumbnail: getThumbnailUrl(v),
        duration: durationSec,
        views: 0,
      }
    })
    res.json(tracks)
  } catch (err) {
    console.error('Suggestions error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ===== Get Lyrics =====
app.get('/api/lyrics/:id', async (req, res) => {
  try {
    const lyrics = await ytm.getLyrics(req.params.id)
    res.json(lyrics || [])
  } catch (err) {
    console.error('Lyrics error:', err.message)
    res.json([])
  }
})

// ===== Search Autocomplete =====
app.get('/api/search/suggestions', async (req, res) => {
  try {
    const q = req.query.q
    if (!q) return res.json([])
    const suggestions = await ytm.getSearchSuggestions(q)
    res.json(suggestions || [])
  } catch (err) {
    res.json([])
  }
})

// ===== Explore Algorithms (Home Feeds) =====
app.get('/api/explore', async (req, res) => {
  try {
    const sections = await ytm.getHomeSections()
    res.json(sections || [])
  } catch (err) {
    console.error('Explore error:', err.message)
    res.json([])
  }
})

import youtubedl from 'youtube-dl-exec'

import https from 'https'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

const urlCache = new Map()

// Simple Semaphore Queue to limit concurrent headless browsers
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

// yt-dlp primary extraction with retry
async function extractPrimary(id, attempt = 1) {
  try {
    const url = `https://www.youtube.com/watch?v=${id}`
    const rawOutput = await youtubedl(url, { dumpJson: true, format: 'bestaudio' })
    console.log(`[yt-dlp] Success! Extracted URL for ${id} on attempt ${attempt}.`)
    return rawOutput.url
  } catch (err) {
    console.warn(`[yt-dlp] Extraction failed on attempt ${attempt} for ${id}.`)
    if (attempt < 2) {
      console.log(`[yt-dlp] Retrying...`)
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
        // 1. Primary Method: Fast yt-dlp scraping with retry
        directUrl = await extractPrimary(id)
      } catch (err) {
        console.warn(`[yt-dlp] Primary extraction completely failed for ${id}. Triggering headless fallback...`)
        // 2. Fallback Method: Headless browser interception with stealth and queuing
        directUrl = await getAudioUrlViaPuppeteer(id)
      }
      
      urlCache.set(id, directUrl)
      // Expire cache after 5 minutes per user request
      setTimeout(() => urlCache.delete(id), 5 * 60 * 1000)
    }

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    }
    if (req.headers.range) {
      options.headers.Range = req.headers.range
    }

    const proxyReq = https.get(directUrl, options, (streamRes) => {
      if (streamRes.statusCode === 403) {
        urlCache.delete(id) // Clear cache if expired
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

// ===== Trending =====
app.get('/api/trending', async (req, res) => {
  try {
    const results = await ytm.searchSongs('popular english hit songs')
    const tracks = results
      .slice(0, 12)
      .map(v => ({
        id: v.videoId,
        title: v.name || '',
        artist: v.artist?.name || '',
        thumbnail: getThumbnailUrl(v),
        duration: v.duration || 0,
        views: 0,
      }))
    res.json(tracks)
  } catch (err) {
    console.error('Trending error:', err.message)
    res.json([])
  }
})

app.listen(PORT, () => {
  console.log(`\n  🎵 Mics Server running at http://localhost:${PORT}`)
  console.log(`  ├─ Search:  GET /api/search?q=song+name`)
  console.log(`  ├─ Stream:  GET /api/stream/:videoId`)
  console.log(`  ├─ Info:    GET /api/info/:videoId`)
  console.log(`  └─ Trending: GET /api/trending\n`)
})
