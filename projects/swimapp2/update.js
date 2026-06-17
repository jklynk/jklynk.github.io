const fs = require('fs');

const PACKAGE_ID = "1a5be46a-4039-48cd-a2d2-8e702abf9516";
const BASE_URL = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";

async function fetchCityData() {
    console.log("🌊 Act II Logistics: Initiating secure link to City of Toronto API...");
    
    try {
        // 1. Get Metadata
        const pkgRes = await fetch(`${BASE_URL}/package_show?id=${PACKAGE_ID}`);
        const pkgData = await pkgRes.json();
        
        const activeResource = pkgData.result.resources.find(r => r.datastore_active);
        if (!activeResource) throw new Error("No active datastore found.");

        console.log("✅ Access granted. Bypassing CORS to download schedule...");
        
        // 2. Download Data (Limit 10000 to bypass truncation)
        const dataRes = await fetch(`${BASE_URL}/datastore_search?id=${activeResource.id}&limit=10000`);
        const dataJson = await dataRes.json();
        
        // 3. Save Locally
        fs.writeFileSync('swim-data.json', JSON.stringify(dataJson.result.records, null, 2));
        
        console.log("✅ Schedule securely saved to 'swim-data.json'.");
        console.log("Ready for rendering! Open your dashboard via VS Code Live Server.");

    } catch (error) {
        console.error("❌ Connection failed:", error);
    }
}

fetchCityData();