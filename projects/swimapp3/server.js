/**
 * Swim App - Local Server (server.js)
 * A zero-dependency development server that serves the frontend files
 * and automatically keeps swim-data.json updated from the Toronto Open Data API.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { fetchSwimData } = require('./update');

const PORT = 3000;
const HOST = '0.0.0.0';
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour in milliseconds

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

let isUpdating = false;

/**
 * Checks if the swim data file needs an update and triggers it.
 * If the file is missing, it will await the update.
 * If the file is stale, it updates in the background.
 */
async function checkAndUpdateData() {
  const swimPath = path.join(__dirname, 'swim-data.json');
  const beachPath = path.join(__dirname, 'beach-data.json');
  let swimExists = false;
  let beachExists = false;
  let swimAgeMs = Infinity;

  try {
    const stats = fs.statSync(swimPath);
    swimExists = true;
    swimAgeMs = Date.now() - stats.mtimeMs;
  } catch (err) {}

  try {
    const stats = fs.statSync(beachPath);
    beachExists = true;
  } catch (err) {}

  const exists = swimExists && beachExists;

  if (isUpdating) {
    return exists; // Let caller know if we have files to fall back on
  }

  if (!exists) {
    console.log('[Server] Data files are missing. Fetching initial data...');
    isUpdating = true;
    try {
      await fetchSwimData();
      return true;
    } catch (err) {
      console.error('[Server] Initial data fetch failed:', err.message);
      return false;
    } finally {
      isUpdating = false;
    }
  } else if (swimAgeMs > UPDATE_INTERVAL_MS) {
    const ageHrs = (swimAgeMs / (60 * 60 * 1000)).toFixed(1);
    console.log(`[Server] Data is stale (${ageHrs} hours old). Updating in background...`);
    isUpdating = true;
    // Run update in background, do not await so we don't delay client response
    fetchSwimData()
      .then(() => {
        console.log('[Server] Background data update complete.');
      })
      .catch((err) => {
        console.error('[Server] Background data update failed:', err.message);
      })
      .finally(() => {
        isUpdating = false;
      });
  }

  return true;
}

const server = http.createServer(async (req, res) => {
  // Normalize URL path
  let reqUrl = req.url === '/' ? '/index.html' : req.url;
  
  // Clean query strings/hashes from path
  reqUrl = reqUrl.split('?')[0].split('#')[0];

  const filePath = path.join(__dirname, reqUrl);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Forbidden');
    return;
  }

  // If the request is for the swim data or beach data, check/update them
  if (reqUrl === '/swim-data.json' || reqUrl === '/beach-data.json') {
    const hasData = await checkAndUpdateData();
    if (!hasData) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Failed to fetch swim or beach data from APIs');
      return;
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('File Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);

    // Stream the file for performance
    const stream = fs.createReadStream(filePath);
    stream.on('error', (streamErr) => {
      console.error(`[Server] Stream error for ${reqUrl}:`, streamErr.message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Internal Server Error');
      }
    });
    stream.pipe(res);
  });
});

// Trigger a check/update on server startup
checkAndUpdateData().then(() => {
  server.listen(PORT, HOST, () => {
    console.log('\n==================================================');
    console.log(`🏊 Swim App Server running at: http://localhost:${PORT}`);
    console.log(`🌐 Accessible on local network/Tailscale via machine IP`);
    console.log(`   (e.g., http://<tailscale-ip>:${PORT} or MagicDNS name)`);
    console.log('==================================================\n');
  });
}).catch((err) => {
  console.error('[Server] Critical startup error:', err.message);
  process.exit(1);
});
