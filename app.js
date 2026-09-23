// 1. Core Config & Initialization
const SUPABASE_URL = "https://jzdbvjevpbvdnzoiqibl.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_L_AJuwnBborlEq2ysJkkqw_JWC5NkJq"; // Get from Project Settings -> API
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PROXY_URL = "https://damp-king-aaad.jacob-c-ross-1.workers.dev"; // Your Cloudflare Worker

let isAdmin = false;
let teams = [];
let players = [];
let matches = [];

// 2. Fetch Initial Data
async function loadData() {
    const { data: teamsData } = await supabase.from('teams').select('*');
    const { data: playersData } = await supabase.from('players').select('*');
    const { data: matchesData } = await supabase.from('matches').select('*').order('id', { ascending: false });

    teams = teamsData || [];
    players = playersData || [];
    matches = matchesData || [];

    if (teams.length === 0) {
        await saveTeam({
            id: 'ou',
            name: 'University of Oklahoma',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/8/86/Oklahoma_Sooners_logo.svg'
        });
        return;
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

// 4. Team Management
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

// Helper function to extract playlist metrics cleanly
function extractPlaylistStats(segments, playlistName) {
    const seg = segments.find(s => s.metadata && s.metadata.name === playlistName);
    if (!seg) {
        return {
            currentRank: "Unranked",
            currentMMR: 0,
            bestRank: "Unranked",
            bestMMR: 0,
            bestSeason: 0
        };
    }

    return {
        currentRank: seg.stats?.tier?.metadata?.name || "Unranked",
        currentMMR: seg.stats?.rating?.value || 0,
        bestRank: seg.stats?.peakRating?.metadata?.tierName || seg.stats?.tier?.metadata?.name || "Unranked",
        bestMMR: seg.stats?.peakRating?.value || seg.stats?.rating?.value || 0,
        bestSeason: seg.stats?.peakRating?.metadata?.season || 0
    };
}

// 5. Fetch Player Stats & Upsert to Supabase
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

        // Parse individual playlist metrics
        const duel1v1 = extractPlaylistStats(segments, 'Ranked Duel 1v1');
        const doubles2v2 = extractPlaylistStats(segments, 'Ranked Doubles 2v2');
        const standard3v3 = extractPlaylistStats(segments, 'Ranked Standard 3v3');

        // Extract overall Peak Rating summary from platform profile stats if available
        const overviewSeg = segments.find(s => s.type === 'overview');
        const peakStat = overviewSeg?.stats?.peakRating;

        const newPlayer = {
            id: `${platform}-${username}`,
            handle: data.data.platformInfo.platformUserHandle,
            platform: platform,
            team_id: teamId,
            alias: alias || username,
            notes: notes,

            peak_rating: peakStat?.value || Math.max(duel1v1.bestMMR, doubles2v2.bestMMR, standard3v3.bestMMR),
            peak_playlist: peakStat?.metadata?.playlistName || "Overall",
            peak_season: peakStat?.metadata?.season || 0,

            duel_1v1_current_rank: duel1v1.currentRank,
            duel_1v1_current_mmr: duel1v1.currentMMR,
            duel_1v1_best_rank: duel1v1.bestRank,
            duel_1v1_best_mmr: duel1v1.bestMMR,
            duel_1v1_best_season: duel1v1.bestSeason,

            doubles_2v2_current_rank: doubles2v2.currentRank,
            doubles_2v2_current_mmr: doubles2v2.currentMMR,
            doubles_2v2_best_rank: doubles2v2.bestRank,
            doubles_2v2_best_mmr: doubles2v2.bestMMR,
            doubles_2v2_best_season: doubles2v2.bestSeason,

            standard_3v3_current_rank: standard3v3.currentRank,
            standard_3v3_current_mmr: standard3v3.currentMMR,
            standard_3v3_best_rank: standard3v3.bestRank,
            standard_3v3_best_mmr: standard3v3.bestMMR,
            standard_3v3_best_season: standard3v3.bestSeason,

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

// 6. Match Logging
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

        const validMMR = teamPlayers.filter(p => p.standard_3v3_current_mmr > 0);
        const avgMMR = validMMR.length ? Math.round(validMMR.reduce((sum, p) => sum + p.standard_3v3_current_mmr, 0) / validMMR.length) : "N/A";

        const card = document.createElement("div");
        card.className = "team-card";
        
        let playersHTML = teamPlayers.map(p => `
            <div class="player-item">
                <div class="player-names">
                    <span class="alias">${p.alias}</span>
                    <span class="handle">${p.handle} (${p.platform})</span>
                </div>
                
                <div class="peak-badge">
                    🏆 <strong>Peak:</strong> ${p.peak_rating || 'N/A'} MMR ${p.peak_season ? `(S${p.peak_season})` : ''} - ${p.peak_playlist || ''}
                </div>

                <div class="playlist-grid">
                    <div class="playlist-box">
                        <div class="playlist-title">1v1 Duel</div>
                        <div><strong>Cur:</strong> ${p.duel_1v1_current_rank} (${p.duel_1v1_current_mmr})</div>
                        <div><strong>Best:</strong> ${p.duel_1v1_best_rank} (${p.duel_1v1_best_mmr}) ${p.duel_1v1_best_season ? `S${p.duel_1v1_best_season}` : ''}</div>
                    </div>
                    <div class="playlist-box">
                        <div class="playlist-title">2v2 Doubles</div>
                        <div><strong>Cur:</strong> ${p.doubles_2v2_current_rank} (${p.doubles_2v2_current_mmr})</div>
                        <div><strong>Best:</strong> ${p.doubles_2v2_best_rank} (${p.doubles_2v2_best_mmr}) ${p.doubles_2v2_best_season ? `S${p.doubles_2v2_best_season}` : ''}</div>
                    </div>
                    <div class="playlist-box">
                        <div class="playlist-title">3v3 Standard</div>
                        <div><strong>Cur:</strong> ${p.standard_3v3_current_rank} (${p.standard_3v3_current_mmr})</div>
                        <div><strong>Best:</strong> ${p.standard_3v3_best_rank} (${p.standard_3v3_best_mmr}) ${p.standard_3v3_best_season ? `S${p.standard_3v3_best_season}` : ''}</div>
                    </div>
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

document.addEventListener("DOMContentLoaded", () => {
    loadData();
});
