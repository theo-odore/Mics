const youtubedl = require('youtube-dl-exec');
async function test() {
  try {
    const rawOutput = await youtubedl('https://www.youtube.com/watch?v=bCyrVBqncJk', { dumpJson: true, format: 'bestaudio' });
    console.log(rawOutput.url);
  } catch (err) {
    console.error(err);
  }
}
test();
