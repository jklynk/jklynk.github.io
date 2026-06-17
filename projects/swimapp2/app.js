const PACKAGE_ID = "1a5be46a-4039-48cd-a2d2-8e702abf9516";
const TARGET_API_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const CORS_PROXY = "https://api.allorigins.win/raw?url="; // The middleman

const TARGET_POOLS = {
    58: "Jimmie Simpson (Indoor)",
    234: "Matty Eckler (Indoor)",
    145: "Monarch Park (Outdoor)",
    70: "Greenwood Park (Outdoor)",
    437: "Donald D. Summerville (Outdoor)",
    2012: "Pam McConnell (Indoor)"
};

let globalSwimData = []; // Cache data to easily switch views

document.addEventListener('DOMContentLoaded', () => {
    initApp();

    document.getElementById('btn-day').addEventListener('click', () => {
        setToggleActive('btn-day');
        renderByDay(globalSwimData);
    });

    document.getElementById('btn-pool').addEventListener('click', () => {
        setToggleActive('btn-pool');
        renderByPool(globalSwimData);
    });
});

async function initApp() {
    try {
        // 1. Get Package Metadata via Proxy
        const pkgTarget = encodeURIComponent(`${TARGET_API_URL}/package_show?id=${PACKAGE_ID}`);
        const pkgRes = await fetch(`${CORS_PROXY}${pkgTarget}`);
        const pkgData = await pkgRes.json();
        
        // 2. Find active datastore resource
        const activeResource = pkgData.result.resources.find(r => r.datastore_active);
        if (!activeResource) throw new Error("No active datastore found.");

        // 3. Fetch all records via Proxy (Limit 10000 to bypass truncation)
        const dataTarget = encodeURIComponent(`${TARGET_API_URL}/datastore_search?id=${activeResource.id}&limit=10000`);
        const dataRes = await fetch(`${CORS_PROXY}${dataTarget}`);
        const dataJson = await dataRes.json();
        
        // 4. Process and filter the raw data
        globalSwimData = processRecords(dataJson.result.records);
        
        // 5. Initial Render
        renderByDay(globalSwimData);

    } catch (error) {
        console.error("Error fetching data:", error);
        document.getElementById('app-content').innerHTML = `<p style="color:red;">Error loading schedules. Please check the console for details.</p>`;
    }
}

function processRecords(records) {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(now.getDate() + 7);

    return records
        .filter(record => {
            // Strict Location & "Lane Swim" filter
            return TARGET_POOLS[record["Location ID"]] && record["Course Title"] === "Lane Swim";
        })
        .map(record => {
            // Parse dates
            const [year, month, day] = record["First Date"].split('-');
            const startDate = new Date(year, month - 1, day, record["Start Hour"], record["Start Minute"]);
            const endDate = new Date(year, month - 1, day, record["End Hour"], record["End Min"]);
            
            return {
                id: record._id,
                poolId: record["Location ID"],
                poolName: TARGET_POOLS[record["Location ID"]],
                startDate: startDate,
                endDate: endDate,
                dayOfWeek: record["DayOftheWeek"]
            };
        })
        .filter(session => {
            // Discard past sessions and sessions beyond 7 days
            return session.endDate > now && session.startDate <= sevenDaysFromNow;
        })
        .sort((a, b) => a.startDate - b.startDate); // Sort chronologically
}

function renderByDay(data) {
    const container = document.getElementById('app-content');
    container.innerHTML = '';

    if (data.length === 0) {
        container.innerHTML = '<p>No lane swims scheduled in the next 7 days.</p>';
        return;
    }

    const todayStr = new Date().toDateString();
    
    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toDateString();

    const groups = {
        "Today": [],
        "Tomorrow": [],
        "The Week Ahead": []
    };

    data.forEach(session => {
        const sessionDateStr = session.startDate.toDateString();
        if (sessionDateStr === todayStr) {
            groups["Today"].push(session);
        } else if (sessionDateStr === tomorrowStr) {
            groups["Tomorrow"].push(session);
        } else {
            groups["The Week Ahead"].push(session);
        }
    });

    Object.keys(groups).forEach(groupName => {
        if (groups[groupName].length > 0) {
            const section = document.createElement('div');
            section.className = 'group-section';
            section.innerHTML = `<h2 class="group-header">${groupName}</h2>`;
            
            groups[groupName].forEach(session => {
                section.appendChild(createSessionCard(session, groupName));
            });
            container.appendChild(section);
        }
    });
}

function renderByPool(data) {
    const container = document.getElementById('app-content');
    container.innerHTML = '';

    const groups = {};
    data.forEach(session => {
        if (!groups[session.poolName]) groups[session.poolName] = [];
        groups[session.poolName].push(session);
    });

    Object.keys(groups).sort().forEach(poolName => {
        const section = document.createElement('div');
        section.className = 'group-section';
        section.innerHTML = `<h2 class="group-header">${poolName}</h2>`;
        
        groups[poolName].forEach(session => {
            section.appendChild(createSessionCard(session, 'poolView'));
        });
        container.appendChild(section);
    });
}

function createSessionCard(session, viewMode) {
    const card = document.createElement('div');
    card.className = 'swim-card';
    
    // Highlight today's sessions
    if (session.startDate.toDateString() === new Date().toDateString()) {
        card.classList.add('today-highlight');
    }

    const timeString = `${formatTime(session.startDate)} - ${formatTime(session.endDate)}`;
    const dateString = session.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    let titleHtml = '';
    let subtitleHtml = '';

    if (viewMode === 'Today' || viewMode === 'Tomorrow') {
        titleHtml = `<div class="pool-name">${session.poolName}</div>`;
    } else if (viewMode === 'The Week Ahead') {
        titleHtml = `<div class="pool-name">${session.poolName}</div>`;
        subtitleHtml = `<div class="date-info">${session.dayOfWeek}, ${dateString}</div>`;
    } else if (viewMode === 'poolView') {
        titleHtml = `<div class="pool-name">${session.dayOfWeek}, ${dateString}</div>`;
    }

    card.innerHTML = `
        <div>
            ${titleHtml}
            ${subtitleHtml}
        </div>
        <div class="time-slot">${timeString}</div>
    `;
    return card;
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function setToggleActive(activeId) {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
}