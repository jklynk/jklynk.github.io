/**
 * Swim Dashboard App
 * Compares real-time open-water conditions with City of Toronto indoor/outdoor lane swim schedules.
 */

const TARGET_LOCATION_IDS = [58, 234, 145, 70, 437, 2012];
const locationLookup = {
    58: "Jimmie Simpson (Indoor)",
    234: "Matty Eckler (Indoor)",
    145: "Monarch Park (Outdoor)",
    70: "Greenwood Park (Outdoor)",
    437: "Donald D. Summerville (Outdoor)",
    2012: "Pam McConnell (Indoor)"
};
const TARGET_COURSE = "Lane Swim";

const BEACH_CONFIG = {
    "cherry": {
        name: "Cherry Beach",
        ecoliUrl: "https://www.openwaterdata.com/site/data?s=5897068&m=ecoli&d=30&f=json",
        tempUrl: "https://www.openwaterdata.com/site/data?s=5897068&m=Water%20Temperature&d=30&f=json"
    },
    "woodbine": {
        name: "Woodbine Beach",
        ecoliUrl: "https://www.openwaterdata.com/site/data?s=5897050&m=ecoli&d=30&f=json",
        tempUrl: "https://www.openwaterdata.com/site/data?s=5897050&m=Water%20Temperature&d=730&f=json"
    }
};

let currentViewMode = "today";
let globalGroupedData = [];

document.addEventListener("DOMContentLoaded", () => {
    initDashboard();

    // Wire up toggle buttons
    const btnToday = document.getElementById('btn-today');
    const btnWeek = document.getElementById('btn-week');

    if (btnToday && btnWeek) {
        btnToday.addEventListener('click', () => {
            currentViewMode = "today";
            btnToday.classList.add('active');
            btnWeek.classList.remove('active');
            renderPoolCards(globalGroupedData);
        });

        btnWeek.addEventListener('click', () => {
            currentViewMode = "week";
            btnWeek.classList.add('active');
            btnToday.classList.remove('active');
            renderPoolCards(globalGroupedData);
        });
    }
});

async function initDashboard() {
    try {
        // Fetch both datasets concurrently. 
        // Using individual .catch() statements allows one to fail without breaking the whole dashboard.
        const [poolsData, beachData] = await Promise.all([
            fetchSwimData().catch(err => {
                console.error("Pools API failed, degrading gracefully:", err);
                return []; // Return empty array to trigger empty-state UI
            }),
            fetchBeachData().catch(err => {
                console.error("Beach API failed, degrading gracefully:", err);
                return []; // Return empty array to trigger empty-state UI
            })
        ]);

    // Instead of throwing a critical error that crashes the UI, we just log a warning.
    // This allows the renderDashboard function to show the empty states gracefully.
    if (poolsData.length === 0 && beachData.length === 0) {
        console.warn("Both datasets returned empty. Rendering UI empty states.");
    }

        const consolidatedData = {
            pools: poolsData,
            beaches: beachData
        };
        
        globalGroupedData = poolsData;

        // Log consolidated data to console for testing
        console.log("=== Consolidated Swim Data ===");
        console.dir(consolidatedData);

        // Render to UI
        renderDashboard(consolidatedData);

    } catch (error) {
        console.error("Critical Failure initializing dashboard:", error);
        renderErrorState(error);
    }
}

/**
 * City of Toronto Pools Data Fetch via Datastore API
 */
async function fetchSwimData() {
    console.log("Step 1: Constructing filter query for Datastore API...");
    const resourceId = "c99ec04f-4540-482c-9ee4-efb38774eab4";
    const filters = { "Location ID": TARGET_LOCATION_IDS };
    
    const targetDatastoreUrl = `https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search?id=${resourceId}&limit=2000&filters=${encodeURIComponent(JSON.stringify(filters))}`;
    const datastoreUrl = `https://corsproxy.io/?${encodeURIComponent(targetDatastoreUrl)}`;
    
    console.log("Step 2: Fetching data from City of Toronto API...");
    const response = await fetch(datastoreUrl);
    if (!response.ok) {
        throw new Error(`Datastore fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const records = data.result.records || [];
    
    console.log(`Step 3: Fetched ${records.length} records matching target locations.`);
    return groupPoolData(records);
}

/**
 * Groups individual pool records by location ID and formats session times
 */
function groupPoolData(records) {
    const grouped = {};
    const validDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        validDates.push(`${yyyy}-${mm}-${dd}`);
    }
    // The first index validDates[0] represents our precise local todayTargetString
    const todayTargetString = validDates[0];

    // Pre-populate target pools to guarantee they render even with 0 sessions
    TARGET_LOCATION_IDS.forEach(id => {
        grouped[id] = {
            id: id, // Retained for stable layout sorting
            name: locationLookup[id] || 'Unknown Pool Location',
            todaySessions: [],
            weeklySessions: {
                "Monday": [], "Tuesday": [], "Wednesday": [], "Thursday": [], "Friday": [], "Saturday": [], "Sunday": []
            }
        };
    });

    records.forEach(record => {
        const locId = Number(record['Location ID'] || record.Location_ID || record.location_id);
        
        // Only process records for our target locations
        if (!grouped[locId]) {
            return;
        }
        
        const courseTitle = String(record["Course Title"] || "").toLowerCase().trim();
        if (courseTitle !== "lane swim") return;
        
        const recordDate = (record["First Date"] || record.First_Date || "").toString().trim();
        if (!validDates.includes(recordDate)) return;
        
        const startHr = String(record["Start Hour"] !== undefined && record["Start Hour"] !== null ? record["Start Hour"] : "00").padStart(2, '0');
        const startMin = String(record["Start Minute"] !== undefined && record["Start Minute"] !== null ? record["Start Minute"] : "00").padStart(2, '0');
        const endHr = String(record["End Hour"] !== undefined && record["End Hour"] !== null ? record["End Hour"] : "00").padStart(2, '0');
        const endMin = String(record["End Min"] !== undefined && record["End Min"] !== null ? record["End Min"] : "00").padStart(2, '0');

        const startTime = `${startHr}:${startMin} - ${endHr}:${endMin}`;
        
        const session = {
            day: record["DayOftheWeek"] || "Unknown Day",
            time: startTime,
            rawStartHour: parseInt(startHr, 10),
            rawStartMinute: parseInt(startMin, 10),
            sessionDayClean: recordDate
        };
        
        // Allocate to today's sessions (if applicable) and de-duplicate
        if (recordDate === todayTargetString) {
            const isDuplicate = grouped[locId].todaySessions.some(s => s.time === startTime);
            if (!isDuplicate) {
                grouped[locId].todaySessions.push(session);
            }
        }
        
        // Allocate to the weekly layout mapping
        const daysOfWeekMap = {
            "monday": "Monday", "tuesday": "Tuesday", "wednesday": "Wednesday",
            "thursday": "Thursday", "friday": "Friday", "saturday": "Saturday", "sunday": "Sunday"
        };
        const recordDayName = (record["DayOftheWeek"] || record["Day of the Week"] || record.DayOfTheWeek || record.DayOfWeek || record.Day || record.day || "").toString().trim().toLowerCase();
        const cleanDayName = daysOfWeekMap[recordDayName];
        
        if (cleanDayName) {
            const isWeeklyDuplicate = grouped[locId].weeklySessions[cleanDayName].some(s => s.time === startTime);
            if (!isWeeklyDuplicate) {
                grouped[locId].weeklySessions[cleanDayName].push(session);
            }
        }
    });
    
    // Sort sessions chronologically and convert to array
    const poolsArray = Object.values(grouped);
    
    poolsArray.forEach(pool => {
        pool.todaySessions.sort((a, b) => {
            if (a.rawStartHour !== b.rawStartHour) return a.rawStartHour - b.rawStartHour;
            return a.rawStartMinute - b.rawStartMinute;
        });
        
        for (const day in pool.weeklySessions) {
            pool.weeklySessions[day].sort((a, b) => {
                if (a.rawStartHour !== b.rawStartHour) return a.rawStartHour - b.rawStartHour;
                return a.rawStartMinute - b.rawStartMinute;
            });
        }
    });
    
    return poolsArray;
}

/**
 * Beach Data Fetch from openwaterdata.com
 */
async function fetchBeachData() {
    try {
        const proxyUrl = "https://corsproxy.io/?";
        
        const fetchPromises = Object.values(BEACH_CONFIG).map(async (beach) => {
            try {
                const [ecoliRes, tempRes] = await Promise.all([
                    fetch(proxyUrl + encodeURIComponent(beach.ecoliUrl)),
                    fetch(proxyUrl + encodeURIComponent(beach.tempUrl))
                ]);

                const ecoliData = ecoliRes.ok ? await ecoliRes.json() : {};
                const tempData = tempRes.ok ? await tempRes.json() : {};

                const ecoliRecords = ecoliData.contents || [];
                const tempRecords = tempData.contents || [];

                const latestEcoliRow = ecoliRecords.length > 0 ? ecoliRecords[0] : null;
                const latestTempRow = tempRecords.length > 0 ? tempRecords[0] : null;

                const ecoliValue = latestEcoliRow ? parseFloat(latestEcoliRow.Result) : null;
                const isSafe = ecoliValue !== null && ecoliValue > 100 ? false : true;

                let ecoliDisplayStr = ecoliValue !== null ? ecoliValue : "N/A";
                if (ecoliValue !== null && latestEcoliRow && latestEcoliRow.CollectionTime) {
                    const ecoliDate = latestEcoliRow.CollectionTime.substring(0, 10);
                    ecoliDisplayStr = `${ecoliValue} <span class="stale-date">(As of ${ecoliDate})</span>`;
                }

                const todayObj = new Date();
                const yyyy = todayObj.getFullYear();
                const mm = String(todayObj.getMonth() + 1).padStart(2, '0');
                const dd = String(todayObj.getDate()).padStart(2, '0');
                const todayDateString = `${yyyy}-${mm}-${dd}`; // e.g., "2026-06-14"

                let tempDisplayStr = "Offline";
                let upwellingAlert = false;

                if (latestTempRow) {
                    const tempValue = parseFloat(latestTempRow.Result);
                    const collectionDate = latestTempRow.CollectionTime ? latestTempRow.CollectionTime.substring(0, 10) : "";

                    if (collectionDate !== "") {
                        tempDisplayStr = `${tempValue.toFixed(1)}°C <span class="stale-date">(As of ${collectionDate})</span>`;
                        if (collectionDate === todayDateString && tempValue < 13) upwellingAlert = true;
                    } else {
                        tempDisplayStr = `${tempValue.toFixed(1)}°C`;
                    }
                }

                return {
                    location: beach.name,
                    ecoliValue: ecoliValue,
                    ecoliDisplayStr: ecoliDisplayStr,
                    isSafe: isSafe,
                    tempValue: tempDisplayStr,
                    upwellingAlert: upwellingAlert
                };
            } catch (err) {
                console.error(`Error fetching data for ${beach.name}:`, err);
                return null;
            }
        });

        const fetchedData = await Promise.all(fetchPromises);
        return fetchedData.filter(data => data !== null);
        
    } catch (error) {
        console.error("Error fetching Beach Data:", error);
        throw error;
    }
}

/**
 * Graceful UI Degradation for Errors
 */
function renderErrorState(error) {
    const appContainer = document.getElementById("app-container");
    if (appContainer) {
        appContainer.innerHTML = `
            <div class="error-boundary" style="padding: 1rem; border: 1px solid #ff4444; color: #ff4444; background: #ffebeb; border-radius: 8px;">
                <h3>⚠️ System Error</h3>
                <p>Unable to load swim data. Please try again later.</p>
                <small style="font-family: monospace;">${error.message}</small>
            </div>
        `;
    }
}

/**
 * Core UI Renderer
 */
function renderDashboard(data) {
    const appContainer = document.getElementById("app-container");
    if (!appContainer) {
        console.warn("UI Warning: #app-container not found in DOM. Skipping render. Create <div id='app-container'></div> in your HTML.");
        return;
    }
    
    renderBeachCards(data.beaches || []);
    renderPoolCards(data.pools || []);
}

/**
 * Injects beach condition cards into the DOM
 */
function renderBeachCards(beaches) {
    const container = document.getElementById("beach-container");
    if (!container) return;

    if (beaches.length === 0) {
        container.innerHTML = `<p class="empty-state">No open-water data available at this time.</p>`;
        return;
    }

    container.innerHTML = beaches.map(beach => {
        const qualityHeader = beach.isSafe 
            ? `<p style="color: var(--status-safe); font-weight: bold; margin-bottom: 0.5rem;">🟢 Quality: Safe to Swim</p>`
            : `<p style="color: var(--status-danger); font-weight: bold; margin-bottom: 0.5rem;">🔴 Quality: Advisory / Do Not Swim</p>`;
        
        let warningClasses = [];
        let warningBanners = [];

        if (beach.upwellingAlert) {
            warningClasses.push("warning-cold");
            warningBanners.push(`<div class="warning-banner cold-warning alert-banner">⚠️ Upwelling Hazard: Cold Water Shock Risk</div>`);
        }
        if (!beach.isSafe) {
            warningClasses.push("warning-unsafe");
        }

        return `
            <div class="swim-card beach-card ${warningClasses.join(' ')}">
                <div class="card-header">
                    <h3 class="location-name">${beach.location}</h3>
                </div>
                <div class="card-body">
                    ${qualityHeader}
                    <p><strong>E. coli Count:</strong> ${beach.ecoliDisplayStr}</p>
                    <p><strong>Water Temp:</strong> ${beach.tempValue}</p>
                </div>
                ${warningBanners.join('')}
            </div>
        `;
    }).join('');
}

/**
 * Injects city pool schedule cards into the DOM
 */
function renderPoolCards(poolsArray) {
    const container = document.getElementById("pool-cards-container");
    if (!container) return;

    if (!Array.isArray(poolsArray)) {
        poolsArray = Object.values(poolsArray);
    }

    if (poolsArray.length === 0) {
        container.innerHTML = `<p class="empty-state">No target lane swims scheduled for today.</p>`;
        return;
    }

    // Dynamic or static sorting based on active layout
    let sortedPools = [...poolsArray];
    if (currentViewMode === "today") {
        sortedPools.sort((a, b) => {
            const aHasToday = a.todaySessions.length > 0;
            const bHasToday = b.todaySessions.length > 0;
            if (aHasToday && !bHasToday) return -1;
            if (!aHasToday && bHasToday) return 1;
            return 0; // maintain default order if both same
        });
    } else {
        // Lock items alphabetically or via fixed ID structure to prevent layout jumps
        sortedPools.sort((a, b) => TARGET_LOCATION_IDS.indexOf(a.id) - TARGET_LOCATION_IDS.indexOf(b.id));
    }

    container.innerHTML = sortedPools.map(pool => {
        let bodyContent = '';
        
        if (currentViewMode === "today") {
            if (pool.todaySessions && pool.todaySessions.length > 0) {
                const sessionsHtml = pool.todaySessions.map(session => 
                    `<li style="margin-bottom: 0.25rem;"><strong>${session.day}:</strong> ${session.time}</li>`
                ).join('');
                
                bodyContent = `
                    <p style="margin-bottom: 0.5rem; font-weight: 600;">Lanes Open Today:</p>
                    <ul style="list-style-type: none; padding: 0; margin: 0;">
                        ${sessionsHtml}
                    </ul>
                `;
            } else {
                let fallbackHtml = '';
                const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                const todayIdx = (new Date().getDay() + 6) % 7; 
                const searchOrder = [...daysOrder.slice(todayIdx + 1), ...daysOrder.slice(0, todayIdx + 1)];
                
                let nextSessionDay = null;
                let nextSession = null;
                for (let day of searchOrder) {
                    if (pool.weeklySessions[day].length > 0) {
                       nextSessionDay = day;
                       nextSession = pool.weeklySessions[day][0];
                       break;
                    }
                }
                
                if (nextSession) {
                    fallbackHtml = `<p style="margin-top: 0.5rem; font-size: 0.9rem; color: var(--text-primary);">Next available: ${nextSessionDay} @ ${nextSession.time}</p>`;
                }
                bodyContent = `
                    <p style="color: var(--text-secondary); font-style: italic;">No lane swims scheduled for today.</p>
                    ${fallbackHtml}
                `;
            }
        } else {
            const daysOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
            let weekHtml = '';
            
            // Build dynamic date labels for the next 7 days
            const dayLabelMap = {};
            for (let i = 0; i < 7; i++) {
                const d = new Date();
                d.setDate(d.getDate() + i);
                const monthName = d.toLocaleDateString('en-US', { month: 'short' });
                const dayNum = d.getDate();
                const weekdayName = d.toLocaleDateString('en-US', { weekday: 'long' });
                dayLabelMap[weekdayName] = `${weekdayName} ${monthName} ${dayNum}`;
            }

            daysOrder.forEach(day => {
                const daySessions = pool.weeklySessions[day];
                if (daySessions && daySessions.length > 0) {
                    const timesHtml = daySessions.map(s => s.time).join(', ');
                    const displayLabel = dayLabelMap[day] || day;
                    weekHtml += `<li style="margin-bottom: 0.25rem;"><strong>${displayLabel}:</strong> ${timesHtml}</li>`;
                }
            });

            if (weekHtml) {
                bodyContent = `
                    <p style="margin-bottom: 0.5rem; font-weight: 600;">Weekly Schedule:</p>
                    <ul style="list-style-type: none; padding: 0; margin: 0;">
                        ${weekHtml}
                    </ul>
                `;
            } else {
                bodyContent = `<p style="color: var(--text-secondary); font-style: italic;">No lane swims scheduled this week.</p>`;
            }
        }
        
        return `
            <div class="swim-card pool-card">
                <div class="card-header">
                    <h3 class="location-name">${pool.name}</h3>
                </div>
                <div class="card-body">
                    ${bodyContent}
                </div>
            </div>
        `;
    }).join('');
}