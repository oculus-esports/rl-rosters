// 1. Core Config & Initialization
const SUPABASE_URL = "https://jzdbvjevpbvdnzoiqibl.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_L_AJuwnBborlEq2ysJkkqw_JWC5NkJq"; // Get from Project Settings -> API
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PROXY_URL = "https://corsproxy.io/?";

let isAdmin = false;
let teams = [];
let players = [];
let rankHistory = [];

// Initialize & Check Active Auth Session
async function loadData() {
    // Check if user is logged in
    const { data: { session } } = await supabaseClient.auth.getSession();
    setAdminState(!!session);

    // Listen for auth changes (login/logout)
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        setAdminState(!!session);
    });

    const { data: teamsData } = await supabaseClient.from('teams').select('*');
    const { data: playersData } = await supabaseClient.from('players').select('*');
    const { data: historyData } = await supabaseClient.from('rank_history').select('*').order('id', { ascending: false });

    teams = teamsData || [];
    players = playersData || [];
    rankHistory = historyData || [];

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

function setAdminState(loggedIn) {
    isAdmin = loggedIn;
    const statusEl = document.getElementById("admin-status");
    const authBtn = document.getElementById("auth-btn");

    if (isAdmin) {
        statusEl.innerText = "Mode: Admin Authorized";
        authBtn.innerText = "Logout Admin";
        authBtn.onclick = logoutAdmin;
        document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
    } else {
        statusEl.innerText = "Mode: Public Viewer";
        authBtn.innerText = "Admin Login";
        authBtn.onclick = toggleAuthModal;
        document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
    }
    renderAll();
}

function toggleAuthModal() {
    const modal = document.getElementById("login-modal");
    modal.classList.toggle("hidden");
}

async function loginAdmin() {
    let email = document.getElementById("admin-email").value.trim();
    const password = document.getElementById("admin-password").value.trim();

    // Default username fallback to email format if user entered "ourl"
    if (email.toLowerCase() === "ourl") {
        email = "jacobross@ou.edu";
    }

    const { error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        alert("Login failed: " + error.message);
    } else {
        document.getElementById("login-modal").classList.add("hidden");
        document.getElementById("admin-email").value = "";
        document.getElementById("admin-password").value = "";
    }
}

async function logoutAdmin() {
    await supabaseClient.auth.signOut();
}

// Upload Logo File to Supabase Storage Bucket
async function uploadLogoFile(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `logos/${fileName}`;

    // Get current session for authenticated upload
    const { data: { session } } = await supabaseClient.auth.getSession();

    const { error: uploadError } = await supabaseClient.storage
        .from('team-logos')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
        });

    if (uploadError) {
        alert("Logo upload error: " + uploadError.message);
        return null;
    }

    const { data } = supabaseClient.storage
        .from('team-logos')
        .getPublicUrl(filePath);

    return data.publicUrl;
}

async function saveTeam(directData = null) {
    let newTeam;
    if (directData) {
        newTeam = directData;
    } else {
        const name = document.getElementById("team-name-input").value.trim();
        const fileInput = document.getElementById("team-logo-file");
        let logoUrl = 'https://via.placeholder.com/50?text=RL';

        if (!name) return alert("Team name required.");

        if (fileInput.files.length > 0) {
            const uploadedUrl = await uploadLogoFile(fileInput.files[0]);
            if (uploadedUrl) logoUrl = uploadedUrl;
        }

        newTeam = { id: name.toLowerCase().replace(/\s+/g, '-'), name: name, logo: logoUrl };
    }

    const { error } = await supabaseClient.from('teams').upsert(newTeam);
    if (error) return alert("Error saving team: " + error.message);

    if (!directData) {
        document.getElementById("team-name-input").value = "";
        document.getElementById("team-logo-file").value = "";
    }
    loadData();
}

function extractPlaylistStats(segments, playlistName) {
    const seg = segments.find(s => s.metadata && s.metadata.name === playlistName);
    if (!seg) return { currentRank: "Unranked", currentMMR: 0, bestRank: "Unranked", bestMMR: 0, bestSeason: 0 };
    return {
        currentRank: seg.stats?.tier?.metadata?.name || "Unranked",
        currentMMR: seg.stats?.rating?.value || 0,
        bestRank: seg.stats?.peakRating?.metadata?.tierName || seg.stats?.tier?.metadata?.name || "Unranked",
        bestMMR: seg.stats?.peakRating?.value || seg.stats?.rating?.value || 0,
        bestSeason: seg.stats?.peakRating?.metadata?.season || 0
    };
}

async function fetchAndSavePlayerStats(platform, username, teamId, alias, notes, playerIdOverride = null) {
    try {
        // Direct target URL on Tracker Network's public web route
        const targetUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(username)}`;
        
        const res = await fetch(targetUrl, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            throw new Error(`Tracker Network returned status ${res.status}`);
        }

        const data = await res.json();
        if (data.errors) throw new Error(data.errors[0].message);

        const segments = data.data.segments;
        const duel1v1 = extractPlaylistStats(segments, 'Ranked Duel 1v1');
        const doubles2v2 = extractPlaylistStats(segments, 'Ranked Doubles 2v2');
        const standard3v3 = extractPlaylistStats(segments, 'Ranked Standard 3v3');
        const overviewSeg = segments.find(s => s.type === 'overview');
        const peakStat = overviewSeg?.stats?.peakRating;

        const playerId = playerIdOverride || `${platform}-${username}`;
        const currentDate = new Date().toLocaleDateString();

        const playerData = {
            id: playerId,
            handle: data.data.platformInfo.platformUserHandle,
            platform: platform,
            team_id: teamId,
            alias: alias,
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
            last_updated: currentDate
        };

        const { error: pError } = await supabaseClient.from('players').upsert(playerData);
        if (pError) throw pError;

        const historyData = {
            player_id: playerId,
            recorded_date: currentDate,
            duel_1v1_mmr: duel1v1.currentMMR,
            doubles_2v2_mmr: doubles2v2.currentMMR,
            standard_3v3_mmr: standard3v3.currentMMR
        };
        await supabaseClient.from('rank_history').insert(historyData);

        return true;
    } catch (e) {
        console.error("Player Fetch Error:", e);
        alert(`Failed to fetch stats for ${username}: ${e.message}`);
        return false;
    }
}

async function addPlayerFormSubmit() {
    const url = document.getElementById("player-url-input").value.trim();
    const teamId = document.getElementById("player-team-select").value;
    const alias = document.getElementById("player-alias-input").value.trim();
    const notes = document.getElementById("player-notes-input").value.trim();

    if (!url || !teamId) return alert("URL and Team Selection are required.");

    const parts = url.split('/');
    const profileIdx = parts.indexOf('profile');
    if (profileIdx === -1 || parts.length < profileIdx + 3) return alert("Invalid Tracker URL format.");

    const platform = parts[profileIdx + 1];
    const username = parts[profileIdx + 2];

    const success = await fetchAndSavePlayerStats(platform, username, teamId, alias || username, notes);
    if (success) {
        document.getElementById("player-url-input").value = "";
        document.getElementById("player-alias-input").value = "";
        document.getElementById("player-notes-input").value = "";
        loadData();
    }
}

async function refreshPlayer(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    
    const btn = document.getElementById(`refresh-btn-${playerId}`);
    if (btn) btn.innerText = "Refreshing...";

    await fetchAndSavePlayerStats(player.platform, player.handle, player.team_id, player.alias, player.notes, player.id);
    loadData();
}

async function refreshAllPlayers() {
    if (!confirm("This will fetch live stats for ALL players. Proceed?")) return;
    for (const player of players) {
        await fetchAndSavePlayerStats(player.platform, player.handle, player.team_id, player.alias, player.notes, player.id);
    }
    loadData();
}

async function removePlayer(playerId) {
    if (!confirm("Are you sure you want to remove this player?")) return;
    await supabaseClient.from('players').delete().eq('id', playerId);
    loadData();
}

function renderAll() {
    const query = document.getElementById("search-input") ? document.getElementById("search-input").value.toLowerCase() : "";
    
    const teamSelect = document.getElementById('player-team-select');
    const manualTeamSelect = document.getElementById('manualTeamSelect');
    
    const teamOptionsHTML = '<option value="">Select Team...</option>' + 
        teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    
    if (teamSelect) teamSelect.innerHTML = teamOptionsHTML;
    if (manualTeamSelect) manualTeamSelect.innerHTML = teamOptionsHTML;

    const grid = document.getElementById("teams-grid");
    if (!grid) return;
    grid.innerHTML = "";

    teams.forEach(team => {
        const teamPlayers = players.filter(p => p.team_id === team.id && 
            ((p.alias && p.alias.toLowerCase().includes(query)) || p.handle.toLowerCase().includes(query) || team.name.toLowerCase().includes(query)));
        
        if (query && teamPlayers.length === 0 && !team.name.toLowerCase().includes(query)) return;

        const validMMR = teamPlayers.filter(p => p.standard_3v3_current_mmr > 0);
        const avgMMR = validMMR.length ? Math.round(validMMR.reduce((sum, p) => sum + p.standard_3v3_current_mmr, 0) / validMMR.length) : "N/A";

        const card = document.createElement("div");
        card.className = "team-card";
        
        let playersHTML = teamPlayers.map(p => {
            const pHistory = rankHistory.filter(h => h.player_id === p.id);
            let trendHtml = "";
            if (pHistory.length > 1) {
                const diff = p.standard_3v3_current_mmr - pHistory[1].standard_3v3_mmr;
                if (diff > 0) trendHtml = `<span style="color: #4caf50; font-size:0.85em;">(&#128200; +${diff} since ${pHistory[1].recorded_date})</span>`;
                else if (diff < 0) trendHtml = `<span style="color: #f44336; font-size:0.85em;">(&#128201; ${diff} since ${pHistory[1].recorded_date})</span>`;
            }

            return `
            <div class="player-item">
                <div class="player-names">
                    <span class="alias">${p.alias}</span>
                    <span class="handle">${p.handle} (${p.platform})</span>
                </div>
                
                <div class="peak-badge">
                    &#127942; <strong>Peak:</strong> ${p.peak_rating || 'N/A'} MMR ${p.peak_season ? `(S${p.peak_season})` : ''} - ${p.peak_playlist || ''}
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
                        <div><strong>Cur:</strong> ${p.standard_3v3_current_rank} (${p.standard_3v3_current_mmr}) <br>${trendHtml}</div>
                        <div><strong>Best:</strong> ${p.standard_3v3_best_rank} (${p.standard_3v3_best_mmr}) ${p.standard_3v3_best_season ? `S${p.standard_3v3_best_season}` : ''}</div>
                    </div>
                </div>

                ${p.notes ? `<div class="notes">Scouting Note: ${p.notes}</div>` : ''}
                
                <div style="margin-top: 10px; font-size: 0.8em; color: #888; display: flex; justify-content: space-between; align-items: center;">
                    <span>Last Refreshed: ${p.last_updated}</span>
                    <div class="${isAdmin ? '' : 'hidden'} admin-only">
                        <button id="refresh-btn-${p.id}" onclick="refreshPlayer('${p.id}')" style="background-color: #0078ff; padding: 4px 8px; font-size: 0.9em;">&#128257; Refresh</button>
                        <button class="remove-btn" onclick="removePlayer('${p.id}')" style="padding: 4px 8px; font-size: 0.9em;">Delete</button>
                    </div>
                </div>
            </div>`;
        }).join('');

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
}

// Tab Switching Helper
function switchPlayerTab(tab) {
    const autoForm = document.getElementById('addPlayerForm');
    const manualForm = document.getElementById('addPlayerManualForm');
    const autoBtn = document.getElementById('tabAutoBtn');
    const manualBtn = document.getElementById('tabManualBtn');

    if (tab === 'auto') {
        autoForm.style.display = 'flex';
        manualForm.style.display = 'none';
        autoBtn.classList.add('active');
        manualBtn.classList.remove('active');
    } else {
        autoForm.style.display = 'none';
        manualForm.style.display = 'flex';
        manualBtn.classList.add('active');
        autoBtn.classList.remove('active');
    }
}

// Manual Form Submit Handler
async function addPlayerManualSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('manualUsername').value.trim();
    const platform = document.getElementById('manualPlatformSelect').value;
    const teamId = document.getElementById('manualTeamSelect').value;
    const alias = document.getElementById('manualAlias').value.trim();
    const notes = document.getElementById('manualNotes').value.trim();

    const m1v1 = parseInt(document.getElementById('manual1v1MMR').value) || 0;
    const m2v2 = parseInt(document.getElementById('manual2v2MMR').value) || 0;
    const m3v3 = parseInt(document.getElementById('manual3v3MMR').value) || 0;
    const peak = parseInt(document.getElementById('manualPeakMMR').value) || Math.max(m1v1, m2v2, m3v3);

    const playerId = `${platform}-${username.toLowerCase().replace(/\s+/g, '')}`;
    const currentDate = new Date().toLocaleDateString();

    const playerData = {
        id: playerId,
        handle: username,
        platform: platform,
        team_id: teamId,
        alias: alias,
        notes: notes,
        peak_rating: peak,
        peak_playlist: "Overall",
        peak_season: 0,
        duel_1v1_current_mmr: m1v1,
        doubles_2v2_current_mmr: m2v2,
        standard_3v3_current_mmr: m3v3,
        last_updated: currentDate
    };

    const { error } = await supabaseClient.from('players').upsert(playerData);
    if (error) {
        alert("Error saving player: " + error.message);
    } else {
        alert(`Player ${username} added successfully!`);
        document.getElementById('addPlayerManualForm').reset();
        if (typeof loadAllData === 'function') {
            loadAllData();
        } else {
            location.reload();
        }
    }
}

// Expose functions globally to HTML onclick handlers
window.toggleAuthModal = toggleAuthModal;
window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.saveTeam = saveTeam;
window.addPlayerFormSubmit = addPlayerFormSubmit;
window.addPlayerManualSubmit = addPlayerManualSubmit;
window.switchPlayerTab = switchPlayerTab;
window.refreshPlayer = refreshPlayer;
window.refreshAllPlayers = refreshAllPlayers;
window.removePlayer = removePlayer;

document.addEventListener("DOMContentLoaded", () => {
    loadData();
});
