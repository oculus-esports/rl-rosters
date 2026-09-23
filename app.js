// 1. Core Config & Initialization
const SUPABASE_URL = "https://jzdbvjevpbvdnzoiqibl.supabase.co"; 
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE"; // Get from Project Settings -> API
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PROXY_URL = "https://damp-king-aaad.jacob-c-ross-1.workers.dev"; // Your Cloudflare Worker

// Default state variables
let isAdmin = false;
let teams = [];
let players = [];
let matches = [];

// 2. Fetch Initial Data from Supabase
async function loadData() {
    const { data: teamsData } = await supabase.from('teams').select('*');
    const { data: playersData } = await supabase.from('players').select('*');
    const { data: matchesData } = await supabase.from('matches').select('*').order('id', { ascending: false });

    teams = teamsData || [];
    players = playersData || [];
    matches = matchesData || [];

    // Ensure the default OU team exists on first load
    if (teams.length === 0) {
        await saveTeam({
            id: 'ou',
            name: 'University of Oklahoma',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/8/86/Oklahoma_Sooners_logo.svg'
        });
        return; // saveTeam will automatically trigger loadData and renderAll again
    }

    renderAll();
}

// 3. Admin Authentication Toggle
function toggleAdminLogin() {
    if (!isAdmin) {
        const password = prompt("Enter Admin Password:");
        if (password === "sooners") {
            isAdmin = true;
            document.getElementById("admin-status").innerText = "Mode: Admin Authorized";
            document.getElementById("auth-btn").innerText = "Logout Admin";
            document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
        } else {
            alert("Incorrect password.");
        }
    } else {
        isAdmin = false;
        document.getElementById("admin-status").innerText = "Mode: Public Viewer";
        document.getElementById("auth-btn").innerText = "Admin Login";
        document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
    }
}

// 4. Team Management (Supabase)
async function saveTeam(directData = null) {
    let newTeam;
    
    if (directData) {
        newTeam = directData;
    } else {
        const name = document.getElementById("team-name-input").value.trim();
        const logo = document.getElementById("team-logo-input").value.trim() || 'https://via.placeholder.com/50?text=RL';
        if (!name) return alert("Team name required.");
        
        newTeam = {
            id: name.toLowerCase().replace(/\s+/g, '-'),
            name: name,
            logo: logo
        };
    }

    const { error } = await supabase.from('teams').upsert(newTeam);
    if (error) return alert("Error saving team: " + error.message);

    if (!directData) {
        document.getElementById("team-name-input").value = "";
        document.getElementById("team-logo-input").value = "";
    }
    
    loadData();
}

// 5. Player Fetching & Insertion (Supabase)
async function addPlayer() {
    const url = document.getElementById("player-url-input").value.trim();
    const teamId = document.getElementById("player-team-select").value;
    const alias = document.getElementById("player-alias-input").value.trim();
    const notes = document.getElementById("player-notes-input").value.trim();

    if (!url || !teamId) return alert("URL and Team Selection are required.");

    const parts = url.split('/');
    const profileIdx = parts.indexOf('profile');
    
    if (profileIdx === -1 || parts.length < profileIdx + 3) {
        return alert("Invalid Rocket League Tracker URL format.");
    }

    const platform = parts[profileIdx + 1];
    const username = parts[profileIdx + 2];

    try {
        const res = await fetch(`${PROXY_URL}?platform=${platform}&username=${username}`);
        const data = await res.json();

        if (data.errors) return alert("API Error: " + data.errors[0].message);

        const segments = data.data.segments;
        const std3v3 = segments.find(s => s.metadata.name === 'Ranked Standard 3v3');

        const newPlayer = {
            id: `${platform}-${username}`,
            handle: data.data.platformInfo.platformUserHandle,
            platform: platform,
            team_id: teamId,
            alias: alias || username,
            notes: notes,
            rank_3v3: std3v3 ? std3v3.stats.tier.metadata.name : "Unranked",
            mmr_3v3: std3v3 ? std3v3.stats.rating.value : 0,
            last_updated: new Date().toLocaleDateString()
        };

        const { error } = await supabase.from('players').upsert(newPlayer);
        if (error) throw error;

        document.getElementById("player-url-input").value = "";
        document.getElementById("player-alias-input").value = "";
        document.getElementById("player-notes-input").value = "";
        loadData();

    } catch (e) {
        console.error(e);
        alert("Failed to save player stats. Check console.");
    }
}

async function removePlayer(playerId) {
    if (!confirm("Are you sure you want to remove this player?")) return;
    await supabase.from('players').delete().eq('id', playerId);
    loadData();
}

// 6. Match & Scrim Logging (Supabase)
async function logMatch() {
    const opponentId = document.getElementById("match-opponent-select").value;
    const type = document.getElementById("match-type").value;
    const result = document.getElementById("match-result").value;
    const score = document.getElementById("match-score").value.trim();
    const notes = document.getElementById("match-notes").value.trim();

    if (!opponentId) return alert("Select an opponent team.");
    const opponentTeam = teams.find(t => t.id === opponentId);

    const match = {
        date: new Date().toLocaleDateString(),
        opponent_id: opponentId,
        opponent_name: opponentTeam.name,
        type: type,
        result: result,
        score: score || 'N/A',
        notes: notes
    };

    const { error } = await supabase.from('matches').insert(match);
    if (error) return alert("Error saving match: " + error.message);

    document.getElementById("match-score").value = "";
    document.getElementById("match-notes").value = "";
    loadData();
}

async function removeMatch(matchId) {
    if (!confirm("Delete this match log entry?")) return;
    await supabase.from('matches').delete().eq('id', matchId);
    loadData();
}

// 7. Render Core UI
function renderAll() {
    const query = document.getElementById("search-input").value.toLowerCase();
    
    const teamSelects = ['player-team-select', 'match-opponent-select'];
    teamSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        select.innerHTML = "";
        teams.forEach(t => {
            if (selectId === 'match-opponent-select' && t.id === 'ou') return;
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.innerText = t.name;
            select.appendChild(opt);
        });
    });

    const grid = document.getElementById("teams-grid");
    grid.innerHTML = "";

    teams.forEach(team => {
        const teamPlayers = players.filter(p => p.team_id === team.id && 
            ((p.alias && p.alias.toLowerCase().includes(query)) || p.handle.toLowerCase().includes(query) || team.name.toLowerCase().includes(query)));
        
        if (query && teamPlayers.length === 0 && !team.name.toLowerCase().includes(query)) return;

        const validMMR = teamPlayers.filter(p => p.mmr_3v3 > 0);
        const avgMMR = validMMR.length ? Math.round(validMMR.reduce((sum, p) => sum + p.mmr_3v3, 0) / validMMR.length) : "N/A";

        const card = document.createElement("div");
        card.className = "team-card";
        
        let playersHTML = teamPlayers.map(p => `
            <div class="player-item">
                <div class="player-names">
                    <span class="alias">${p.alias}</span>
                    <span class="handle">${p.handle} (${p.platform})</span>
                </div>
                <div class="player-stats">
                    <strong>3v3:</strong> ${p.rank_3v3} (${p.mmr_3v3} MMR)
                </div>
                ${p.notes ? `<div class="notes">Scouting Note: ${p.notes}</div>` : ''}
                ${isAdmin ? `<button class="remove-btn admin-only" onclick="removePlayer('${p.id}')">Delete</button>` : ''}
            </div>
        `).join('');

        card.innerHTML = `
            <div class="team-header">
                <img src="${team.logo}" class="team-logo" alt="${team.name}">
                <div class="team-info">
                    <h3>${team.name}</h3>
                    <div class="avg-mmr">Avg 3v3 MMR: ${avgMMR}</div>
                </div>
            </div>
            <div class="player-list">
                ${playersHTML || '<div class="notes">No players listed.</div>'}
            </div>
        `;
        grid.appendChild(card);
    });

    const tbody = document.getElementById("matches-tbody");
    tbody.innerHTML = "";

    matches.forEach(m => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${m.date}</td>
            <td>${m.opponent_name}</td>
            <td>${m.type}</td>
            <td class="${m.result === 'Win' ? 'result-win' : 'result-loss'}">${m.result}</td>
            <td>${m.score}</td>
            <td>${m.notes || '-'}</td>
            ${isAdmin ? `<td class="admin-only"><button class="remove-btn" onclick="removeMatch(${m.id})">X</button></td>` : '<td></td>'}
        `;
        tbody.appendChild(tr);
    });
}

// Initial Data Pull on page load
document.addEventListener("DOMContentLoaded", () => {
    loadData();
});
