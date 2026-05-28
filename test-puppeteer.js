import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({headless: 'new'});
  const page = await browser.newPage();
  await page.setViewport({width: 1280, height: 720});
  console.log('Navigating to YouTube...');
  await page.goto('https://www.youtube.com/watch?v=iGNeO_wz3XQ', {waitUntil: 'networkidle2'});
  console.log('Taking screenshot...');
  await page.screenshot({path: 'yt-debug.png'});
  await browser.close();
  console.log('Done.');
})();
