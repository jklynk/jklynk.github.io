const PACKAGE_ID = "1a5be46a-4039-48cd-a2d2-8e702abf9516";
const TARGET_API_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const CORS_PROXY = "https://corsproxy.io/?"; // The middleman

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
        // Fetch the securely downloaded local data
        const res = await fetch('./swim-data.json');
        
        if (!res.ok) {
            throw new Error("Could not find swim-data.json.");
        }

        const rawRecords = await res.json();
        
        // Process and filter (This uses the exact same logic as before)
        globalSwimData = processRecords(rawRecords);
        
        // Initial Render
        renderByDay(globalSwimData);

    } catch (error) {
        console.error("Error loading local data:", error);
        document.getElementById('app-content').innerHTML = `
            <div style="text-align: center; color: #d9534f; padding: 20px;">
                <h3>Data Not Found</h3>
                <p>Make sure to run <code>node update.js</code> in your VS Code terminal first to fetch the latest schedule from the city.</p>
            </div>
        `;
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