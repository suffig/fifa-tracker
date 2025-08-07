import { POSITIONEN, savePlayer as dataSavePlayer, deletePlayer as dataDeletePlayer } from './data.js';
import { showModal, hideModal } from './modal.js';
import { supabaseDb, supabase } from './supabaseClient.js';
import { isDatabaseAvailable } from './connectionMonitor.js';

let aekAthen = [];
let realMadrid = [];
let ehemalige = [];
let finances = {
    aekAthen: { balance: 0 },
    realMadrid: { balance: 0 }
};
let transactions = [];

const POSITION_ORDER = {
    "TH": 0, "IV": 1, "LV": 2, "RV": 3, "ZDM": 4, "ZM": 5,
    "ZOM": 6, "LM": 7, "RM": 8, "LF": 9, "RF": 10, "ST": 11
};

async function loadPlayersAndFinances(renderFn = renderPlayerLists) {
    try {
        // Show loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Lade Daten...</div>';
        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.appendChild(loadingDiv);

        // Use enhanced database operations with retry logic
        const [playersResult, finResult, transResult] = await Promise.allSettled([
            supabaseDb.select('players', '*'),
            supabaseDb.select('finances', '*'),
            supabaseDb.select('transactions', '*', { 
                order: { column: 'id', ascending: false } 
            })
        ]);

        // Handle players data
        if (playersResult.status === 'fulfilled' && playersResult.value.data) {
            const players = playersResult.value.data;
            aekAthen = players.filter(p => p.team === "AEK");
            realMadrid = players.filter(p => p.team === "Real");
            ehemalige = players.filter(p => p.team === "Ehemalige");
        } else {
            console.warn('Failed to load players:', playersResult.reason);
            // Keep existing data if available
        }

        // Handle finances data
        if (finResult.status === 'fulfilled' && finResult.value.data) {
            const finData = finResult.value.data;
            finances = {
                aekAthen: finData.find(f => f.team === "AEK") || { balance: 0 },
                realMadrid: finData.find(f => f.team === "Real") || { balance: 0 }
            };
        } else {
            console.warn('Failed to load finances:', finResult.reason);
        }

        // Handle transactions data
        if (transResult.status === 'fulfilled' && transResult.value.data) {
            transactions = transResult.value.data;
        } else {
            console.warn('Failed to load transactions:', transResult.reason);
        }

        // Remove loading indicator
        if (loadingDiv.parentNode) {
            loadingDiv.parentNode.removeChild(loadingDiv);
        }

        renderFn();
    } catch (error) {
        console.error('Error loading data:', error);
        
        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <strong>Fehler beim Laden der Daten.</strong> 
                ${isDatabaseAvailable() ? 'Bitte versuchen Sie es erneut.' : 'Keine Datenbankverbindung.'}
                <button onclick="this.parentElement.remove()" class="float-right font-bold">×</button>
            </div>
        `;
        const appDiv = document.getElementById('app');
        if (appDiv) appDiv.insertBefore(errorDiv, appDiv.firstChild);
        
        // Still render with existing data
        renderFn();
    }
}

async function savePlayer(player) {
    try {
        await dataSavePlayer(player);
    } catch (error) {
        alert(error.message);
        throw error;
    }
}

async function deletePlayerDb(id) {
    try {
        await dataDeletePlayer(id);
    } catch (error) {
        alert(error.message);
        throw error;
    }
}

async function movePlayerWithTransaction(id, newTeam) {
    let all = [...aekAthen, ...realMadrid, ...ehemalige];
    const player = all.find(p => p.id === id);
    if (!player) return;

    const oldTeam = player.team;
    const value = typeof player.value === "number" ? player.value : parseFloat(player.value) || 0;
    const abloese = value * 1000000;
    const now = new Date().toISOString().slice(0, 10);

    // Von TEAM zu Ehemalige: VERKAUF
    if ((oldTeam === "AEK" || oldTeam === "Real") && newTeam === "Ehemalige") {
        await supabase.from('transactions').insert([{
            date: now,
            type: "Spielerverkauf",
            team: oldTeam,
            amount: abloese,
            info: `Verkauf von ${player.name} (${player.position})`
        }]);
        let finKey = oldTeam === "AEK" ? "aekAthen" : "realMadrid";
        await supabase.from('finances').update({
            balance: (finances[finKey].balance || 0) + abloese
        }).eq('team', oldTeam);
        await movePlayerToTeam(id, newTeam);
        return;
    }

    // Von Ehemalige zu TEAM: KAUF
    if (oldTeam === "Ehemalige" && (newTeam === "AEK" || newTeam === "Real")) {
        let finKey = newTeam === "AEK" ? "aekAthen" : "realMadrid";
        const konto = finances[finKey].balance || 0;
        if (konto < abloese) {
            alert("Kontostand zu gering für diesen Transfer!");
            return;
        }
        await supabase.from('transactions').insert([{
            date: now,
            type: "Spielerkauf",
            team: newTeam,
            amount: -abloese,
            info: `Kauf von ${player.name} (${player.position})`
        }]);
        await supabase.from('finances').update({
            balance: konto - abloese
        }).eq('team', newTeam);
        await movePlayerToTeam(id, newTeam);
        return;
    }

    // Innerhalb Teams oder Ehemalige zu Ehemalige: Nur Move
    await movePlayerToTeam(id, newTeam);
}

async function movePlayerToTeam(id, newTeam) {
    const { error } = await supabase.from('players').update({ team: newTeam }).eq('id', id);
    if (error) alert('Fehler beim Verschieben: ' + error.message);
}

async function saveTransactionAndFinance(team, type, amount, info = "") {
    const now = new Date().toISOString().slice(0, 10);
    await supabase.from('transactions').insert([{ date: now, type, team, amount, info }]);
    const finKey = team === "AEK" ? "aekAthen" : "realMadrid";
    let updateObj = {};
    updateObj.balance = (finances[finKey].balance || 0) + amount;
    await supabase.from('finances').update(updateObj).eq('team', team);
}

function getKaderMarktwert(arr) {
    return arr.reduce((sum, p) => {
        let v = (typeof p.value === "number" ? p.value : (p.value ? parseFloat(p.value) : 0));
        return sum + v;
    }, 0);
}

export function renderKaderTab(containerId = "app") {
    const app = document.getElementById(containerId);
    loadPlayersAndFinances(renderPlayerLists);

    app.innerHTML = `
        <div class="space-y-4 pb-4">
            <!-- Mobile-optimized header -->
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Kader Management</h2>
                <div class="flex flex-wrap gap-2">
                    <button id="add-player-aek" class="touch-target bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition shadow">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                        </svg>
                        AEK Spieler
                    </button>
                    <button id="add-player-real" class="touch-target bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition shadow">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                        </svg>
                        Real Spieler
                    </button>
                </div>
            </div>
            
            <!-- Mobile-first team layout -->
            <div class="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                <!-- AEK Team -->
                <div class="mobile-card bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-blue-700 dark:text-blue-200 text-lg flex items-center">
                            <span class="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                            AEK Athen
                        </h3>
                        <div class="text-xs text-blue-600 dark:text-blue-300 font-medium">
                            <span id="aek-marktwert">${getKaderMarktwert(aekAthen).toLocaleString('de-DE')}M €</span>
                        </div>
                    </div>
                    <div id="team-a-players" class="space-y-2"></div>
                </div>
                
                <!-- Real Team -->
                <div class="mobile-card bg-red-50 dark:bg-red-900 border-l-4 border-red-500">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-red-700 dark:text-red-200 text-lg flex items-center">
                            <span class="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                            Real Madrid
                        </h3>
                        <div class="text-xs text-red-600 dark:text-red-300 font-medium">
                            <span id="real-marktwert">${getKaderMarktwert(realMadrid).toLocaleString('de-DE')}M €</span>
                        </div>
                    </div>
                    <div id="team-b-players" class="space-y-2"></div>
                </div>
            </div>
            
            <!-- Ehemalige Section -->
            <div class="mobile-card bg-gray-50 dark:bg-gray-700 border-l-4 border-gray-400">
                <h3 class="font-semibold text-gray-700 dark:text-gray-200 text-lg mb-3 flex items-center">
                    <span class="w-3 h-3 bg-gray-400 rounded-full mr-2"></span>
                    Ehemalige Spieler
                </h3>
                <div id="ehemalige-players" class="space-y-2"></div>
            </div>
        </div>
    `;
    document.getElementById("add-player-aek").onclick = () => openPlayerForm('AEK');
    document.getElementById("add-player-real").onclick = () => openPlayerForm('Real');
}

function renderPlayerLists() {
    renderPlayerList("team-a-players", aekAthen, "AEK");
    renderPlayerList("team-b-players", realMadrid, "Real");
    renderEhemaligeList();
    const aekMarktwertSpan = document.getElementById("aek-marktwert");
    const realMarktwertSpan = document.getElementById("real-marktwert");
    if (aekMarktwertSpan) aekMarktwertSpan.innerText = getKaderMarktwert(aekAthen).toLocaleString('de-DE') + "M €";
    if (realMarktwertSpan) realMarktwertSpan.innerText = getKaderMarktwert(realMadrid).toLocaleString('de-DE') + "M €";
}

function renderPlayerList(containerId, arr, team) {
    const c = document.getElementById(containerId);
    if (!c) return;
    arr = arr.slice().sort((a, b) => {
        const posA = POSITION_ORDER[a.position] ?? 99;
        const posB = POSITION_ORDER[b.position] ?? 99;
        return posA - posB;
    });
    c.innerHTML = "";
    arr.forEach(player => {
        const marktwert = typeof player.value === 'number'
            ? player.value
            : (player.value ? parseFloat(player.value) : 0);

        // Mobile-optimized player card layout
        const d = document.createElement("div");
        d.className = "mobile-card bg-white dark:bg-gray-800 border dark:border-gray-700 hover:shadow-md transition-all";

        d.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
                <div class="flex items-center mb-1">
                    <span class="inline-flex items-center justify-center w-8 h-8 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 rounded-full mr-3">
                        ${player.position}
                    </span>
                    <span class="font-semibold text-gray-900 dark:text-white truncate">${player.name}</span>
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400 font-medium">${marktwert}M €</div>
            </div>
            <div class="flex items-center space-x-2 ml-3">
                <button class="edit-btn touch-target bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 p-2 rounded-lg transition-colors" title="Bearbeiten">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 17H6v-3L16.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414L9 17z" />
                    </svg>
                </button>
                <button class="move-btn touch-target bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 p-2 rounded-lg transition-colors" title="Zu Ehemalige">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                </button>
            </div>
          </div>
        `;
        d.querySelector('.edit-btn').onclick = () => openPlayerForm(team, player.id);
        d.querySelector('.move-btn').onclick = () => movePlayerWithTransaction(player.id, "Ehemalige");
        c.appendChild(d);
    });
}

function renderEhemaligeList() {
    const c = document.getElementById("ehemalige-players");
    if (!c) return;
    const sorted = ehemalige.slice().sort((a, b) => {
        const posA = POSITION_ORDER[a.position] ?? 99;
        const posB = POSITION_ORDER[b.position] ?? 99;
        return posA - posB;
    });
    c.innerHTML = "";
    sorted.forEach((player) => {
        const marktwert = typeof player.value === 'number'
            ? player.value
            : (player.value ? parseFloat(player.value) : 0);

        // Mobile-optimized former player card
        const d = document.createElement("div");
        d.className = "mobile-card bg-white dark:bg-gray-800 border dark:border-gray-700 hover:shadow-md transition-all";
        d.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
                <div class="flex items-center mb-1">
                    <span class="inline-flex items-center justify-center w-8 h-8 bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 rounded-full mr-3">
                        ${player.position || "?"}
                    </span>
                    <span class="font-semibold text-gray-900 dark:text-white truncate">${player.name}</span>
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400 font-medium">${marktwert ? marktwert + "M €" : "N/A"}</div>
            </div>
            <div class="flex items-center space-x-1">
                <button class="edit-btn touch-target bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-300 p-2 rounded-lg transition-colors" title="Bearbeiten">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M9 17H6v-3L16.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414L9 17z" />
                    </svg>
                </button>
                <button class="delete-btn touch-target bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-600 dark:text-red-300 p-2 rounded-lg transition-colors" title="Löschen">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M10 3h4a2 2 0 012 2v2H8V5a2 2 0 012-2z" />
                    </svg>
                </button>
                <button class="move-aek-btn touch-target bg-sky-100 hover:bg-sky-200 dark:bg-sky-900 dark:hover:bg-sky-800 text-sky-600 dark:text-sky-300 p-2 rounded-lg transition-colors" title="Zu AEK">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l4-4-4-4" />
                    </svg>
                </button>
                <button class="move-real-btn touch-target bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-600 dark:text-red-300 p-2 rounded-lg transition-colors" title="Zu Real">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                </button>
            </div>
          </div>
        `;
        d.querySelector('.edit-btn').onclick = () => openPlayerForm('Ehemalige', player.id);
        d.querySelector('.delete-btn').onclick = () => deletePlayerDb(player.id);
        d.querySelector('.move-aek-btn').onclick = () => movePlayerWithTransaction(player.id, 'AEK');
        d.querySelector('.move-real-btn').onclick = () => movePlayerWithTransaction(player.id, 'Real');
        c.appendChild(d);
    });
}

function openPlayerForm(team, id) {
    let player = null;
    let edit = false;
    if (id) {
        let all = [...aekAthen, ...realMadrid, ...ehemalige];
        player = all.find(p => p.id === id);
        if (player) edit = true;
    }
    showModal(`
        <form id="player-form" class="space-y-4 px-2 max-w-[420px] mx-auto bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg">
            <h3 class="font-bold text-lg mb-2">${edit ? "Spieler bearbeiten" : "Spieler hinzufügen"} <span class="text-xs">${team}</span></h3>
            <input type="text" name="name" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" placeholder="Name" value="${player ? player.name : ""}" required>
            <select name="position" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" required>
                <option value="">Position wählen</option>
                ${POSITIONEN.map(pos => `<option${player && player.position === pos ? " selected" : ""}>${pos}</option>`).join("")}
            </select>
            <input type="number" min="0" step="0.1" name="value" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" placeholder="Marktwert (M)" value="${player && player.value !== undefined ? player.value : ""}" required>
            <div class="flex gap-2">
                <button type="submit" class="bg-sky-600 hover:bg-sky-700 text-black w-full px-4 py-3 rounded-lg text-base font-semibold transition flex gap-2 items-center justify-center">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  ${edit ? "Speichern" : "Anlegen"}
                </button>
                <button type="button" class="bg-gray-200 dark:bg-gray-700 w-full px-4 py-3 rounded-lg text-base font-semibold" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);
    document.getElementById("player-form").onsubmit = (e) => submitPlayerForm(e, team, player ? player.id : null);
}

async function submitPlayerForm(event, team, id) {
    event.preventDefault();
    const form = event.target;
    const name = form.name.value;
    const position = form.position.value;
    const value = parseFloat(form.value.value);

    if (!id && (team === "AEK" || team === "Real")) {
        let fin = team === "AEK" ? finances.aekAthen : finances.realMadrid;
        if (fin.balance < value * 1000000) {
            alert("Kontostand zu gering!");
            return;
        }
        await saveTransactionAndFinance(team, "Spielerkauf", -value * 1000000, `Kauf von ${name} (${position})`);
    }
    if (id) {
        await savePlayer({ id, name, position, value, team });
    } else {
        await savePlayer({ name, position, value, team });
    }
    hideModal();
}

export { deletePlayerDb };

export function resetKaderState() {
    aekAthen = [];
    realMadrid = [];
    ehemalige = [];
    finances = { aekAthen: { balance: 0 }, realMadrid: { balance: 0 } };
    transactions = [];
}
