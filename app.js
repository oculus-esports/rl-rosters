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
    ();
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
    document.getElementById(`view-alias-${playerId}`).classList.add('hidden');
    document.getElementById(`edit-alias-${playerId}`).classList.remove('hidden');

    ['1v1', '2v2', '3v3'].forEach(mode => {
        document.getElementById(`view-${mode}-${playerId}`).classList.add('hidden');
        document.getElementById(`edit-${mode}-${playerId}`).classList.remove('hidden');
    });

    const editBtn = document.getElementById(`edit-player-btn-${playerId}`);
    editBtn.innerText = "Save";
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
        btn.innerText = "Edit";
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
// RENDER UI & NEW FEATURES
// ---------------------------------------------

function renderAll() {
  const query = document.getElementById("search-input") ? document.getElementById("search-input").value.toLowerCase() : "";
  const sortMode = document.getElementById("sort-select") ? document.getElementById("sort-select").value : "team";
  
  populateTeamDropdowns();
  const grid = document.getElementById("teams-grid");
  if (!grid) return;
  grid.innerHTML = "";

  // Filter players by search query
  let filteredPlayers = players.filter(p => {
    const t = teams.find(team => team.id === p.team_id);
    const teamName = t ? t.name.toLowerCase() : "";
    return (p.alias && p.alias.toLowerCase().includes(query)) || 
           p.handle.toLowerCase().includes(query) || 
           teamName.includes(query);
  });

  // Global Sorting logic
  if (sortMode !== "team") {
    if (sortMode === "peak") filteredPlayers.sort((a, b) => b.peak_rating - a.peak_rating);
    if (sortMode === "3v3") filteredPlayers.sort((a, b) => b.standard_3v3_current_mmr - a.standard_3v3_current_mmr);
    if (sortMode === "1v1") filteredPlayers.sort((a, b) => b.duel_1v1_current_mmr - a.duel_1v1_current_mmr);
    
    // Render as a single global leaderboard
    const card = document.createElement("div");
    card.className = "team-section";
    card.innerHTML = `
      <div class="team-header">
        <h3 style="margin: 0; color: #fff;">Global Leaderboard</h3>
      </div>
      <div class="player-list">
        ${filteredPlayers.map(p => generatePlayerRowHTML(p)).join('') || '<div class="notes">No players found.</div>'}
      </div>
    `;
    grid.appendChild(card);
    return;
  }

  // Standard Team Grouping
  const sortedTeams = [...teams].sort((a, b) => {
    const isAOU = a.id === 'ou' || a.name.toLowerCase() === 'university of oklahoma';
    const isBOU = b.id === 'ou' || b.name.toLowerCase() === 'university of oklahoma';
    if (isAOU) return -1;
    if (isBOU) return 1;
    return a.name.localeCompare(b.name);
  });

  sortedTeams.forEach(team => {
    const teamPlayers = filteredPlayers.filter(p => p.team_id === team.id);
    if (query && teamPlayers.length === 0 && !team.name.toLowerCase().includes(query)) return;

    const validMMR = teamPlayers.filter(p => p.standard_3v3_current_mmr > 0);
    const avgMMR = validMMR.length ? Math.round(validMMR.reduce((sum, p) => sum + p.standard_3v3_current_mmr, 0) / validMMR.length) : "N/A";
    const isOU = team.id === 'ou' || team.name.toLowerCase() === 'university of oklahoma';

    const card = document.createElement("div");
    card.className = "team-section";
    if (isOU) card.style.border = "1px solid #841617";

    card.innerHTML = `
      <div class="team-header" ${isOU ? 'style="background: linear-gradient(90deg, rgba(132, 22, 23, 0.3), transparent);"' : ''}>
        <div style="display: flex; align-items: center; gap: 15px;">
          <img src="${team.logo}" class="team-logo" alt="${team.name}">
          <div>
            <h3 style="margin: 0; font-size: 1.3em; color: #fff;">${team.name} ${isOU ? '🏆' : ''}</h3>
            <div class="avg-mmr">Avg 3v3: ${avgMMR}</div>
          </div>
        </div>
        <div class="action-buttons">
          <button class="icon-btn" onclick="copyTeamStats('${team.id}')" title="Copy Team Stats">📋 Copy</button>
          <div class="${isAdmin ? '' : 'hidden'} admin-only" style="display:inline-block;">
             <button class="icon-btn" onclick="deleteTeam('${team.id}')" style="background:#f44336;">🗑️</button>
          </div>
        </div>
      </div>
      <div class="player-list">
        ${teamPlayers.map(p => generatePlayerRowHTML(p)).join('') || '<div class="notes" style="padding:15px;">No players listed.</div>'}
      </div>
    `;
    grid.appendChild(card);
  });
}

function generatePlayerRowHTML(p) {
  const displayAlias = p.alias ? p.alias : p.handle;
  const rankIcon = getRLRankIcon(p.peak_rating);
  
  return `
    <div class="player-row" onclick="openPlayerModal('${p.id}')">
      <div class="player-identity">
        <img src="${rankIcon}" class="rank-icon" title="Peak Rank">
        <div class="player-name-block">
          <span class="player-alias">${displayAlias}</span>
          <span class="player-handle">${p.handle}</span>
        </div>
      </div>
      <div class="stat-block">
        <span class="stat-label">Peak</span>
        <span class="stat-value stat-peak">${p.peak_rating || 'N/A'}</span>
      </div>
      <div class="stat-block">
        <span class="stat-label">3v3</span>
        <span class="stat-value">
          <img src="${getRLRankIcon(p.standard_3v3_current_mmr, '3v3')}" class="micro-icon">
          ${p.standard_3v3_current_mmr || 0}
        </span>
      </div>
      <div class="stat-block">
        <span class="stat-label">2v2</span>
        <span class="stat-value">
          <img src="${getRLRankIcon(p.doubles_2v2_current_mmr, '2v2')}" class="micro-icon">
          ${p.doubles_2v2_current_mmr || 0}
        </span>
      </div>
      <div class="stat-block">
        <span class="stat-label">1v1</span>
        <span class="stat-value">
          <img src="${getRLRankIcon(p.duel_1v1_current_mmr, '1v1')}" class="micro-icon">
          ${p.duel_1v1_current_mmr || 0}
        </span>
      </div>
      <div class="action-buttons" onclick="event.stopPropagation()">
        ${p.tracker_url ? `<a href="${p.tracker_url}" target="_blank" class="icon-btn" style="text-decoration:none;">🔗</a>` : ''}
        <button class="${isAdmin ? '' : 'hidden'} admin-only icon-btn" style="background:#ff9800; color:#000;" onclick="removePlayer('${p.id}')">🗑️</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------
// HELPERS (Rank Icons, Copy, Modals)
// ---------------------------------------------

function getRLRankIcon(mmr, mode = '3v3') {
  if (!mmr || mmr <= 0) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_0.png'; // Unranked Fallback

  let ssl, gc3, gc2, gc1, c3, c2, c1, d1, p1, g1, s1;

  if (mode === '1v1') {
    ssl = 1355; gc3 = 1296; gc2 = 1236; gc1 = 1176; c3 = 1115; c2 = 1055; c1 = 995;
    d1 = 815; p1 = 635; g1 = 440; s1 = 275;
  } else if (mode === '2v2') {
    ssl = 1875; gc3 = 1707; gc2 = 1576; gc1 = 1435; c3 = 1315; c2 = 1196; c1 = 1075;
    d1 = 835; p1 = 655; g1 = 475; s1 = 296;
  } else {
    // 3v3 Standard
    ssl = 1860; gc3 = 1715; gc2 = 1576; gc1 = 1436; c3 = 1315; c2 = 1195; c1 = 1076;
    d1 = 835; p1 = 655; g1 = 475; s1 = 296;
  }

  // Supersonic Legend & Grand Champion
  if (mmr >= ssl) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_22.png';
  if (mmr >= gc3) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_21.png';
  if (mmr >= gc2) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_20.png';
  if (mmr >= gc1) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_19.png';
  
  // Champion
  if (mmr >= c3) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_18.png';
  if (mmr >= c2) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_17.png';
  if (mmr >= c1) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_16.png';
  
  // Diamond 1, Plat 1, Gold 1, Silver 1, Bronze 1
  if (mmr >= d1) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_13.png';
  if (mmr >= p1) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_10.png';
  if (mmr >= g1) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_7.png';
  if (mmr >= s1) return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_4.png';
  
  // Bronze Fallback (If they have MMR but it's lower than Silver 1)
  return 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4_1.png'; 
}

function copyTeamStats(teamId) {
  const team = teams.find(t => t.id === teamId);
  const teamPlayers = players.filter(p => p.team_id === teamId);
  let text = `**${team.name} Rosters & Stats**\n`;
  teamPlayers.forEach(p => {
    text += `- ${p.alias || p.handle}: Peak ${p.peak_rating} | 3v3 ${p.standard_3v3_current_mmr} | 2v2 ${p.doubles_2v2_current_mmr}\n`;
  });
  navigator.clipboard.writeText(text).then(() => alert(`${team.name} stats copied to clipboard!`));
}

function openPlayerModal(playerId) {
  const p = players.find(p => p.id === playerId);
  if (!p) return;
  document.getElementById('modal-name').innerText = p.alias || p.handle;
  document.getElementById('modal-body').innerHTML = `
    <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px;">
      <img src="${getRLRankIcon(p.peak_rating)}" style="width: 80px; height: 80px; filter: drop-shadow(0 0 10px rgba(255,152,0,0.5));">
      <div>
        <h3 style="color: var(--accent-gold); margin:0;">Peak MMR: ${p.peak_rating || 'N/A'} ${p.peak_season ? `(S${p.peak_season})` : ''}</h3>
        <p style="color: var(--text-muted); font-size: 0.9em; margin-top:5px;">${p.notes ? `📝 ${p.notes}` : 'No scouting notes available.'}</p>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
       <div class="form-box"><strong>3v3 Current:</strong> ${p.standard_3v3_current_mmr} <br><em>Best: ${p.standard_3v3_best_mmr}</em></div>
       <div class="form-box"><strong>2v2 Current:</strong> ${p.doubles_2v2_current_mmr} <br><em>Best: ${p.doubles_2v2_best_mmr}</em></div>
       <div class="form-box"><strong>1v1 Current:</strong> ${p.duel_1v1_current_mmr} <br><em>Best: ${p.duel_1v1_best_mmr}</em></div>
    </div>
  `;
  document.getElementById('player-modal').classList.remove('hidden');
}

function closeModal(e) {
  if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('close-btn')) {
    document.getElementById('player-modal').classList.add('hidden');
  }
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
window.openPlayeModal = openPlayerModal;
window.closeModal = closeModal;
window.copyTeamStats = copyTeamStats;

document.addEventListener("DOMContentLoaded", () => {
    loadData();
});
