// 1. Core Config & Initialization
const SUPABASE_URL = "https://jzdbvjevpbvdnzoiqibl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_L_AJuwnBborlEq2ysJkkqw_JWC5NkJq";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CURRENT_RL_SEASON = 38;

let isAdmin = false;
let isTeam = false;
let teams = [];
let players = [];
let rankHistory = [];
let matchLogs = [];

// ---------------------------------------------
// CUSTOM UI ALERTS & CONFIRMS
// ---------------------------------------------
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast show';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function customConfirm(message, onConfirm) {
  document.getElementById('confirm-message').innerText = message;
  document.getElementById('confirm-modal').classList.remove('hidden');
  
  document.getElementById('confirm-yes').onclick = () => {
      document.getElementById('confirm-modal').classList.add('hidden');
      if (onConfirm) onConfirm();
  };
  
  document.getElementById('confirm-no').onclick = () => {
      document.getElementById('confirm-modal').classList.add('hidden');
  };
}

// ---------------------------------------------
// DATA LOADING & AUTH
// ---------------------------------------------
async function loadData() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  setAdminState(session ? session.user : null);
  
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setAdminState(session ? session.user : null);
  });

  const { data: teamsData } = await supabaseClient.from('teams').select('*');
  const { data: playersData } = await supabaseClient.from('players').select('*').order('id', { ascending: true });
  const { data: historyData } = await supabaseClient.from('rank_history').select('*').order('id', { ascending: false });
  const { data: matchesData } = await supabaseClient.from('match_logs').select('*');

  teams = teamsData || [];
  players = playersData || [];
  rankHistory = historyData || [];
  matchLogs = matchesData || [];

  if (teams.length === 0) {
    await saveTeam({id: 'ou', name: 'University of Oklahoma', logo: 'https://upload.wikimedia.org/wikipedia/commons/8/86/Oklahoma_Sooners_logo.svg'});
    return;
  }

  // Handle URL Parameter Direct Linking (?team=Rogers-State-University)
  const urlParams = new URLSearchParams(window.location.search);
  const urlTeamRaw = urlParams.get('team');
  if (urlTeamRaw && !window.hasAutoScrolled) {
      // Convert URL hyphens back into standard spaces for the search filter
      const searchBox = document.getElementById("search-input");
      if (searchBox) searchBox.value = urlTeamRaw.replace(/-/g, ' ');
      window.hasAutoScrolled = true;
  }

  renderAll();
  setupLeagueAutocomplete();
}

function setAdminState(user) {
  if (user) {
    isAdmin = (user.email === "jacobross@ou.edu");
    isTeam = true; 
    
    const statusEl = document.getElementById("admin-status");
    const authBtn = document.getElementById("auth-btn");
    
    statusEl.innerText = isAdmin ? "Mode: Admin Authorized" : "Mode: Team Editor";
    authBtn.innerText = "Logout";
    authBtn.onclick = logoutAdmin;
    
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
    document.querySelectorAll(".team-only").forEach(el => el.classList.remove("hidden"));
  } else {
    isAdmin = false;
    isTeam = false;
    document.getElementById("admin-status").innerText = "Mode: Public Viewer";
    document.getElementById("auth-btn").innerText = "Team Login";
    document.getElementById("auth-btn").onclick = toggleAuthModal;
    document.querySelectorAll(".admin-only, .team-only").forEach(el => el.classList.add("hidden"));
  }
  if (teams.length > 0) renderAll();
}

function toggleAuthModal() {
  document.getElementById("login-modal").classList.toggle("hidden");
}

async function loginAdmin() {
  let email = document.getElementById("admin-email").value.trim();
  const password = document.getElementById("admin-password").value.trim();
  
  if (email.toLowerCase() === "ourl") email = "jacobross@ou.edu";
  if (email.toLowerCase() === "player") email = "player@ou.edu";

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    showToast("Login failed: " + error.message);
  } else {
    document.getElementById("login-modal").classList.add("hidden");
    document.getElementById("admin-email").value = "";
    document.getElementById("admin-password").value = "";
    showToast("Login Successful!");
  }
}

async function logoutAdmin() {
  await supabaseClient.auth.signOut();
  showToast("Logged out successfully.");
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
    
    if (!name) return showToast("Team name required.");
    
    if (fileInput.files.length > 0) {
      const uploadedUrl = await uploadLogoFile(fileInput.files[0]);
      if (uploadedUrl) logoUrl = uploadedUrl;
    }
    
    const teamId = name.toLowerCase().replace(/\s+/g, '-');
    const themeColor = document.getElementById("team-color-input").value;
    
    newTeam = { id: teamId, name: name, logo: logoUrl, theme_color: themeColor };
  }

  const { error } = await supabaseClient.from('teams').upsert(newTeam);
  if (error) return showToast("Error saving team: " + error.message);
  
  if (!directData) {
    document.getElementById("addTeamForm").reset();
    showToast(`${newTeam.name} added successfully!`);
  }
  loadData();
}

async function deleteTeam(teamId) {
  customConfirm("Are you sure you want to completely delete this team and all of its players?", async () => {
    const { error } = await supabaseClient.from('teams').delete().eq('id', teamId);
    if (error) showToast("Error deleting team: " + error.message);
    else {
      showToast("Team deleted.");
      loadData();
    }
  });
}

function openEditTeamModal(teamId) {
  const team = teams.find(t => t.id === teamId);
  if (!team) return;

  document.getElementById('modal-name').innerText = `✏️ Edit ${team.name}`;
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="event.preventDefault(); saveTeamEdit('${team.id}')" style="display: flex; flex-direction: column; gap: 15px;">
      <div>
        <label style="color: var(--text-muted); font-size: 0.85rem;">Team Name</label>
        <input type="text" id="edit-t-name" value="${team.name}" class="modal-input" required>
      </div>
      <div>
        <label style="color: var(--text-muted); font-size: 0.85rem;">Logo URL (Or upload below)</label>
        <input type="text" id="edit-t-logo-url" value="${team.logo}" class="modal-input">
      </div>
      <div>
        <label style="color: var(--text-muted); font-size: 0.85rem;">Upload New Logo (Optional)</label>
        <input type="file" id="edit-t-logo-file" accept="image/*" class="modal-input" style="background: var(--bg-input);">
      </div>
      <div style="display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); width: fit-content;">
        <span style="font-size: 1.2rem;">🎨</span>
        <label for="edit-t-color" style="font-size: 0.9rem; color: #fff; cursor: pointer;">Team Color</label>
        <input type="color" id="edit-t-color" value="${team.theme_color || '#323232'}" style="background: none; border: none; cursor: pointer; width: 35px; height: 35px; padding: 0; margin-left: 10px;">
      </div>
      <div style="display: flex; gap: 10px; margin-top: 10px;">
         <button type="submit" class="btn" id="edit-t-save" style="flex: 1; background: var(--accent-green);">Save Updates</button>
         <button type="button" class="btn" onclick="document.getElementById('player-modal').classList.add('hidden')" style="background: #555;">Cancel</button>
      </div>
    </form>
  `;
  document.getElementById('player-modal').classList.remove('hidden');
}

async function saveTeamEdit(teamId) {
  const team = teams.find(t => t.id === teamId);
  if (!team) return;

  const btn = document.getElementById('edit-t-save');
  btn.innerText = 'Saving...';

  const newName = document.getElementById('edit-t-name').value.trim();
  const color = document.getElementById('edit-t-color').value;
  let logoUrl = document.getElementById('edit-t-logo-url').value.trim();
  const fileInput = document.getElementById('edit-t-logo-file');

  if (fileInput.files.length > 0) {
      const uploadedUrl = await uploadLogoFile(fileInput.files[0]);
      if (uploadedUrl) logoUrl = uploadedUrl;
  }

  const updatedTeam = { id: team.id, name: newName, logo: logoUrl, theme_color: color };
  const { error } = await supabaseClient.from('teams').update(updatedTeam).eq('id', team.id);

  if (error) {
      showToast("Error updating team: " + error.message);
      btn.innerText = 'Save Updates';
      return;
  }

  document.getElementById('player-modal').classList.add('hidden');
  showToast(`${newName} updated successfully!`);
  await loadData();
}

async function copyTeamStats(teamId) {
  const team = teams.find(t => t.id === teamId);
  const teamCard = document.getElementById(`team-section-${teamId}`);
  
  if (!teamCard || !team) return;

  // 1. Temporarily hide the action buttons so they don't show up in the screenshot
  const actionButtons = teamCard.querySelector('.action-buttons');
  const originalDisplay = actionButtons.style.display;
  actionButtons.style.display = 'none';

  // Provide a loading toast since image generation takes a brief second
  showToast(`Generating image for ${team.name}...`);

  try {
    // 2. Take the virtual screenshot
    const canvas = await window.html2canvas(teamCard, {
      backgroundColor: '#141414', // Matches your dark theme card background
      scale: 2, // Doubles the resolution for a crisp, high-quality image
      useCORS: true // Required so external images (like logos) don't break the snapshot
    });

    // 3. Restore the action buttons back to the UI
    actionButtons.style.display = originalDisplay;

    // 4. Convert the snapshot to a PNG Blob and write to clipboard
    canvas.toBlob(async (blob) => {
      try {
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);
        showToast(`📸 ${team.name} roster image copied to clipboard!`);
      } catch (err) {
        console.error("Clipboard Error:", err);
        showToast("Failed to copy image. (Clipboard API requires HTTPS)");
      }
    }, "image/png");

  } catch (err) {
    console.error("html2canvas Error:", err);
    actionButtons.style.display = originalDisplay;
    showToast("Error generating team image.");
  }
}

function copyTeamLink(teamName) {
  // Format "Rogers State University" into "Rogers-State-University" for cleaner URLs
  const formattedName = teamName.replace(/\s+/g, '-');
  const link = window.location.origin + window.location.pathname + '?team=' + encodeURIComponent(formattedName);
  navigator.clipboard.writeText(link).then(() => showToast(`Link for ${teamName} copied to clipboard!`));
}

// ---------------------------------------------
// PLAYER MANAGEMENT
// ---------------------------------------------
function openAddPlayerModal(teamId) {
  document.getElementById('addPlayerManualForm').reset();
  document.getElementById('manualTeamInput').value = teamId;
  const team = teams.find(t => t.id === teamId);
  document.getElementById('add-player-title').innerText = `Add Player to ${team ? team.name : 'Team'}`;
  document.getElementById('add-player-modal').classList.remove('hidden');
}

async function addPlayerManualSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('manualUsername').value.trim();
  const teamId = document.getElementById('manualTeamInput').value.trim();
  const role = document.getElementById('manualRole').value;
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

  if (!teamId) return showToast("Critical Error: No Team ID assigned.");

  const peak = Math.max(c1, b1, c2, b2, c3, b3);
  let peakSeason = 0;
  if (peak === b1) peakSeason = s1;
  if (peak === b2) peakSeason = s2;
  if (peak === b3) peakSeason = s3;
  if (peakSeason === 0 && peak > 0) peakSeason = CURRENT_RL_SEASON;

  const playerId = `player-${username.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}`;
  const currentDate = new Date().toLocaleDateString();

  const playerData = {
      id: playerId, handle: username, team_id: teamId, alias: alias, notes: notes, role: role,
      peak_rating: peak, peak_playlist: "Overall", peak_season: peakSeason,
      duel_1v1_current_mmr: c1, duel_1v1_best_mmr: b1, duel_1v1_best_season: s1,
      doubles_2v2_current_mmr: c2, doubles_2v2_best_mmr: b2, doubles_2v2_best_season: s2,
      standard_3v3_current_mmr: c3, standard_3v3_best_mmr: b3, standard_3v3_best_season: s3,
      tracker_url: trackerUrl, last_updated: currentDate
  };

  const { error } = await supabaseClient.from('players').upsert(playerData);
  if (error) return showToast("Error saving player: " + error.message);

  const historyData = {
      player_id: playerId, recorded_date: currentDate,
      duel_1v1_mmr: c1, doubles_2v2_mmr: c2, standard_3v3_mmr: c3
  };
  await supabaseClient.from('rank_history').insert(historyData);

  showToast(`Player ${username} added successfully!`);
  document.getElementById('addPlayerManualForm').reset();
  document.getElementById('add-player-modal').classList.add('hidden');
  loadData();
}

async function removePlayer(playerId) {
  customConfirm("Remove this player from the database completely? (Tip: You can just edit them to 'Archived' instead)", async () => {
    const { error } = await supabaseClient.from('players').delete().eq('id', playerId);
    if (error) showToast("Error removing player: " + error.message);
    else {
      showToast("Player removed.");
      loadData();
    }
  });
}

function editPlayerModal(playerId) {
  const p = players.find(p => p.id === playerId);
  if (!p) return;
  
  document.getElementById('modal-name').innerText = `✏ Edit ${p.alias || p.handle}`;
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="event.preventDefault(); savePlayerEdit('${p.id}')" style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div>
          <label style="color: var(--text-muted); font-size: 0.85rem;">Alias / Display Name</label>
          <input type="text" id="edit-p-alias" value="${p.alias || ''}" class="modal-input">
        </div>
        <div>
          <label style="color: var(--text-muted); font-size: 0.85rem;">Roster Role</label>
          <select id="edit-p-role" class="modal-input">
            <option value="Starter" ${p.role === 'Starter' || !p.role ? 'selected' : ''}>Starter</option>
            <option value="Sub" ${p.role === 'Sub' ? 'selected' : ''}>Substitute</option>
            <option value="Archived" ${p.role === 'Archived' ? 'selected' : ''}>Archived (Hidden)</option>
          </select>
        </div>
      </div>
      <div>
        <label style="color: var(--text-muted); font-size: 0.85rem;">Scouting Notes</label>
        <input type="text" id="edit-p-notes" value="${p.notes || ''}" class="modal-input">
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
         <div>
           <label style="color: var(--text-muted); font-size: 0.85rem;">3v3 MMR</label>
           <input type="number" id="edit-p-3v3" value="${p.standard_3v3_current_mmr || 0}" class="modal-input">
         </div>
         <div>
           <label style="color: var(--text-muted); font-size: 0.85rem;">2v2 MMR</label>
           <input type="number" id="edit-p-2v2" value="${p.doubles_2v2_current_mmr || 0}" class="modal-input">
         </div>
         <div>
           <label style="color: var(--text-muted); font-size: 0.85rem;">1v1 MMR</label>
           <input type="number" id="edit-p-1v1" value="${p.duel_1v1_current_mmr || 0}" class="modal-input">
         </div>
      </div>
      <div>
        <label style="color: var(--text-muted); font-size: 0.85rem;">Tracker URL</label>
        <input type="text" id="edit-p-tracker" value="${p.tracker_url || ''}" class="modal-input">
      </div>
      <div style="display: flex; gap: 10px; margin-top: 10px;">
         <button type="submit" class="btn" id="edit-p-save" style="flex: 1; background: var(--accent-green);">Save Updates</button>
         <button type="button" class="btn" onclick="openPlayerModal('${p.id}')" style="background: #555;">Cancel</button>
      </div>
    </form>
  `;
}

async function savePlayerEdit(playerId) {
  const p = players.find(p => p.id === playerId);
  if (!p) return;
  document.getElementById('edit-p-save').innerText = 'Saving...';

  const new3v3 = parseInt(document.getElementById('edit-p-3v3').value) || 0;
  const new2v2 = parseInt(document.getElementById('edit-p-2v2').value) || 0;
  const new1v1 = parseInt(document.getElementById('edit-p-1v1').value) || 0;

  let updatedPlayer = { ...p };
  updatedPlayer.alias = document.getElementById('edit-p-alias').value.trim();
  updatedPlayer.notes = document.getElementById('edit-p-notes').value.trim();
  updatedPlayer.role = document.getElementById('edit-p-role').value;
  updatedPlayer.tracker_url = document.getElementById('edit-p-tracker').value.trim();
  
  updatedPlayer.standard_3v3_current_mmr = new3v3;
  if (new3v3 > (updatedPlayer.standard_3v3_best_mmr || 0)) {
      updatedPlayer.standard_3v3_best_mmr = new3v3;
      updatedPlayer.standard_3v3_best_season = CURRENT_RL_SEASON;
  }
  
  updatedPlayer.doubles_2v2_current_mmr = new2v2;
  if (new2v2 > (updatedPlayer.doubles_2v2_best_mmr || 0)) {
      updatedPlayer.doubles_2v2_best_mmr = new2v2;
      updatedPlayer.doubles_2v2_best_season = CURRENT_RL_SEASON;
  }

  updatedPlayer.duel_1v1_current_mmr = new1v1;
  if (new1v1 > (updatedPlayer.duel_1v1_best_mmr || 0)) {
      updatedPlayer.duel_1v1_best_mmr = new1v1;
      updatedPlayer.duel_1v1_best_season = CURRENT_RL_SEASON;
  }

  const newPeak = Math.max(updatedPlayer.duel_1v1_best_mmr, updatedPlayer.doubles_2v2_best_mmr, updatedPlayer.standard_3v3_best_mmr);
  if (newPeak > (updatedPlayer.peak_rating || 0)) {
      updatedPlayer.peak_rating = newPeak;
      updatedPlayer.peak_season = CURRENT_RL_SEASON;
  }
  
  updatedPlayer.last_updated = new Date().toLocaleDateString();

  const { error } = await supabaseClient.from('players').upsert(updatedPlayer);
  if (error) {
      showToast("Error updating player: " + error.message);
      document.getElementById('edit-p-save').innerText = 'Save Updates';
      return;
  }

  const historyData = {
      player_id: playerId, recorded_date: updatedPlayer.last_updated,
      duel_1v1_mmr: new1v1, doubles_2v2_mmr: new2v2, standard_3v3_mmr: new3v3
  };
  await supabaseClient.from('rank_history').insert(historyData);

  showToast(`${updatedPlayer.alias || updatedPlayer.handle} updated.`);
  await loadData();
  openPlayerModal(playerId);
}

// ---------------------------------------------
// RENDER UI & NEW FEATURES
// ---------------------------------------------
function renderAll() {
  const query = document.getElementById("search-input") ? document.getElementById("search-input").value.toLowerCase() : "";
  const sortMode = document.getElementById("sort-select") ? document.getElementById("sort-select").value : "team";
  
  const grid = document.getElementById("teams-grid");
  if (!grid) return;
  grid.innerHTML = "";

  // Hide archived players from the public
  let activePlayers = players;
  if (!isAdmin && !isTeam) {
    activePlayers = players.filter(p => p.role !== 'Archived');
  }

  let filteredPlayers = activePlayers.filter(p => {
    const t = teams.find(team => team.id === p.team_id);
    const teamName = t ? t.name.toLowerCase() : "";
    return (p.alias && p.alias.toLowerCase().includes(query)) || p.handle.toLowerCase().includes(query) || teamName.includes(query);
  });

  // Global Sorting
  if (sortMode !== "team") {
    if (sortMode === "peak") filteredPlayers.sort((a, b) => b.peak_rating - a.peak_rating);
    if (sortMode === "3v3") filteredPlayers.sort((a, b) => b.standard_3v3_current_mmr - a.standard_3v3_current_mmr);
    if (sortMode === "2v2") filteredPlayers.sort((a, b) => b.doubles_2v2_current_mmr - a.doubles_2v2_current_mmr);
    if (sortMode === "1v1") filteredPlayers.sort((a, b) => b.duel_1v1_current_mmr - a.duel_1v1_current_mmr);

    const card = document.createElement("div");
    card.className = "team-section";
    card.innerHTML = `
      <div class="team-header" style="background: linear-gradient(90deg, #4e000280, transparent);">
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
    let teamPlayers = filteredPlayers.filter(p => p.team_id === team.id);
    if (query && teamPlayers.length === 0 && !team.name.toLowerCase().includes(query)) return;

    // SORT PLAYERS: Starter > Sub > Archived, then Rank
    const roleWeight = { "Starter": 1, "Sub": 2, "Archived": 3 };
    teamPlayers.sort((a, b) => {
      const wA = roleWeight[a.role] || 1; 
      const wB = roleWeight[b.role] || 1;
      if (wA !== wB) return wA - wB;

      const tierA = getPlayerHighestCurrentTier(a);
      const tierB = getPlayerHighestCurrentTier(b);
      if (tierA !== tierB) return tierB - tierA;
      return (b.peak_rating || 0) - (a.peak_rating || 0);
    });

    // Calculate Comprehensive Team Averages based ONLY on Starters
    const teamStarters = teamPlayers.filter(p => p.role === 'Starter');
    const getAvg = (arr, key) => {
      const valid = arr.filter(p => p[key] > 0);
      return valid.length ? Math.round(valid.reduce((sum, p) => sum + p[key], 0) / valid.length) : 0;
    };
    const avgPeak = getAvg(teamStarters, 'peak_rating');
    const avg3v3 = getAvg(teamStarters, 'standard_3v3_current_mmr');
    const avg2v2 = getAvg(teamStarters, 'doubles_2v2_current_mmr');
    const avg1v1 = getAvg(teamStarters, 'duel_1v1_current_mmr');
    
    const isOU = team.id === 'ou' || team.name.toLowerCase() === 'university of oklahoma';

    // Match W/L Logic
    const teamMatches = matchLogs.filter(m => m.team_id === team.id);
    const officialMatches = teamMatches.filter(m => m.type === 'Official');
    const scrimMatches = teamMatches.filter(m => m.type === 'Scrim');
    
    const offWins = officialMatches.filter(m => m.result === 'W').length;
    const offLosses = officialMatches.filter(m => m.result === 'L').length;
    let scrimOuGames = 0, scrimOppGames = 0;
    scrimMatches.forEach(m => { scrimOuGames += (m.ou_wins || 0); scrimOppGames += (m.opp_wins || 0); });

    let wlText = "";
    if (offWins > 0 || offLosses > 0 || scrimOuGames > 0 || scrimOppGames > 0) {
      const offStr = (offWins > 0 || offLosses > 0) ? `<span style="color: ${offWins >= offLosses ? 'var(--accent-green)' : 'var(--accent-red-bright)'}">Official: ${offWins}W - ${offLosses}L</span>` : '';
      const scrimStr = (scrimOuGames > 0 || scrimOppGames > 0) ? `<span style="color: var(--text-muted)">Scrim Gs: ${scrimOuGames}W - ${scrimOppGames}L</span>` : '';
      const divider = (offStr && scrimStr) ? ' | ' : '';
      wlText = `<span onclick="openMatchModal('${team.id}')" style="cursor:pointer; font-size: 0.70em; margin-left: 10px; background: rgba(0,0,0,0.3); padding: 3px 10px; border-radius: 12px; vertical-align: middle; white-space: nowrap; transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(0,0,0,0.3)'" title="View Match History">${offStr}${divider}${scrimStr}</span>`;
    }

    const card = document.createElement("div");
    card.className = "team-section";
    card.id = `team-section-${team.id}`;
    if (isOU) card.style.border = "1px solid var(--accent-red)";

    card.innerHTML = `
      <div class="team-header" style="background: linear-gradient(90deg, ${team.theme_color || '#323232'}80, transparent);">
        <div style="display: flex; align-items: center; gap: 15px;">
          <img src="${team.logo}" class="team-logo" alt="${team.name}">
          <div>
            <h3 style="margin: 0; font-size: 1.3em; color: #fff;">${team.name} ${isOU ? '☝️' : ''} ${wlText}</h3>
            <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 0.8rem; color: var(--text-muted); background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 5px;">Avg Peak: <img src="${getRLRankIcon(avgPeak, '3v3')}" style="width: 14px; height: 14px; object-fit: contain;"> <strong style="color:var(--accent-cream);">${avgPeak || 'N/A'}</strong></span>
              <span style="font-size: 0.8rem; color: var(--text-muted); background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 5px;">3v3: <img src="${getRLRankIcon(avg3v3, '3v3')}" style="width: 14px; height: 14px; object-fit: contain;"> <strong style="color:#fff;">${avg3v3 || 'N/A'}</strong></span>
              <span style="font-size: 0.8rem; color: var(--text-muted); background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 5px;">2v2: <img src="${getRLRankIcon(avg2v2, '2v2')}" style="width: 14px; height: 14px; object-fit: contain;"> <strong style="color:#fff;">${avg2v2 || 'N/A'}</strong></span>
              <span style="font-size: 0.8rem; color: var(--text-muted); background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 5px;">1v1: <img src="${getRLRankIcon(avg1v1, '1v1')}" style="width: 14px; height: 14px; object-fit: contain;"> <strong style="color:#fff;">${avg1v1 || 'N/A'}</strong></span>
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${!isOU ? `<button class="icon-btn team-only ${isTeam ? '' : 'hidden'}" onclick="openMatchModal('${team.id}')" title="Match History">⚔️ Log Match</button>` : ''}
          <button class="icon-btn team-only ${isTeam ? '' : 'hidden'}" onclick="openAddPlayerModal('${team.id}')" style="background:var(--accent-green); color:#000; font-weight:bold;" title="Add Player">➕ Add Player</button>
          <button class="icon-btn" onclick="copyTeamStats('${team.id}')" title="Copy Team Stats">📋 Copy Stats</button>
          <button class="icon-btn" onclick="copyTeamLink('${team.name}')" title="Copy Direct Link to Team">🔗 Copy Link</button>
          <div class="admin-only ${isAdmin ? '' : 'hidden'}" style="display:inline-block;">
            <button class="icon-btn" onclick="openEditTeamModal('${team.id}')" style="background:var(--accent-blue); color:#000;" title="Edit Team">✏️</button>
            ${!isOU ? `<button class="icon-btn" onclick="deleteTeam('${team.id}')" style="background:var(--accent-red-bright); color:#000;" title="Delete Team">🗑️</button>` : ''}
          </div>
        </div>
      </div>
      <div class="player-list">
        ${teamPlayers.map(p => generatePlayerRowHTML(p)).join('') || '<div class="notes" style="padding:15px; color:var(--text-muted);">No players listed.</div>'}
      </div>
    `;
    grid.appendChild(card);
  });

  generateAZScroller(sortedTeams);
  renderRecentMatches();
}

function generatePlayerRowHTML(p) {
  const displayAlias = p.alias ? p.alias : p.handle;
  const currentRankIcon = getPlayerHighestCurrentIcon(p);
  const peakIcon = getRLRankIcon(p.peak_rating, '3v3'); 
  
  let roleBadge = '';
  if (p.role === 'Starter') roleBadge = `<span class="role-badge role-starter">Starter</span>`;
  else if (p.role === 'Sub') roleBadge = `<span class="role-badge role-sub">Sub</span>`;
  else if (p.role === 'Archived') roleBadge = `<span class="role-badge role-archived">Archived</span>`;

  return `
    <div class="player-row" onclick="openPlayerModal('${p.id}')" style="${p.role === 'Archived' ? 'opacity: 0.5;' : ''}">
      <div class="player-identity">
        <img src="${currentRankIcon}" class="rank-icon" title="Highest Current Rank">
        <div class="player-name-block">
          <div style="display: flex; align-items: center;">
            <span class="player-alias">${displayAlias}</span>
            ${roleBadge}
            ${p.tracker_url ? `<a href="${p.tracker_url}" target="_blank" class="icon-btn mobile-link" style="text-decoration:none;" title="View Tracker" onclick="event.stopPropagation()">🔗</a>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="player-handle">${p.handle}</span>
            ${p.last_updated ? `<span style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.7;" title="Last MMR Update">⏱️ ${p.last_updated}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="stat-block">
        <span class="stat-label">Peak</span>
        <span class="stat-value stat-peak">
          <img src="${peakIcon}" class="micro-icon">
          ${p.peak_rating || 'N/A'}
        </span>
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
        ${p.tracker_url ? `<a href="${p.tracker_url}" target="_blank" class="icon-btn desktop-link" style="text-decoration:none;">🔗</a>` : ''}
        <button class="${isAdmin ? '' : 'hidden'} admin-only icon-btn" style="background:var(--accent-red-bright); color:#000;" title="Delete Player" onclick="removePlayer('${p.id}')">🗑</button>
      </div>
    </div>
  `;
}

function openPlayerModal(playerId) {
  const p = players.find(p => p.id === playerId);
  if (!p) return;
  document.getElementById('modal-name').innerText = p.alias || p.handle;
  const editButtonHTML = isTeam ? `<button onclick="editPlayerModal('${p.id}')" class="btn team-only" style="margin-top: 15px; width: 100%; background: var(--accent-blue); color: #000;">✏️ Edit Player Stats</button>` : '';

  document.getElementById('modal-body').innerHTML = `
    <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px;">
      <img src="${getRLRankIcon(p.peak_rating, '3v3')}" style="width: 80px; height: 80px; filter: drop-shadow(0 0 10px rgba(190,180,165,0.5));">
      <div>
        <h3 style="color: var(--accent-cream); margin:0;">Peak MMR: ${p.peak_rating || 'N/A'} ${p.peak_season ? `(S${p.peak_season})` : ''}</h3>
        ${p.last_updated ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">⏱️ Last Verified: ${p.last_updated}</div>` : ''}
        <p style="color: var(--text-muted); font-size: 0.9em; margin-top:5px;">${p.notes ? `📝 ${p.notes}` : 'No scouting notes available.'}</p>
      </div>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
       <div class="form-box">
          <strong style="display:flex; align-items:center; gap:5px;">
            <img src="${getRLRankIcon(p.standard_3v3_current_mmr, '3v3')}" class="micro-icon"> 3v3 Current: ${p.standard_3v3_current_mmr || 0}
          </strong>
          <em style="color:var(--text-muted); display:flex; align-items:center; gap:5px; margin-top:6px;">
            <img src="${getRLRankIcon(p.standard_3v3_best_mmr, '3v3')}" class="micro-icon"> Best: ${p.standard_3v3_best_mmr || 'N/A'}
          </em>
       </div>
       <div class="form-box">
          <strong style="display:flex; align-items:center; gap:5px;">
            <img src="${getRLRankIcon(p.doubles_2v2_current_mmr, '2v2')}" class="micro-icon"> 2v2 Current: ${p.doubles_2v2_current_mmr || 0}
          </strong>
          <em style="color:var(--text-muted); display:flex; align-items:center; gap:5px; margin-top:6px;">
            <img src="${getRLRankIcon(p.doubles_2v2_best_mmr, '2v2')}" class="micro-icon"> Best: ${p.doubles_2v2_best_mmr || 'N/A'}
          </em>
       </div>
       <div class="form-box" style="grid-column: span 2;">
          <strong style="display:flex; align-items:center; gap:5px;">
            <img src="${getRLRankIcon(p.duel_1v1_current_mmr, '1v1')}" class="micro-icon"> 1v1 Current: ${p.duel_1v1_current_mmr || 0}
          </strong>
          <em style="color:var(--text-muted); display:flex; align-items:center; gap:5px; margin-top:6px;">
            <img src="${getRLRankIcon(p.duel_1v1_best_mmr, '1v1')}" class="micro-icon"> Best: ${p.duel_1v1_best_mmr || 'N/A'}
          </em>
       </div>
    </div>
    ${editButtonHTML}
  `;
  document.getElementById('player-modal').classList.remove('hidden');
}

// ---------------------------------------------
// RECENT MATCHES & FAN MODAL
// ---------------------------------------------
function renderRecentMatches() {
  const container = document.getElementById('recent-matches-container');
  const grid = document.getElementById('recent-matches-grid');
  if (!container || !grid) return;

  const sortedMatches = [...matchLogs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
  if (sortedMatches.length === 0) {
      container.style.display = 'none';
      return;
  }

  container.style.display = 'block';
  grid.innerHTML = sortedMatches.map(m => {
      const oppTeam = teams.find(t => t.id === m.team_id);
      const oppName = oppTeam ? oppTeam.name : 'Unknown Team';
      const oppLogo = oppTeam ? oppTeam.logo : 'https://ui-avatars.com/api/?name=?&background=1a1a1a&color=fff';
      const isWin = m.result === 'W';
      const resultColor = isWin ? 'var(--accent-green)' : 'var(--accent-red-bright)';
      const displayType = m.league ? m.league : (m.type === 'Scrim' ? 'SCRIMS' : 'OFFICIAL');
      
      // Pass the hyphenated name for cleaner URLs
      const formattedOppName = oppName.replace(/\s+/g, '-');
      
      return `
          <div class="recent-card" onclick="openMatchDetails('${m.id}')" title="Click to view details">
              <img src="${oppLogo}" onclick="event.stopPropagation(); window.location.href='?team=${encodeURIComponent(formattedOppName)}';" style="width: 42px; height: 42px; object-fit: contain; background: rgba(0,0,0,0.3); border-radius: 6px; padding: 4px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="Jump to ${oppName} Roster">
              <div style="flex: 1; overflow: hidden;">
                  <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">${m.date} • ${displayType}</div>
                  <div style="font-weight: 700; font-size: 1rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">vs ${oppName}</div>
              </div>
              <div style="text-align: right; line-height: 1.1;">
                  <div style="font-weight: 900; font-size: 1.2rem; color: ${resultColor};">${m.result}</div>
                  <div style="font-size: 0.85rem; font-weight: bold; color: #fff;">${m.ou_wins}-${m.opp_wins}</div>
              </div>
          </div>
      `;
  }).join('');
}

function openMatchDetails(matchId) {
  const m = matchLogs.find(x => String(x.id) === String(matchId));
  if (!m) return;
  const oppTeam = teams.find(t => t.id === m.team_id);
  const oppName = oppTeam ? oppTeam.name : 'Unknown Team';
  
  const displayType = m.league ? m.league : (m.type === 'Scrim' ? 'Scrim' : 'Official Match');
  let html = `<img src="${oppTeam ? oppTeam.logo : ''}" style="width: 60px; height: 60px; object-fit:contain; margin-bottom: 10px; background:rgba(0,0,0,0.3); padding:5px; border-radius:8px;">`;
  html += `<h3 style="color:var(--text-primary); margin:0;">OU vs ${oppName}</h3>`;
  html += `<p style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">${m.date} • ${displayType}</p>`;
  html += `<h2 style="color:${m.result==='W'?'var(--accent-green)':'var(--accent-red-bright)'}; font-size: 2rem; margin: 10px 0;">${m.result} ${m.ou_wins} - ${m.opp_wins}</h2>`;
  
  if (m.game_details && m.game_details.length > 0) {
      html += `<div style="margin-top: 15px; text-align: left; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">`;
      m.game_details.forEach(g => {
          const gColor = g.ou > g.opp ? 'var(--accent-green)' : 'var(--accent-red-bright)';
          html += `<div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding: 6px 0;">
              <span style="color:var(--text-muted); font-weight:bold;">Game ${g.game}</span>
              <span style="color:${gColor}; font-weight:900;">${g.ou} - ${g.opp}</span>
          </div>`;
      });
      html += `</div>`;
  } else {
      html += `<p style="margin-top:20px; color:var(--text-muted); font-style:italic;">No individual game scores available for this match.</p>`;
  }
  
  document.getElementById('details-modal-body').innerHTML = html;
  document.getElementById('match-details-modal').classList.remove('hidden');
}

function generateAZScroller(sortedTeams) {
  let scroller = document.getElementById('az-scroller');
  if (!scroller) {
    scroller = document.createElement('div');
    scroller.id = 'az-scroller';
    scroller.className = 'az-scroller';
    document.body.appendChild(scroller);
  }
  scroller.innerHTML = '';
  const letters = [...new Set(sortedTeams.map(t => t.name.charAt(0).toUpperCase()))].sort();
  letters.forEach(letter => {
    const span = document.createElement('span');
    span.innerText = letter;
    span.onclick = () => {
      const target = Array.from(document.querySelectorAll('.team-section h3')).find(h => h.innerText.startsWith(letter));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    scroller.appendChild(span);
  });
}

// ---------------------------------------------
// MATCH LOGGING / AUTOCOMPLETE
// ---------------------------------------------
function resetMatchForm() {
  document.getElementById('addMatchForm').reset();
  document.getElementById('match-log-id').value = '';
  
  // Create correct YYYY-MM-DD local timezone string
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('match-date').value = `${yyyy}-${mm}-${dd}`;

  document.getElementById('match-type').value = 'Official';
  document.getElementById('match-form-title').innerText = '⚔️ Log New Match';
  document.getElementById('match-submit-btn').innerText = 'Save Match Log';
  document.getElementById('match-cancel-btn').classList.add('hidden');
  document.getElementById('game-details-container').classList.add('hidden');
  document.getElementById('game-inputs-list').innerHTML = '';
}

function toggleGameDetails() {
  const container = document.getElementById('game-details-container');
  container.classList.toggle('hidden');
  if (!container.classList.contains('hidden') && document.getElementById('game-inputs-list').children.length === 0) {
    generateGameInputs();
  }
}

function generateGameInputs() {
  const ouWins = parseInt(document.getElementById('match-ou-wins').value) || 0;
  const oppWins = parseInt(document.getElementById('match-opp-wins').value) || 0;
  let totalGames = ouWins + oppWins;
  if (totalGames === 0) totalGames = 3; 
  const list = document.getElementById('game-inputs-list');
  list.innerHTML = '';
  for (let i = 0; i < totalGames; i++) addGameInputRow();
}

function addGameInputRow(ouScore = '', oppScore = '') {
  const list = document.getElementById('game-inputs-list');
  const gameIndex = list.children.length + 1;
  const row = document.createElement('div');
  row.className = 'game-score-row';
  row.style = "display: flex; align-items: center; gap: 10px;";
  row.innerHTML = `
    <span style="color: var(--text-muted); font-size: 0.85rem; width: 55px;">Game <span class="g-num">${gameIndex}</span></span>
    <input type="number" class="g-ou" placeholder="OU" value="${ouScore}" style="width: 60px; padding: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); color: #fff; text-align: center; border-radius: 4px;">
    <span style="color: var(--text-muted);">-</span>
    <input type="number" class="g-opp" placeholder="OPP" value="${oppScore}" style="width: 60px; padding: 4px; background: var(--bg-primary); border: 1px solid var(--border-color); color: #fff; text-align: center; border-radius: 4px;">
    <button type="button" onclick="this.parentElement.remove(); renumberGames();" style="background: transparent; color: var(--accent-red-bright); padding: 0 5px; font-size: 1.1rem; border: none; cursor: pointer;">&times;</button>
  `;
  list.appendChild(row);
}

function renumberGames() {
  const rows = document.querySelectorAll('.game-score-row .g-num');
  rows.forEach((el, idx) => el.innerText = idx + 1);
}

function openMatchModal(teamId) {
  const team = teams.find(t => t.id === teamId);
  document.getElementById('match-modal-title').innerText = `${team.name} - Match History`;
  document.getElementById('match-team-id').value = teamId;
  resetMatchForm();

  const list = document.getElementById('match-history-list');
  const teamMatches = matchLogs.filter(m => m.team_id === teamId).sort((a,b) => new Date(b.date) - new Date(a.date));
  
  if (teamMatches.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted); font-size:0.9em; text-align:center;">No matches logged yet.</p>';
  } else {
    list.innerHTML = teamMatches.map(m => {
      let gamesHtml = '';
      if (m.game_details && m.game_details.length > 0) {
        gamesHtml = `<div style="display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap;">` + 
        m.game_details.map(g => `<span style="font-size: 0.7rem; background: rgba(0,0,0,0.3); padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05); color: ${g.ou > g.opp ? 'var(--accent-green)' : (g.opp > g.ou ? 'var(--accent-red-bright)' : 'var(--text-muted)')};">G${g.game}: ${g.ou}-${g.opp}</span>`).join('') + `</div>`;
      }
      return `
        <div style="display:flex; justify-content:space-between; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.15); border-radius: 6px; margin-bottom: 8px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong style="font-size: 1.1rem; color: ${m.result==='W' ? 'var(--accent-green)' : 'var(--accent-red-bright)'}">${m.result}</strong>
              <span style="font-weight:bold; font-size:1.1rem; color: #fff;">${m.ou_wins || 0} - ${m.opp_wins || 0}</span>
            </div>
            <span style="color:var(--text-muted); font-size:0.8em;">${m.date}</span> | <span style="font-size:0.8em; color: var(--text-muted);">${m.type} ${m.league ? `<span style="color:var(--accent-blue)">- ${m.league}</span>` : ''}</span>
            ${gamesHtml}
          </div>
          <div class="team-only ${isTeam ? '' : 'hidden'}" style="display: flex; flex-direction: column; justify-content: flex-start; gap: 5px;">
            <button onclick="editMatchLog('${m.id}')" style="background:transparent; color:var(--accent-cream); border:none; cursor:pointer; font-size: 1.1rem;" title="Edit Log">✏️</button>
            <button onclick="deleteMatchLog('${m.id}')" style="background:transparent; color:var(--accent-red-bright); border:none; cursor:pointer; font-size: 1.1rem;" title="Delete Log">🗑️</button>
          </div>
        </div>
      `
    }).join('');
  }
  document.getElementById('match-modal').classList.remove('hidden');
}

function editMatchLog(matchId) {
  const match = matchLogs.find(m => String(m.id) === String(matchId));
  if (!match) return;
  document.getElementById('match-log-id').value = match.id;
  document.getElementById('match-date').value = match.date;
  document.getElementById('match-type').value = match.type;
  document.getElementById('match-league').value = match.league || '';
  document.getElementById('match-ou-wins').value = match.ou_wins || 0;
  document.getElementById('match-opp-wins').value = match.opp_wins || 0;
  document.getElementById('match-form-title').innerText = '✏️ Edit Match Log';
  document.getElementById('match-submit-btn').innerText = 'Update Match';
  document.getElementById('match-cancel-btn').classList.remove('hidden');
  document.getElementById('game-inputs-list').innerHTML = '';
  
  if (match.game_details && match.game_details.length > 0) {
    document.getElementById('game-details-container').classList.remove('hidden');
    match.game_details.forEach(g => addGameInputRow(g.ou, g.opp));
  } else {
    document.getElementById('game-details-container').classList.add('hidden');
  }
}

async function saveMatchLog(e) {
  e.preventDefault();
  const teamId = document.getElementById('match-team-id').value;
  const matchLogId = document.getElementById('match-log-id').value;
  let gameDetails = null;
  const container = document.getElementById('game-details-container');
  if (!container.classList.contains('hidden')) {
    const rows = document.querySelectorAll('.game-score-row');
    if (rows.length > 0) {
      gameDetails = [];
      rows.forEach((row, idx) => {
        const ou = row.querySelector('.g-ou').value;
        const opp = row.querySelector('.g-opp').value;
        if (ou !== '' && opp !== '') {
          gameDetails.push({ game: idx + 1, ou: parseInt(ou), opp: parseInt(opp) });
        }
      });
    }
  }

  const ouWins = parseInt(document.getElementById('match-ou-wins').value) || 0;
  const oppWins = parseInt(document.getElementById('match-opp-wins').value) || 0;
  let calculatedResult = 'T';
  if (ouWins > oppWins) calculatedResult = 'W';
  if (ouWins < oppWins) calculatedResult = 'L';

  const matchData = {
    team_id: teamId, date: document.getElementById('match-date').value,
    type: document.getElementById('match-type').value, league: document.getElementById('match-league').value,
    result: calculatedResult, ou_wins: ouWins, opp_wins: oppWins, game_details: gameDetails
  };

  if (matchLogId) {
    const { error } = await supabaseClient.from('match_logs').update(matchData).eq('id', matchLogId);
    if (error) return showToast("Error updating match: " + error.message);
    showToast("Match log updated.");
  } else {
    const { error } = await supabaseClient.from('match_logs').insert([matchData]);
    if (error) return showToast("Error saving match: " + error.message);
    showToast("Match successfully logged!");
  }
  resetMatchForm();
  await loadData();
  openMatchModal(teamId);
}

function closeMatchModal(e) {
  if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('close-btn')) {
    document.getElementById('match-modal').classList.add('hidden');
  }
}

async function deleteMatchLog(matchId) {
  customConfirm("Permanently delete this match log?", async () => {
    const { error } = await supabaseClient.from('match_logs').delete().eq('id', matchId);
    if (error) showToast("Error deleting match: " + error.message);
    else {
      showToast("Match log deleted.");
      await loadData();
      const teamId = document.getElementById('match-team-id').value;
      openMatchModal(teamId);
    }
  });
}

function setupLeagueAutocomplete() {
  const inp = document.getElementById("match-league");
  const listContainer = document.getElementById("league-autocomplete-list");
  let currentFocus = -1;
  
  // Show all previous options when clicked/focused
  inp.addEventListener("focus", function() {
      const val = this.value;
      listContainer.innerHTML = '';
      
      const uniqueLeagues = [...new Set(matchLogs.map(m => m.league).filter(l => l && l.trim() !== ''))];
      const matches = val ? uniqueLeagues.filter(l => l.toLowerCase().includes(val.toLowerCase())) : uniqueLeagues;
      
      if (matches.length === 0) { listContainer.classList.add('hidden'); return; }
      
      listContainer.classList.remove('hidden');
      matches.forEach(match => {
          const div = document.createElement("div");
          div.innerHTML = match;
          div.onclick = function() {
              inp.value = match;
              listContainer.classList.add('hidden');
          };
          listContainer.appendChild(div);
      });
  });

  // Filter options while typing
  inp.addEventListener("input", function() {
      const val = this.value;
      listContainer.innerHTML = '';
      
      const uniqueLeagues = [...new Set(matchLogs.map(m => m.league).filter(l => l && l.trim() !== ''))];
      const matches = val ? uniqueLeagues.filter(l => l.toLowerCase().includes(val.toLowerCase())) : uniqueLeagues;
      
      if (matches.length === 0) { listContainer.classList.add('hidden'); return; }
      
      listContainer.classList.remove('hidden');
      matches.forEach(match => {
          const div = document.createElement("div");
          div.innerHTML = match;
          div.onclick = function() {
              inp.value = match;
              listContainer.classList.add('hidden');
          };
          listContainer.appendChild(div);
      });
  });
  
  inp.addEventListener("keydown", function(e) {
      let items = listContainer.getElementsByTagName("div");
      if (e.keyCode === 40) { currentFocus++; addActive(items); } // Down
      else if (e.keyCode === 38) { currentFocus--; addActive(items); } // Up
      else if (e.keyCode === 13) { 
        if (listContainer.classList.contains('hidden') === false) {
          e.preventDefault(); 
          if (currentFocus > -1 && items[currentFocus]) items[currentFocus].click(); 
        }
      } // Enter
  });
  
  function addActive(items) {
      if (!items) return;
      for (let i = 0; i < items.length; i++) items[i].classList.remove("autocomplete-active");
      if (currentFocus >= items.length) currentFocus = 0;
      if (currentFocus < 0) currentFocus = items.length - 1;
      items[currentFocus].classList.add("autocomplete-active");
  }
  
  document.addEventListener("click", function(e) {
      if (e.target !== inp) listContainer.classList.add('hidden');
  });
}

// ---------------------------------------------
// RANK TIERS & UTILS
// ---------------------------------------------
function getRankTier(mmr, mode = '3v3') {
  if (!mmr || mmr <= 0) return 0;
  let ssl, gc3, gc2, gc1, c3, c2, c1, d1, p1, g1, s1;
  if (mode === '1v1') { ssl=1355; gc3=1296; gc2=1236; gc1=1176; c3=1115; c2=1055; c1=995; d1=815; p1=635; g1=440; s1=275; }
  else if (mode === '2v2') { ssl=1875; gc3=1707; gc2=1576; gc1=1435; c3=1315; c2=1196; c1=1075; d1=835; p1=655; g1=475; s1=296; }
  else { ssl=1860; gc3=1715; gc2=1576; gc1=1436; c3=1315; c2=1195; c1=1076; d1=835; p1=655; g1=475; s1=296; }
  if (mmr >= ssl) return 22; if (mmr >= gc3) return 21; if (mmr >= gc2) return 20; if (mmr >= gc1) return 19;
  if (mmr >= c3) return 18; if (mmr >= c2) return 17; if (mmr >= c1) return 16; if (mmr >= d1) return 13;
  if (mmr >= p1) return 10; if (mmr >= g1) return 7; if (mmr >= s1) return 4; return 1;
}

function getPlayerHighestCurrentTier(p) {
  return Math.max(getRankTier(p.duel_1v1_current_mmr, '1v1'), getRankTier(p.doubles_2v2_current_mmr, '2v2'), getRankTier(p.standard_3v3_current_mmr, '3v3'));
}

function getPlayerHighestCurrentIcon(p) {
  const modes = [
    { tier: getRankTier(p.duel_1v1_current_mmr, '1v1'), icon: getRLRankIcon(p.duel_1v1_current_mmr, '1v1') },
    { tier: getRankTier(p.doubles_2v2_current_mmr, '2v2'), icon: getRLRankIcon(p.doubles_2v2_current_mmr, '2v2') },
    { tier: getRankTier(p.standard_3v3_current_mmr, '3v3'), icon: getRLRankIcon(p.standard_3v3_current_mmr, '3v3') }
  ];
  return modes.reduce((max, current) => current.tier > max.tier ? current : max).icon;
}

function getRLRankIcon(mmr, mode = '3v3') {
  const baseUrl = 'https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/';
  if (!mmr || mmr <= 0) return baseUrl + 's4-0.png';
  let ssl, gc3, gc2, gc1, c3, c2, c1, d1, p1, g1, s1;
  if (mode === '1v1') { ssl=1355; gc3=1296; gc2=1236; gc1=1176; c3=1115; c2=1055; c1=995; d1=815; p1=635; g1=440; s1=275; }
  else if (mode === '2v2') { ssl=1875; gc3=1707; gc2=1576; gc1=1435; c3=1315; c2=1196; c1=1075; d1=835; p1=655; g1=475; s1=296; }
  else { ssl=1860; gc3=1715; gc2=1576; gc1=1436; c3=1315; c2=1195; c1=1076; d1=835; p1=655; g1=475; s1=296; }
  if (mmr >= ssl) return baseUrl + 's15rank22.png'; if (mmr >= gc3) return baseUrl + 's15rank21.png';
  if (mmr >= gc2) return baseUrl + 's15rank20.png'; if (mmr >= gc1) return baseUrl + 's15rank19.png';
  if (mmr >= c3) return baseUrl + 's4-18.png'; if (mmr >= c2) return baseUrl + 's4-17.png'; if (mmr >= c1) return baseUrl + 's4-16.png';
  if (mmr >= d1) return baseUrl + 's4-15.png'; if (mmr >= p1) return baseUrl + 's4-12.png'; if (mmr >= g1) return baseUrl + 's4-9.png';
  if (mmr >= s1) return baseUrl + 's4-6.png'; return baseUrl + 's4-3.png';
}

function closeModal(e, modalId) {
  if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('close-btn')) {
    document.getElementById(modalId).classList.add('hidden');
  }
}

// Window Exports
window.toggleAuthModal = toggleAuthModal;
window.loginAdmin = loginAdmin;
window.logoutAdmin = logoutAdmin;
window.saveTeam = saveTeam;
window.deleteTeam = deleteTeam;
window.addPlayerManualSubmit = addPlayerManualSubmit;
window.removePlayer = removePlayer;
window.openPlayerModal = openPlayerModal;
window.openAddPlayerModal = openAddPlayerModal;
window.closeModal = closeModal;
window.copyTeamStats = copyTeamStats;
window.copyTeamLink = copyTeamLink;
window.closeMatchModal = closeMatchModal;
window.saveMatchLog = saveMatchLog;
window.deleteMatchLog = deleteMatchLog;
window.editMatchLog = editMatchLog;
window.resetMatchForm = resetMatchForm;
window.toggleGameDetails = toggleGameDetails;
window.generateGameInputs = generateGameInputs;
window.addGameInputRow = addGameInputRow;
window.editPlayerModal = editPlayerModal;
window.savePlayerEdit = savePlayerEdit;
window.openEditTeamModal = openEditTeamModal;
window.saveTeamEdit = saveTeamEdit;
window.openMatchModal = openMatchModal;
window.openMatchDetails = openMatchDetails;

document.addEventListener("DOMContentLoaded", () => {
  loadData();
});
