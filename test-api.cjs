const http = require('http');

http.get('http://localhost:3001/api/stream/bCyrVBqncJk', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${data}`);
  });
}).on('error', (err) => {
  console.log('Error: ' + err.message);
});
