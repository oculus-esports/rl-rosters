// 1. Core Config & Initialization
const SUPABASE_URL = "https://jzdbvjevpbvdnzoiqibl.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_L_AJuwnBborlEq2ysJkkqw_JWC5NkJq"; 
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UPDATE THIS VARIABLE WHEN A NEW ROCKET LEAGUE SEASON STARTS
const CURRENT_RL_SEASON = 38; 

let isAdmin = false;
let teams = [];
let players = [];
let rankHistory = [];

async function loadData() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    setAdminState(!!session);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        setAdminState(!!session);
    });

    const { data: teamsData } = await supabaseClient.from('teams').select('*');
    // Maintain stable player ordering so saving edits doesn't shuffle positions
    const { data: playersData } = await supabaseClient.from('players').select('*').order('id', { ascending: true });
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

async function uploadLogoFile(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `logos/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('team-logos')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) return null;

    const { data } = supabaseClient.storage.from('team-logos').getPublicUrl(filePath);
    return data.publicUrl;
}

// ---------------------------------------------
// TEAM MANAGEMENT
// ---------------------------------------------

async function saveTeam(directData = null) {
    let newTeam;
    if (directData) {
        newTeam = directData;
    } else {
        const name = document.getElementById("team-name-input").value.trim();
        const fileInput = document.getElementById("team-logo-file");
        let logoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a1a&color=fff&size=128&bold=true`;

        if (!name) return alert("Team name required.");

        if (fileInput.files.length > 0) {
            const uploadedUrl = await uploadLogoFile(fileInput.files[0]);
            if (uploadedUrl) logoUrl = uploadedUrl;
        }

        const teamId = name.toLowerCase().replace(/\s+/g, '-');
        newTeam = { id: teamId, name: name, logo: logoUrl };
    }

    const { error } = await supabaseClient.from('teams').upsert(newTeam);
    if (error) return alert("Error saving team: " + error.message);

    if (!directData) document.getElementById("addTeamForm").reset();
    loadData();
}

function enableInlineEdit(teamId) {
    document.getElementById(`display-name-${teamId}`).classList.add('hidden');
    document.getElementById(`input-name-${teamId}`).classList.remove('hidden');
    document.getElementById(`edit-logo-${teamId}`).classList.remove('hidden');

    const editBtn = document.getElementById(`edit-btn-${teamId}`);
    editBtn.innerText = "Save";
    editBtn.style.backgroundColor = "#4caf50"; 
    editBtn.style.color = "white";
    editBtn.setAttribute("onclick", `saveInlineTeam('${teamId}')`);
}

async function saveInlineTeam(teamId) {
    const newName = document.getElementById(`input-name-${teamId}`).value.trim();
    const fileInput = document.getElementById(`edit-logo-${teamId}`);
    const currentTeam = teams.find(t => t.id === teamId);

    if (!newName) return alert("Team name cannot be empty.");

    const btn = document.getElementById(`edit-btn-${teamId}`);
    btn.innerText = "Saving...";

    let logoUrl = currentTeam.logo;

    if (fileInput.files.length > 0) {
        const uploadedUrl = await uploadLogoFile(fileInput.files[0]);
        if (uploadedUrl) logoUrl = uploadedUrl;
    }

    const updatedTeam = { id: teamId, name: newName, logo: logoUrl };
    const { error } = await supabaseClient.from('teams').upsert(updatedTeam);
    if (error) {
        alert("Error updating team: " + error.message);
        btn.innerText = "Save";
        return;
    }
    loadData();
}

async function deleteTeam(teamId) {
    if (!confirm("Are you sure you want to delete this team?")) return;
    const { error } = await supabaseClient.from('teams').delete().eq('id', teamId);
    if (error) alert("Error deleting team: " + error.message);
    else loadData();
}

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

// ---------------------------------------------
// PLAYER MANAGEMENT
// ---------------------------------------------

async function addPlayerManualSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('manualUsername').value.trim();
    const teamId = getSelectedTeamId('manualTeamInput');
    
    const trackerUrlInput = document.getElementById('manualTrackerUrl');
    const trackerUrl = trackerUrlInput ? trackerUrlInput.value.trim() : null;
    
    const alias = document.getElementById('manualAlias').value.trim();
    const notes = document.getElementById('manualNotes').value.trim();

    const c1 = parseInt(document.getElementById('m1v1_cur').value) || 0;
    const b1 = parseInt(document.getElementById('m1v1_best').value) || 0;
    const s1 = parseInt(document.getElementById('m1v1_season').value) || 0;
    
    const c2 = parseInt(document.getElementById('m2v2_cur').value) || 0;
    const b2 = parseInt(document.getElementById('m2v2_best').value) || 0;
    const s2 = parseInt(document.getElementById('m2v2_season').value) || 0;
    
    const c3 = parseInt(document.getElementById('m3v3_cur').value) || 0;
    const b3 = parseInt(document.getElementById('m3v3_best').value) || 0;
    const s3 = parseInt(document.getElementById('m3v3_season').value) || 0;

    if (!teamId) return alert("Please select or type a valid team.");

    const peak = Math.max(c1, b1, c2, b2, c3, b3);
    let peakSeason = 0;
    if (peak === b1) peakSeason = s1;
    if (peak === b2) peakSeason = s2;
    if (peak === b3) peakSeason = s3;
    if (peakSeason === 0 && peak > 0) peakSeason = CURRENT_RL_SEASON;

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
    if (error) return alert("Error saving player: " + error.message);

    const historyData = { player_id: playerId, recorded_date: currentDate, duel_1v1_mmr: c1, doubles_2v2_mmr: c2, standard_3v3_mmr: c3 };
    await supabaseClient.from('rank_history').insert(historyData);

    alert(`Player ${username} saved successfully!`);
    document.getElementById('addPlayerManualForm').reset();
    loadData();
}

function enableInlinePlayerEdit(playerId) {
    // Show alias edit field
    document.getElementById(`view-alias-${playerId}`).classList.add('hidden');
    document.getElementById(`edit-alias-${playerId}`).classList.remove('hidden');

    // Show MMR edit fields
    ['1v1', '2v2', '3v3'].forEach(mode => {
        document.getElementById(`view-${mode}-${playerId}`).classList.add('hidden');
        document.getElementById(`edit-${mode}-${playerId}`).classList.remove('hidden');
    });

    const editBtn = document.getElementById(`edit-player-btn-${playerId}`);
    editBtn.innerText = "Save Player";
    editBtn.style.backgroundColor = "#4caf50";
    editBtn.style.color = "white";
    editBtn.setAttribute("onclick", `saveInlinePlayer('${playerId}')`);
}

async function saveInlinePlayer(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const btn = document.getElementById(`edit-player-btn-${playerId}`);
    btn.innerText = "Saving...";

    const newAlias = document.getElementById(`input-alias-${playerId}`).value.trim();
    const new1v1Cur = parseInt(document.getElementById(`input-1v1-${playerId}`).value) || 0;
    const new2v2Cur = parseInt(document.getElementById(`input-2v2-${playerId}`).value) || 0;
    const new3v3Cur = parseInt(document.getElementById(`input-3v3-${playerId}`).value) || 0;

    let updatedPlayer = { ...player, alias: newAlias };
    
    // Auto-update bests and seasons if current exceeds best
    updatedPlayer.duel_1v1_current_mmr = new1v1Cur;
    if (new1v1Cur > updatedPlayer.duel_1v1_best_mmr) {
        updatedPlayer.duel_1v1_best_mmr = new1v1Cur;
        updatedPlayer.duel_1v1_best_season = CURRENT_RL_SEASON;
    }

    updatedPlayer.doubles_2v2_current_mmr = new2v2Cur;
    if (new2v2Cur > updatedPlayer.doubles_2v2_best_mmr) {
        updatedPlayer.doubles_2v2_best_mmr = new2v2Cur;
        updatedPlayer.doubles_2v2_best_season = CURRENT_RL_SEASON;
    }

    updatedPlayer.standard_3v3_current_mmr = new3v3Cur;
    if (new3v3Cur > updatedPlayer.standard_3v3_best_mmr) {
        updatedPlayer.standard_3v3_best_mmr = new3v3Cur;
        updatedPlayer.standard_3v3_best_season = CURRENT_RL_SEASON;
    }

    const newPeak = Math.max(updatedPlayer.duel_1v1_best_mmr, updatedPlayer.doubles_2v2_best_mmr, updatedPlayer.standard_3v3_best_mmr);
    if (newPeak > updatedPlayer.peak_rating) {
        updatedPlayer.peak_rating = newPeak;
        updatedPlayer.peak_season = CURRENT_RL_SEASON;
    }

    updatedPlayer.last_updated = new Date().toLocaleDateString();

    const { error } = await supabaseClient.from('players').upsert(updatedPlayer);
    if (error) {
        alert("Error updating player: " + error.message);
        btn.innerText = "Edit Player";
        return;
    }

    const historyData = {
        player_id: playerId,
        recorded_date: updatedPlayer.last_updated,
        duel_1v1_mmr: new1v1Cur,
        doubles_2v2_mmr: new2v2Cur,
        standard_3v3_mmr: new3v3Cur
    };
    await supabaseClient.from('rank_history').insert(historyData);

    loadData();
}

async function removePlayer(playerId) {
    if (!confirm("Are you sure you want to remove this player?")) return;
    await supabaseClient.from('players').delete().eq('id', playerId);
    loadData();
}

// ---------------------------------------------
// RENDER UI
// ---------------------------------------------

function renderAll() {
    const query = document.getElementById("search-input") ? document.getElementById("search-input").value.toLowerCase() : "";
    populateTeamDropdowns();

    const grid = document.getElementById("teams-grid");
    if (!grid) return;
    grid.innerHTML = "";

    // Always Pin OU / Oklahoma to the top of the team array
    const sortedTeams = [...teams].sort((a, b) => {
        const isAOU = a.id === 'ou' || a.name.toLowerCase() === 'university of oklahoma';
        const isBOU = b.id === 'ou' || b.name.toLowerCase() === 'university of oklahoma';
        if (isAOU) return -1;
        if (isBOU) return 1;
        return a.name.localeCompare(b.name);
    });

    sortedTeams.forEach(team => {
        const teamPlayers = players.filter(p => p.team_id === team.id && 
            ((p.alias && p.alias.toLowerCase().includes(query)) || p.handle.toLowerCase().includes(query) || team.name.toLowerCase().includes(query)));
        
        if (query && teamPlayers.length === 0 && !team.name.toLowerCase().includes(query)) return;

        const validMMR = teamPlayers.filter(p => p.standard_3v3_current_mmr > 0);
        const avgMMR = validMMR.length ? Math.round(validMMR.reduce((sum, p) => sum + p.standard_3v3_current_mmr, 0) / validMMR.length) : "N/A";

        const isOU = team.id === 'ou' || team.name.toLowerCase() === 'university of oklahoma';

        const card = document.createElement("div");
        card.className = "team-card";
        
        // Custom branding style if it's Oklahoma
        if (isOU) {
            card.style.border = "2px solid #841617";
            card.style.boxShadow = "0 0 15px rgba(132, 22, 23, 0.3)";
        }

        let playersHTML = teamPlayers.map(p => {
            const pHistory = rankHistory.filter(h => h.player_id === p.id);
            let trendHtml = "";
            if (pHistory.length > 1) {
                const diff = p.standard_3v3_current_mmr - pHistory[1].standard_3v3_mmr;
                if (diff > 0) trendHtml = `<span style="color: #4caf50; font-size:0.85em;">&#128200; +${diff}</span>`;
                else if (diff < 0) trendHtml = `<span style="color: #f44336; font-size:0.85em;">&#128201; ${diff}</span>`;
            }

            const displayAlias = p.alias ? p.alias : p.handle;
            const displayHandle = p.alias ? p.handle : '';

            const trackerLinkHTML = p.tracker_url 
                ? `<a href="${p.tracker_url}" target="_blank" style="color: #bbb; text-decoration: none; font-size: 0.9em; display: flex; align-items: center; gap: 4px; border: 1px solid #444; padding: 4px 8px; border-radius: 4px; background: #222; transition: all 0.2s;" onmouseover="this.style.borderColor='#4CAF50'; this.style.color='#4CAF50'" onmouseout="this.style.borderColor='#444'; this.style.color='#bbb'">🔗 Tracker</a>` 
                : '';

            return `
            <div class="player-item" style="background: #1e1e24; border: 1px solid #2d2d33; border-radius: 8px; padding: 16px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px;">
                    <div id="view-alias-${p.id}" style="display: flex; flex-direction: column;">
                        <span style="font-size: 1.4em; font-weight: 800; color: #fff; letter-spacing: 0.5px;">${displayAlias}</span>
                        ${displayHandle ? `<span style="font-size: 0.9em; color: #777;">${displayHandle}</span>` : ''}
                    </div>
                    <div id="edit-alias-${p.id}" class="hidden" style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                        <label style="font-size: 0.75em; color: #aaa;">Edit Alias / Other Known Names:</label>
                        <input type="text" id="input-alias-${p.id}" value="${p.alias || ''}" placeholder="Alias (optional)" style="font-size: 1.1em; font-weight: bold; padding: 6px; background: #111; color: #fff; border: 1px solid #555; border-radius: 4px;">
                        <span style="font-size: 0.8em; color: #666;">Tag: ${p.handle}</span>
                    </div>
                </div>

                <div style="background: linear-gradient(90deg, #ff980015, transparent); border-left: 4px solid #ff9800; padding: 6px 12px; margin-bottom: 15px; border-radius: 0 4px 4px 0; color: #ffb74d; font-size: 0.9em;">
                    &#127942; <strong>Peak:</strong> ${p.peak_rating || 'N/A'} MMR ${p.peak_season ? `<span style="color: #cc8e3a;">(S${p.peak_season})</span>` : ''}
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 15px;">
                    
                    <div style="background: #25252b; padding: 12px; border-radius: 6px; text-align: left; border: 1px solid #333;">
                        <div style="font-size: 0.75em; color: #aaa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">1v1 Duel</div>
                        <div id="view-1v1-${p.id}">
                            <div style="font-size: 1.2em; font-weight: bold; color: #fff;">${p.duel_1v1_current_mmr || 0}</div>
                            <div style="font-size: 0.85em; color: #888; margin-top: 4px;">Best: ${p.duel_1v1_best_mmr || 0} ${p.duel_1v1_best_season ? `(S${p.duel_1v1_best_season})` : ''}</div>
                        </div>
                        <div id="edit-1v1-${p.id}" class="hidden">
                            <input type="number" id="input-1v1-${p.id}" value="${p.duel_1v1_current_mmr || 0}" style="width: 100%; box-sizing: border-box; font-size: 1.1em; padding: 6px; background: #111; color: #fff; border: 1px solid #555; border-radius: 4px;">
                        </div>
                    </div>
                    
                    <div style="background: #25252b; padding: 12px; border-radius: 6px; text-align: left; border: 1px solid #333;">
                        <div style="font-size: 0.75em; color: #aaa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">2v2 Doubles</div>
                        <div id="view-2v2-${p.id}">
                            <div style="font-size: 1.2em; font-weight: bold; color: #fff;">${p.doubles_2v2_current_mmr || 0}</div>
                            <div style="font-size: 0.85em; color: #888; margin-top: 4px;">Best: ${p.doubles_2v2_best_mmr || 0} ${p.doubles_2v2_best_season ? `(S${p.doubles_2v2_best_season})` : ''}</div>
                        </div>
                        <div id="edit-2v2-${p.id}" class="hidden">
                            <input type="number" id="input-2v2-${p.id}" value="${p.doubles_2v2_current_mmr || 0}" style="width: 100%; box-sizing: border-box; font-size: 1.1em; padding: 6px; background: #111; color: #fff; border: 1px solid #555; border-radius: 4px;">
                        </div>
                    </div>
                    
                    <div style="background: #25252b; padding: 12px; border-radius: 6px; text-align: left; border: 1px solid #333;">
                        <div style="font-size: 0.75em; color: #aaa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;">3v3 Standard</div>
                        <div id="view-3v3-${p.id}">
                            <div style="font-size: 1.2em; font-weight: bold; color: #fff; display: flex; align-items: baseline; justify-content: space-between;">
                                <span>${p.standard_3v3_current_mmr || 0}</span>
                                <span>${trendHtml}</span>
                            </div>
                            <div style="font-size: 0.85em; color: #888; margin-top: 4px;">Best: ${p.standard_3v3_best_mmr || 0} ${p.standard_3v3_best_season ? `(S${p.standard_3v3_best_season})` : ''}</div>
                        </div>
                        <div id="edit-3v3-${p.id}" class="hidden">
                            <input type="number" id="input-3v3-${p.id}" value="${p.standard_3v3_current_mmr || 0}" style="width: 100%; box-sizing: border-box; font-size: 1.1em; padding: 6px; background: #111; color: #fff; border: 1px solid #555; border-radius: 4px;">
                        </div>
                    </div>
                </div>

                ${p.notes ? `<div style="background: #19191d; padding: 10px 12px; border-radius: 4px; font-size: 0.85em; color: #aaa; border: 1px solid #2d2d33; margin-bottom: 15px;"><em>📝 ${p.notes}</em></div>` : ''}
                
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #2d2d33; padding-top: 12px;">
                    <span style="font-size: 0.75em; color: #666;">Last Updated: ${p.last_updated}</span>
                    <div class="${isAdmin ? '' : 'hidden'} admin-only" style="display: flex; gap: 8px; align-items: center;">
                        ${trackerLinkHTML}
                        <button id="edit-player-btn-${p.id}" onclick="enableInlinePlayerEdit('${p.id}')" style="background-color: #ff9800; color: black; padding: 4px 10px; font-size: 0.85em; font-weight: 600; border: none; border-radius: 4px; cursor: pointer;">Edit Player</button>
                        <button class="remove-btn" onclick="removePlayer('${p.id}')" style="background-color: #f44336; color: white; padding: 4px 10px; font-size: 0.85em; font-weight: 600; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        card.innerHTML = `
            <div class="team-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid #333; padding-bottom: 15px; margin-bottom: 15px; ${isOU ? 'background: linear-gradient(90deg, rgba(132, 22, 23, 0.15), transparent); padding: 12px; border-radius: 6px;' : ''}">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="display: flex; flex-direction: column; gap: 5px;">
                        <img src="${team.logo}" class="team-logo" alt="${team.name}" style="width: 54px; height: 54px; object-fit: contain; border-radius: 8px; background: #222; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
                        <input type="file" id="edit-logo-${team.id}" accept="image/*" class="hidden" style="max-width: 140px; font-size: 0.7em;">
                    </div>
                    <div class="team-info">
                        <h3 style="margin: 0; font-size: 1.4em; color: #fff;" id="display-name-${team.id}">${team.name} ${isOU ? '🏆' : ''}</h3>
                        <input type="text" id="input-name-${team.id}" class="hidden" value="${team.name}" style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px; padding: 6px; border-radius: 4px; border: 1px solid #555; background: #111; color: white;">
                        <div class="avg-mmr" style="color: #ffb74d; font-size: 0.9em; font-weight: 600; margin-top: 4px;">Avg 3v3 MMR: ${avgMMR}</div>
                    </div>
                </div>
                <div class="${isAdmin ? '' : 'hidden'} admin-only" style="display: flex; gap: 8px;">
                    <button id="edit-btn-${team.id}" onclick="enableInlineEdit('${team.id}')" style="background-color: #ff9800; padding: 6px 14px; font-size: 0.85em; font-weight: 600; border: none; border-radius: 4px; cursor: pointer; color: black;">Edit</button>
                    <button onclick="deleteTeam('${team.id}')" style="background-color: #f44336; padding: 6px 14px; font-size: 0.85em; font-weight: 600; border: none; border-radius: 4px; cursor: pointer; color: white;">Delete</button>
                </div>
            </div>
            <div class="player-list">
                ${playersHTML || '<div class="notes" style="color: #666; font-style: italic;">No players listed.</div>'}
            </div>
        `;
        grid.appendChild(card);
    });
}

window.toggleAuthModal = toggleAuthModal;
window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.saveTeam = saveTeam;
window.enableInlineEdit = enableInlineEdit;
window.saveInlineTeam = saveInlineTeam;
window.deleteTeam = deleteTeam;
window.addPlayerManualSubmit = addPlayerManualSubmit;
window.enableInlinePlayerEdit = enableInlinePlayerEdit;
window.saveInlinePlayer = saveInlinePlayer;
window.removePlayer = removePlayer;

document.addEventListener("DOMContentLoaded", () => {
    loadData();
});
