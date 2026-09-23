// 1. Core Config & Initialization
const SUPABASE_URL = "https://jzdbvjevpbvdnzoiqibl.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_L_AJuwnBborlEq2ysJkkqw_JWC5NkJq"; // Get from Project Settings -> API
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isAdmin = false;
let teams = [];
let players = [];
let rankHistory = [];

// Initialize & Check Active Auth Session
async function loadData() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    setAdminState(!!session);

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
    document.getElementById("login-modal").classList.toggle("hidden");
}

async function loginAdmin() {
    let email = document.getElementById("admin-email").value.trim();
    const password = document.getElementById("admin-password").value.trim();

    if (email.toLowerCase() === "ourl") email = "jacobross@ou.edu";

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

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
    const { data: { session } } = await supabaseClient.auth.getSession();

    const { error: uploadError } = await supabaseClient.storage
        .from('team-logos')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) return null;

    const { data } = supabaseClient.storage.from('team-logos').getPublicUrl(filePath);
    return data.publicUrl;
}

let editingTeamId = null;

async function saveTeam(directData = null) {
    let newTeam;
    if (directData) {
        newTeam = directData;
    } else {
        const name = document.getElementById("team-name-input").value.trim();
        const fileInput = document.getElementById("team-logo-file");
        let logoUrl = null;

        if (!name) return alert("Team name required.");

        if (fileInput.files.length > 0) {
            const uploadedUrl = await uploadLogoFile(fileInput.files[0]);
            if (uploadedUrl) logoUrl = uploadedUrl;
        }

        const teamId = editingTeamId || name.toLowerCase().replace(/\s+/g, '-');

        if (!logoUrl && editingTeamId) {
            const currentTeam = teams.find(t => t.id === editingTeamId);
            logoUrl = currentTeam?.logo || 'https://via.placeholder.com/50?text=RL';
        } else if (!logoUrl) {
            logoUrl = 'https://via.placeholder.com/50?text=RL';
        }

        newTeam = { id: teamId, name: name, logo: logoUrl };
    }

    const { error } = await supabaseClient.from('teams').upsert(newTeam);
    if (error) return alert("Error saving team: " + error.message);

    editingTeamId = null;
    document.getElementById("addTeamForm").reset();
    const submitBtn = document.querySelector("#addTeamForm button[type='submit']");
    if (submitBtn) submitBtn.innerText = "Save Team";

    loadData();
}

function editTeam(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    editingTeamId = team.id;
    document.getElementById("team-name-input").value = team.name;
    document.querySelector(".card").scrollIntoView({ behavior: 'smooth' });
    alert(`Editing "${team.name}". Choose a new logo file to replace the logo, then click Save.`);
}

async function deleteTeam(teamId) {
    if (!confirm("Are you sure you want to delete this team?")) return;
    const { error } = await supabaseClient.from('teams').delete().eq('id', teamId);
    if (error) alert("Error deleting team: " + error.message);
    else loadData();
}

// Team Datalist Helpers
function populateTeamDropdowns() {
    const datalist = document.getElementById("teams-list");
    if (!datalist) return;

    datalist.innerHTML = ""; 
    teams.forEach(team => {
        const option = document.createElement("option");
        option.value = team.name; 
        option.dataset.id = team.id; 
        datalist.appendChild(option);
    });
}

function getSelectedTeamId(inputElementId) {
    const inputValue = document.getElementById(inputElementId).value.trim();
    const matchedTeam = teams.find(t => t.name.toLowerCase() === inputValue.toLowerCase());
    return matchedTeam ? matchedTeam.id : inputValue.toLowerCase().replace(/\s+/g, '-');
}

// Manual Form Submit Handler
async function addPlayerManualSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('manualUsername').value.trim();
    const teamId = getSelectedTeamId('manualTeamInput');
    
    const trackerUrlInput = document.getElementById('manualTrackerUrl');
    const trackerUrl = trackerUrlInput ? trackerUrlInput.value.trim() : null;
    
    const alias = document.getElementById('manualAlias').value.trim();
    const notes = document.getElementById('manualNotes').value.trim();

    // 1v1
    const c1 = parseInt(document.getElementById('m1v1_cur').value) || 0;
    const b1 = parseInt(document.getElementById('m1v1_best').value) || 0;
    const s1 = parseInt(document.getElementById('m1v1_season').value) || 0;
    
    // 2v2
    const c2 = parseInt(document.getElementById('m2v2_cur').value) || 0;
    const b2 = parseInt(document.getElementById('m2v2_best').value) || 0;
    const s2 = parseInt(document.getElementById('m2v2_season').value) || 0;
    
    // 3v3
    const c3 = parseInt(document.getElementById('m3v3_cur').value) || 0;
    const b3 = parseInt(document.getElementById('m3v3_best').value) || 0;
    const s3 = parseInt(document.getElementById('m3v3_season').value) || 0;

    if (!teamId) return alert("Please select or type a valid team.");

    // Calculate Peak MMR & Season based on highest value inputted
    const peak = Math.max(c1, b1, c2, b2, c3, b3);
    let peakSeason = 0;
    if (peak === b1) peakSeason = s1;
    if (peak === b2) peakSeason = s2;
    if (peak === b3) peakSeason = s3;

    // Generate unique ID without platform
    const playerId = `player-${username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}`;
    const currentDate = new Date().toLocaleDateString();

    const playerData = {
        id: playerId,
        handle: username,
        team_id: teamId,
        alias: alias,
        notes: notes,
        peak_rating: peak,
        peak_playlist: "Overall",
        peak_season: peakSeason,
        duel_1v1_current_mmr: c1,
        duel_1v1_best_mmr: b1,
        duel_1v1_best_season: s1,
        doubles_2v2_current_mmr: c2,
        doubles_2v2_best_mmr: b2,
        doubles_2v2_best_season: s2,
        standard_3v3_current_mmr: c3,
        standard_3v3_best_mmr: b3,
        standard_3v3_best_season: s3,
        tracker_url: trackerUrl,
        last_updated: currentDate
    };

    const { error } = await supabaseClient.from('players').upsert(playerData);
    if (error) {
        alert("Error saving player: " + error.message);
        return;
    }

    const historyData = {
        player_id: playerId,
        recorded_date: currentDate,
        duel_1v1_mmr: c1,
        doubles_2v2_mmr: c2,
        standard_3v3_mmr: c3
    };
    await supabaseClient.from('rank_history').insert(historyData);

    alert(`Player ${username} saved successfully!`);
    document.getElementById('addPlayerManualForm').reset();
    loadData();
}

async function removePlayer(playerId) {
    if (!confirm("Are you sure you want to remove this player?")) return;
    await supabaseClient.from('players').delete().eq('id', playerId);
    loadData();
}

function renderAll() {
    const query = document.getElementById("search-input") ? document.getElementById("search-input").value.toLowerCase() : "";
    
    populateTeamDropdowns();

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

            const trackerLinkHTML = p.tracker_url 
                ? `<a href="${p.tracker_url}" target="_blank" style="color: #4CAF50; text-decoration: none; font-size: 0.9em; background: #2a2a2a; padding: 4px 8px; border-radius: 4px; margin-right: 10px;">🔗 Tracker</a>` 
                : '';

            return `
            <div class="player-item">
                <div class="player-names">
                    <span class="alias">${p.alias || ''}</span>
                    <span class="handle">${p.handle}</span>
                </div>
                
                <div class="peak-badge">
                    &#127942; <strong>Peak:</strong> ${p.peak_rating || 'N/A'} MMR ${p.peak_season ? `(S${p.peak_season})` : ''}
                </div>

                <div class="playlist-grid">
                    <div class="playlist-box">
                        <div class="playlist-title">1v1 Duel</div>
                        <div><strong>Cur MMR:</strong> ${p.duel_1v1_current_mmr || 0}</div>
                        <div><strong>Best MMR:</strong> ${p.duel_1v1_best_mmr || 0} ${p.duel_1v1_best_season ? `<span style="color:#aaa;">(S${p.duel_1v1_best_season})</span>` : ''}</div>
                    </div>
                    <div class="playlist-box">
                        <div class="playlist-title">2v2 Doubles</div>
                        <div><strong>Cur MMR:</strong> ${p.doubles_2v2_current_mmr || 0}</div>
                        <div><strong>Best MMR:</strong> ${p.doubles_2v2_best_mmr || 0} ${p.doubles_2v2_best_season ? `<span style="color:#aaa;">(S${p.doubles_2v2_best_season})</span>` : ''}</div>
                    </div>
                    <div class="playlist-box">
                        <div class="playlist-title">3v3 Standard</div>
                        <div><strong>Cur MMR:</strong> ${p.standard_3v3_current_mmr || 0} <br>${trendHtml}</div>
                        <div><strong>Best MMR:</strong> ${p.standard_3v3_best_mmr || 0} ${p.standard_3v3_best_season ? `<span style="color:#aaa;">(S${p.standard_3v3_best_season})</span>` : ''}</div>
                    </div>
                </div>

                ${p.notes ? `<div class="notes">Scouting Note: ${p.notes}</div>` : ''}
                
                <div style="margin-top: 10px; font-size: 0.8em; color: #888; display: flex; justify-content: space-between; align-items: center;">
                    <span>Last Updated: ${p.last_updated}</span>
                    <div class="${isAdmin ? '' : 'hidden'} admin-only" style="display: flex; align-items: center;">
                        ${trackerLinkHTML}
                        <button class="remove-btn" onclick="removePlayer('${p.id}')" style="padding: 4px 8px; font-size: 0.9em; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        card.innerHTML = `
            <div class="team-header" style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${team.logo}" class="team-logo" alt="${team.name}" style="width: 48px; height: 48px; object-fit: contain; border-radius: 6px;">
                    <div class="team-info">
                        <h3 style="margin: 0;">${team.name}</h3>
                        <div class="avg-mmr">Avg 3v3 MMR: ${avgMMR}</div>
                    </div>
                </div>
                <div class="${isAdmin ? '' : 'hidden'} admin-only" style="display: flex; gap: 6px;">
                    <button onclick="editTeam('${team.id}')" style="background-color: #ff9800; padding: 4px 10px; font-size: 0.85em; border: none; border-radius: 4px; cursor: pointer; color: black;">Edit</button>
                    <button onclick="deleteTeam('${team.id}')" style="background-color: #f44336; padding: 4px 10px; font-size: 0.85em; border: none; border-radius: 4px; cursor: pointer; color: white;">Delete</button>
                </div>
            </div>
            <div class="player-list" style="margin-top: 15px;">
                ${playersHTML || '<div class="notes">No players listed.</div>'}
            </div>
        `;
        grid.appendChild(card);
    });
}

window.toggleAuthModal = toggleAuthModal;
window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.saveTeam = saveTeam;
window.editTeam = editTeam;
window.deleteTeam = deleteTeam;
window.addPlayerManualSubmit = addPlayerManualSubmit;
window.removePlayer = removePlayer;

document.addEventListener("DOMContentLoaded", () => {
    loadData();
});
