import express from 'express'
import cors from 'cors'
import YouTube from 'youtube-sr'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// ===== Helper for Bulletproof Thumbnail Extraction =====
function getThumbnailUrl(v) {
  let url = '';
  if (v.thumbnail && v.thumbnail.url) {
    url = v.thumbnail.url;
  }
  return typeof url === 'string' ? url.replace(/=w\d+-h\d+[^?]*/, '=w800-h800-l90-rj') : '';
}

// ===== Search YouTube Music =====
app.get('/api/search', async (req, res) => {
  const q = req.query.q
  if (!q) return res.json([])

  try {
    const results = await YouTube.default.search(q, { type: 'video', limit: 30 })
    const tracks = results.map(v => ({
      id: v.id,
      title: v.title || '',
      artist: v.channel?.name || '',
      thumbnail: getThumbnailUrl(v) || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: Math.floor(v.duration / 1000) || 0,
      views: v.views || 0,
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
    const video = await YouTube.default.getVideo(`https://youtube.com/watch?v=${req.params.id}`)
    
    // Fallback: search using channel name if suggestions are not explicitly available
    const searchQ = video.channel?.name ? `${video.channel.name} song` : 'top music'
    const results = await YouTube.default.search(searchQ, { type: 'video', limit: 15 })
    
    const tracks = results.filter(v => v.id !== req.params.id).map(v => ({
      id: v.id,
      title: v.title || '',
      artist: v.channel?.name || '',
      thumbnail: getThumbnailUrl(v) || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: Math.floor(v.duration / 1000) || 0,
      views: v.views || 0,
    }))
    res.json(tracks)
  } catch (err) {
    console.error('Suggestions error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ===== Trending / Explore Feeds =====
app.get('/api/trending', async (req, res) => {
  try {
    // Search for trending music to simulate trending feed
    const results = await YouTube.default.search('top hit songs 2026 official music video', { type: 'video', limit: 20 })
    const tracks = results.map(v => ({
      id: v.id,
      title: v.title || '',
      artist: v.channel?.name || '',
      thumbnail: getThumbnailUrl(v) || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: Math.floor(v.duration / 1000) || 0,
      views: v.views || 0,
    }))
    res.json(tracks)
  } catch (err) {
    console.error('Trending error:', err.message)
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



app.listen(PORT, () => {
  console.log(`\n  🎵 Mics Server running at http://localhost:${PORT}`)
  console.log(`  ├─ Search:  GET /api/search?q=song+name`)
  console.log(`  ├─ Stream:  GET /api/stream/:videoId`)
  console.log(`  ├─ Info:    GET /api/info/:videoId`)
  console.log(`  └─ Trending: GET /api/trending\n`)
})
