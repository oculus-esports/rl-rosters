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

// Global variable to track which team is currently being edited
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

        // Determine Team ID (keep original ID if editing, otherwise generate a new slug)
        const teamId = editingTeamId || name.toLowerCase().replace(/\s+/g, '-');

        // Preserve current logo if no new file uploaded during an edit
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

    // Reset Form & Editing State
    editingTeamId = null;
    document.getElementById("team-name-input").value = "";
    document.getElementById("team-logo-file").value = "";
    const submitBtn = document.querySelector("#addTeamForm button[type='submit']");
    if (submitBtn) submitBtn.innerText = "Save Team";

    loadData();
}

// Populate team form for editing
function editTeam(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    editingTeamId = team.id;
    document.getElementById("team-name-input").value = team.name;
    
    // Smooth scroll back up to management panel
    document.querySelector(".card").scrollIntoView({ behavior: 'smooth' });
    
    alert(`Editing "${team.name}". Choose a new logo file to replace the logo, then click Save.`);
}

// Delete Team Function
async function deleteTeam(teamId) {
    if (!confirm("Are you sure you want to delete this team? Players attached to this team will remain in DB.")) return;
    const { error } = await supabaseClient.from('teams').delete().eq('id', teamId);
    if (error) alert("Error deleting team: " + error.message);
    else loadData();
}

// Team Datalist Helpers
function populateTeamDropdowns() {
    const datalist = document.getElementById("teams-list");
    if (!datalist) return;

    datalist.innerHTML = ""; // Clear existing options

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
    const platform = document.getElementById('manualPlatformSelect').value;
    const teamId = getSelectedTeamId('manualTeamInput');
    
    const trackerUrlInput = document.getElementById('manualTrackerUrl');
    const trackerUrl = trackerUrlInput ? trackerUrlInput.value.trim() : null;
    
    const alias = document.getElementById('manualAlias').value.trim();
    const notes = document.getElementById('manualNotes').value.trim();

    const m1v1 = parseInt(document.getElementById('manual1v1MMR').value) || 0;
    const m2v2 = parseInt(document.getElementById('manual2v2MMR').value) || 0;
    const m3v3 = parseInt(document.getElementById('manual3v3MMR').value) || 0;
    const peak = parseInt(document.getElementById('manualPeakMMR').value) || Math.max(m1v1, m2v2, m3v3);

    if (!teamId) return alert("Please select or type a valid team.");

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
        tracker_url: trackerUrl,
        last_updated: currentDate
    };

    const { error } = await supabaseClient.from('players').upsert(playerData);
    if (error) {
        alert("Error saving player: " + error.message);
        return;
    }

    // Save Rank History for trend tracking
    const historyData = {
        player_id: playerId,
        recorded_date: currentDate,
        duel_1v1_mmr: m1v1,
        doubles_2v2_mmr: m2v2,
        standard_3v3_mmr: m3v3
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
    
    // Populate the datalist for the team search-as-you-type input
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
                    <span class="handle">${p.handle} (${p.platform})</span>
                </div>
                
                <div class="peak-badge">
                    &#127942; <strong>Peak:</strong> ${p.peak_rating || 'N/A'} MMR ${p.peak_season ? `(S${p.peak_season})` : ''} - ${p.peak_playlist || ''}
                </div>

                <div class="playlist-grid">
                    <div class="playlist-box">
                        <div class="playlist-title">1v1 Duel</div>
                        <div><strong>Cur MMR:</strong> ${p.duel_1v1_current_mmr || 0}</div>
                    </div>
                    <div class="playlist-box">
                        <div class="playlist-title">2v2 Doubles</div>
                        <div><strong>Cur MMR:</strong> ${p.doubles_2v2_current_mmr || 0}</div>
                    </div>
                    <div class="playlist-box">
                        <div class="playlist-title">3v3 Standard</div>
                        <div><strong>Cur MMR:</strong> ${p.standard_3v3_current_mmr || 0} <br>${trendHtml}</div>
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

// Expose functions globally to HTML onclick handlers
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
