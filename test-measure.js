import fs from 'fs';
import puppeteer from 'puppeteer';

(async () => {
  const imgPath = 'C:\\Users\\tirth\\.gemini\\antigravity-ide\\brain\\f543248c-4924-4d00-9080-82d8d288f16b\\media__1779644990382.png';
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const base64 = fs.readFileSync(imgPath).toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;

  await page.setContent(`
    <html>
      <body>
        <canvas id="canvas"></canvas>
        <script>
          const img = new Image();
          img.onload = () => {
            const canvas = document.getElementById('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;

            // Define the Y ranges for the 9 thumbnails roughly:
            const ranges = [
              { start: 29, end: 88, name: 'Thumb 1' },
              { start: 124, end: 183, name: 'Thumb 2' },
              { start: 219, end: 278, name: 'Thumb 3' },
              { start: 314, end: 373, name: 'Thumb 4' },
              { start: 409, end: 468, name: 'Thumb 5' },
              { start: 504, end: 563, name: 'Thumb 6' },
              { start: 599, end: 658, name: 'Thumb 7' },
              { start: 694, end: 753, name: 'Thumb 8' },
              { start: 754, end: 800, name: 'Thumb 9' }
            ];

            const results = [];
            // In each range, the thumbnail is centered horizontally and vertically
            // Let's find the bounding box of the non-background pixels inside a narrow vertical band in the middle
            // to avoid detecting the horizontal row background or text.
            // The thumbnail is located roughly in the middle horizontally, let's say between x=21 and x=80.
            // Let's analyze pixels at x=50 (the center) and check the vertical extent of the thumbnail.
            // The thumbnail background is bg-surface-container-high or similar, but the thumbnail image itself has colors.
            // Let's identify background color at (0, y).
            ranges.forEach(r => {
              const bgR = data[(r.start * width) * 4];
              const bgG = data[(r.start * width) * 4 + 1];
              const bgB = data[(r.start * width) * 4 + 2];

              // Find vertical limits of the colored block in the middle column (x = 50)
              let minY = -1;
              let maxY = -1;
              for (let y = r.start; y <= r.end; y++) {
                const idx = (y * width + 50) * 4;
                const diff = Math.abs(data[idx] - bgR) + Math.abs(data[idx+1] - bgG) + Math.abs(data[idx+2] - bgB);
                if (diff > 15) {
                  if (minY === -1) minY = y;
                  maxY = y;
                }
              }
              results.push({ name: r.name, minY, maxY, h: maxY !== -1 ? (maxY - minY + 1) : 0 });
            });
            window.results = results;
          };
          img.src = '${dataUrl}';
        </script>
      </body>
    </html>
  `);

  await new Promise(r => setTimeout(r, 2000));
  const results = await page.evaluate(() => window.results);
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
