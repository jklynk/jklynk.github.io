/**
 * Swim App - Data Fetcher Script (update.js)
 * Downloads real-time lane swim schedule data from the City of Toronto Open Data CKAN API.
 */

const http = require('https');
const fs = require('fs');
const path = require('path');

const PACKAGE_ID = '1a5be46a-4039-48cd-a2d2-8e702abf9516';
const BASE_URL = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action';

// Make a request with standard User-Agent to avoid blocks
function getJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    };

    http.get(url, options, (res) => {
      const { statusCode } = res;
      if (statusCode !== 200) {
        reject(new Error(`Request Failed. Status Code: ${statusCode}`));
        res.resume(); // Consume response data to free up memory
        return;
      }

      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(rawData);
          resolve(parsedData);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

// Helper to fetch raw HTML
function getHTML(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    http.get(url, options, (res) => {
      const { statusCode } = res;
      if (statusCode !== 200) {
        reject(new Error(`Request Failed. Status Code: ${statusCode}`));
        res.resume();
        return;
      }

      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        resolve(rawData);
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

/**
 * Main function to fetch the swim schedule data and save it.
 */
async function fetchSwimData() {
  console.log('[Fetcher] Initiating data update...');
  try {
    // 1. Fetch package_show to get metadata and find the Drop-in active resource ID
    const packageUrl = `${BASE_URL}/package_show?id=${PACKAGE_ID}`;
    console.log(`[Fetcher] Querying package metadata...`);
    const packageInfo = await getJSON(packageUrl);

    if (!packageInfo.success) {
      throw new Error(`Package query failed: ${JSON.stringify(packageInfo.error)}`);
    }

    const resources = packageInfo.result.resources;
    // Find the Drop-in XLSX active datastore resource
    const dropInResource = resources.find(r => 
      r.name && r.name.toLowerCase() === 'drop-in' && r.datastore_active === true
    );

    if (!dropInResource) {
      throw new Error('Could not find active "Drop-in" datastore resource.');
    }

    const resourceId = dropInResource.id;
    console.log(`[Fetcher] Found active "Drop-in" resource ID: ${resourceId}`);

    // 2. Fetch the records from the datastore search API
    const targetPoolIds = [58, 234, 145, 70, 437, 2012];
    const filters = JSON.stringify({ 'Location ID': targetPoolIds });
    const searchUrl = `${BASE_URL}/datastore_search?id=${resourceId}&limit=10000&filters=${encodeURIComponent(filters)}`;
    console.log(`[Fetcher] Downloading schedules for target pools (limit 10000)...`);
    const datastoreResult = await getJSON(searchUrl);

    if (!datastoreResult.success) {
      throw new Error(`Datastore search failed: ${JSON.stringify(datastoreResult.error)}`);
    }

    const records = datastoreResult.result.records || [];
    console.log(`[Fetcher] Downloaded ${records.length} records successfully.`);

    // 3. Save to swim-data.json
    const destPath = path.join(__dirname, 'swim-data.json');
    fs.writeFileSync(destPath, JSON.stringify(records, null, 2), 'utf8');
    console.log(`[Fetcher] Data successfully saved to: ${destPath}`);

    // 4. Fetch and save beach conditions
    await fetchBeachData();

    return records;
  } catch (error) {
    console.error('[Fetcher] Error during update:', error.message);
    throw error;
  }
}

// Configured beaches to monitor on openwaterdata.com
const BEACHES = [
  {
    key: 'cherry_beach',
    name: 'Cherry Beach',
    id: '5897068',
    slug: 'cherry-beach'
  },
  {
    key: 'woodbine_beach',
    name: 'Woodbine Beach',
    id: '5897050',
    slug: 'woodbine-beach'
  }
];

/**
 * Fetches water temperature and E.coli conditions from openwaterdata.com,
 * and scrapes wave conditions from the beach webpages.
 */
async function fetchBeachData() {
  console.log('[Fetcher] Initiating beach water conditions update...');
  const processed = {};

  for (const beach of BEACHES) {
    console.log(`[Fetcher] Fetching data for ${beach.name}...`);
    try {
      const tempUrl = `https://www.openwaterdata.com/site/data?s=${beach.id}&m=Water%20Temperature&d=30&f=json`;
      const ecoliUrl = `https://www.openwaterdata.com/site/data?s=${beach.id}&m=ecoli&d=30&f=json`;
      const htmlUrl = `https://www.openwaterdata.com/site/${beach.slug}`;

      console.log(`[Fetcher] Downloading ${beach.name} data (Temp, E.coli, HTML)...`);
      const [tempData, ecoliData, beachHtml] = await Promise.all([
        getJSON(tempUrl).catch(() => null),
        getJSON(ecoliUrl).catch(() => null),
        getHTML(htmlUrl).catch(err => {
          console.error(`[Fetcher] Error downloading HTML for ${beach.name}:`, err.message);
          return null;
        })
      ]);

      processed[beach.key] = {
        name: beach.name,
        waterTemp: null,
        ecoli: null,
        waveHeight: null
      };

      if (tempData && tempData.contents && tempData.contents.length > 0) {
        // Sort descending by CollectionTime
        const sortedTemp = tempData.contents.sort((a, b) => new Date(b.CollectionTime) - new Date(a.CollectionTime));
        const latest = sortedTemp[0];
        processed[beach.key].waterTemp = {
          value: latest.Result,
          time: latest.CollectionTime,
          collector: latest.Collector || `${beach.name} Buoy`
        };
      }

      if (ecoliData && ecoliData.contents && ecoliData.contents.length > 0) {
        // Sort descending by CollectionTime
        const sortedEcoli = ecoliData.contents.sort((a, b) => new Date(b.CollectionTime) - new Date(a.CollectionTime));
        const latest = sortedEcoli[0];
        processed[beach.key].ecoli = {
          value: latest.Result,
          time: latest.CollectionTime,
          collector: latest.Collector || 'City of Toronto'
        };
      }

      if (beachHtml) {
        const waveLiRegex = /<li[^>]*class="[^"]*wave[^"]*"[^>]*>([\s\S]*?)<\/li>/i;
        const waveLiMatch = beachHtml.match(waveLiRegex);
        if (waveLiMatch) {
          const content = waveLiMatch[1];
          const heightMatch = content.match(/<strong>([\d.]+)<\/strong>\s*<span class="units">m<\/span>/i);
          const waveHeight = heightMatch ? parseFloat(heightMatch[1]) : null;
          
          const periodMatch = content.match(/<strong>([\d.]+)<\/strong>\s*<span class="units">s<\/span>/i);
          const wavePeriod = periodMatch ? parseFloat(periodMatch[1]) : null;
          
          const dirMatch = content.match(/<strong>([^<]+)<\/strong>\s*<span class="units">\s*<\/span>/i);
          const waveDir = dirMatch ? dirMatch[1].trim() : null;
          
          const updatedMatch = content.match(/<span class="last-updated">([^<]+)<\/span>/i);
          const waveTimeStr = updatedMatch ? updatedMatch[1].trim() : null;

          if (waveHeight !== null) {
            processed[beach.key].waveHeight = {
              value: waveHeight,
              period: wavePeriod,
              direction: waveDir,
              time: waveTimeStr,
              collector: 'Windfinder'
            };
          }
        } else {
          console.warn(`[Fetcher] Could not locate wave height section in HTML for ${beach.name}.`);
        }
      }
    } catch (e) {
      console.error(`[Fetcher] Error updating beach conditions for ${beach.name}:`, e.message);
    }
  }

  try {
    const destPath = path.join(__dirname, 'beach-data.json');
    fs.writeFileSync(destPath, JSON.stringify(processed, null, 2), 'utf8');
    console.log(`[Fetcher] Beach conditions successfully saved to: ${destPath}`);
  } catch (error) {
    console.error('[Fetcher] Error saving beach conditions file:', error.message);
  }
}

// Support running directly from command line
if (require.main === module) {
  fetchSwimData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { fetchSwimData };
