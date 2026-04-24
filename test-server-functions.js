import youtubedl from 'youtube-dl-exec'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'

puppeteer.use(StealthPlugin())

async function testYtdl() {
  try {
    const url = `https://www.youtube.com/watch?v=bCyrVBqncJk`
    const rawOutput = await youtubedl(url, { dumpJson: true, format: 'bestaudio' })
    console.log('[yt-dlp] Success:', !!rawOutput.url)
  } catch (err) {
    console.error('[yt-dlp] Error:', err.message)
  }
}

async function testPuppeteer() {
  let browser
  try {
    browser = await puppeteer.launch({ headless: 'new' })
    console.log('[Puppeteer] Launched successfully')
  } catch (err) {
    console.error('[Puppeteer] Launch Error:', err.message)
  } finally {
    if (browser) await browser.close()
  }
}

async function run() {
  await testYtdl()
  await testPuppeteer()
}
run()
