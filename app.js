// Replace this with your actual Cloudflare Worker URL
const PROXY_URL = "https://damp-king-aaad.jacob-c-ross-1.workers.dev/";

// Local state to hold our database of players
let rosterDB = [];

async function fetchPlayerData() {
    const urlInput = document.getElementById("player-url").value;
    
    // 1. Extract platform and username from the Tracker.gg URL
    // URL Format: https://rocketleague.tracker.network/rocket-league/profile/epic/USERNAME/overview
    const parts = urlInput.split('/');
    const profileIndex = parts.indexOf('profile');
    
    if (profileIndex === -1 || parts.length < profileIndex + 3) {
        alert("Invalid Tracker URL. Please paste a full profile URL.");
        return;
    }

    const platform = parts[profileIndex + 1]; // e.g., 'epic' or 'steam'
    const username = parts[profileIndex + 2]; // e.g., 'pmoney'

    try {
        // 2. Fetch data through our secure proxy
        const response = await fetch(`${PROXY_URL}?platform=${platform}&username=${username}`);
        const data = await response.json();

        if (data.errors) {
            alert("Error fetching player: " + data.errors[0].message);
            return;
        }

        // 3. Extract relevant 3v3 stats (Segment ID 13 is usually Standard 3v3)
        const segments = data.data.segments;
        const standard3v3 = segments.find(seg => seg.metadata.name === 'Ranked Standard 3v3');
        
        const playerData = {
            name: data.data.platformInfo.platformUserHandle,
            platform: platform,
            currentRank: standard3v3 ? standard3v3.stats.tier.metadata.name : "Unranked",
            mmr: standard3v3 ? standard3v3.stats.rating.value : "N/A",
            team: prompt(`What University/Team does ${username} play for?`) || "Unknown"
        };

        // 4. Save to local DB and render
        rosterDB.push(playerData);
        renderRosters();
        document.getElementById("player-url").value = ''; // clear input

    } catch (error) {
        console.error("Fetch error:", error);
        alert("Failed to pull data. Check the console.");
    }
}

function renderRosters(filteredDB = rosterDB) {
    const grid = document.getElementById("roster-grid");
    grid.innerHTML = ""; // Clear existing cards

    filteredDB.forEach(player => {
        const card = document.createElement("div");
        card.className = "player-card";
        card.innerHTML = `
            <h3>${player.name} (${player.platform})</h3>
            <p><strong>Team:</strong> ${player.team}</p>
            <p><strong>Current 3v3 Rank:</strong> <span class="rank">${player.currentRank}</span></p>
            <p><strong>3v3 MMR:</strong> ${player.mmr}</p>
        `;
        grid.appendChild(card);
    });
}

function filterRosters() {
    const query = document.getElementById("search-team").value.toLowerCase();
    const filtered = rosterDB.filter(p => p.team.toLowerCase().includes(query) || p.name.toLowerCase().includes(query));
    renderRosters(filtered);
}
