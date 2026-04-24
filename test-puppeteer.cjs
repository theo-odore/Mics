const puppeteer = require('puppeteer');

async function test() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  let audioUrl = null;
  
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.includes('googlevideo.com/videoplayback') && url.includes('mime=audio')) {
      audioUrl = url;
      console.log('Found Audio URL:', url.substring(0, 50) + '...');
    }
    req.continue();
  });

  console.log('Navigating to YouTube...');
  await page.goto('https://www.youtube.com/watch?v=Umqb9KENgmk');
  
  let attempts = 0;
  while (!audioUrl && attempts < 50) {
    await new Promise(r => setTimeout(r, 200));
    attempts++;
  }
  
  if (audioUrl) {
    console.log('Success!');
  } else {
    console.log('Failed to find audio URL.');
  }
  await browser.close();
}

test().catch(console.error);
