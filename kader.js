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
        <div class="w-full">
            <div class="mb-6">
                <h2 class="text-2xl font-bold text-white mb-2">Team-Kader</h2>
                <p class="text-white text-opacity-70">Verwalte deine Spieler</p>
            </div>
            <div class="grid grid-cols-1 gap-6">
                <div class="card-modern rounded-3xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xl font-bold text-blue-600 flex items-center">
                            <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                <i class="fas fa-shield-alt text-blue-600 text-sm"></i>
                            </div>
                            AEK
                        </h3>
                        <button id="add-player-aek" class="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:from-blue-600 hover:to-blue-700 transition-all">
                            <i class="fas fa-plus mr-1"></i> Hinzufügen
                        </button>
                    </div>
                    <div id="team-a-players" class="space-y-2"></div>
                    <div class="text-sm mt-4 text-gray-600 bg-blue-50 rounded-xl p-3">
                        <i class="fas fa-chart-line mr-2"></i>
                        Gesamter Marktwert: <span id="aek-marktwert" class="font-bold text-blue-600">${getKaderMarktwert(aekAthen).toLocaleString('de-DE')}M €</span>
                    </div>
                </div>
                <div class="card-modern rounded-3xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xl font-bold text-red-600 flex items-center">
                            <div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
                                <i class="fas fa-crown text-red-600 text-sm"></i>
                            </div>
                            Real
                        </h3>
                        <button id="add-player-real" class="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:from-red-600 hover:to-red-700 transition-all">
                            <i class="fas fa-plus mr-1"></i> Hinzufügen
                        </button>
                    </div>
                    <div id="team-b-players" class="space-y-2"></div>
                    <div class="text-sm mt-4 text-gray-600 bg-red-50 rounded-xl p-3">
                        <i class="fas fa-chart-line mr-2"></i>
                        Gesamter Marktwert: <span id="real-marktwert" class="font-bold text-red-600">${getKaderMarktwert(realMadrid).toLocaleString('de-DE')}M €</span>
                    </div>
                </div>
                <div class="card-modern rounded-3xl p-6">
                    <h3 class="text-xl font-bold text-gray-600 flex items-center mb-4">
                        <div class="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-history text-gray-600 text-sm"></i>
                        </div>
                        Ehemalige
                    </h3>
                    <div id="ehemalige-players" class="space-y-2"></div>
                </div>
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
    
    if (!arr.length) {
        c.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-users text-3xl mb-2"></i>
                <p>Noch keine Spieler</p>
            </div>
        `;
        return;
    }
    
    arr.forEach(player => {
        const marktwert = typeof player.value === 'number'
            ? player.value
            : (player.value ? parseFloat(player.value) : 0);

        const d = document.createElement("div");
        d.className = "player-card bg-white bg-opacity-50 backdrop-blur-sm rounded-2xl p-4 border border-white border-opacity-20 hover:bg-opacity-70 transition-all";

        d.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 bg-gradient-to-br ${team === 'AEK' ? 'from-blue-400 to-blue-600' : 'from-red-400 to-red-600'} rounded-xl flex items-center justify-center">
                        <i class="fas fa-user text-white"></i>
                    </div>
                    <div>
                        <p class="font-bold text-gray-800">${player.name}</p>
                        <p class="text-sm text-gray-500">${player.position}</p>
                        <p class="text-sm font-semibold ${team === 'AEK' ? 'text-blue-600' : 'text-red-600'}">${marktwert}M €</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button class="edit-btn w-10 h-10 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl flex items-center justify-center transition-colors" title="Bearbeiten">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="move-btn w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl flex items-center justify-center transition-colors" title="Zu Ehemalige">
                        <i class="fas fa-arrow-right"></i>
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
    
    if (!sorted.length) {
        c.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-history text-3xl mb-2"></i>
                <p>Keine ehemaligen Spieler</p>
            </div>
        `;
        return;
    }
    
    sorted.forEach((player) => {
        const marktwert = typeof player.value === 'number'
            ? player.value
            : (player.value ? parseFloat(player.value) : 0);

        const d = document.createElement("div");
        d.className = "player-card bg-white bg-opacity-50 backdrop-blur-sm rounded-2xl p-4 border border-white border-opacity-20 hover:bg-opacity-70 transition-all";
        d.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-600 rounded-xl flex items-center justify-center">
                        <i class="fas fa-user text-white"></i>
                    </div>
                    <div>
                        <p class="font-bold text-gray-800">${player.name}</p>
                        <p class="text-sm text-gray-500">${player.position || ""}</p>
                        <p class="text-sm font-semibold text-gray-600">${marktwert ? marktwert + "M €" : ""}</p>
                    </div>
                </div>
                <div class="flex space-x-2">
                    <button class="edit-btn w-10 h-10 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl flex items-center justify-center transition-colors" title="Bearbeiten">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-btn w-10 h-10 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl flex items-center justify-center transition-colors" title="Löschen">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="move-aek-btn w-10 h-10 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-xl flex items-center justify-center transition-colors" title="Zu AEK">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <button class="move-real-btn w-10 h-10 bg-red-100 hover:bg-red-200 text-red-600 rounded-xl flex items-center justify-center transition-colors" title="Zu Real">
                        <i class="fas fa-arrow-right"></i>
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
        <form id="player-form" class="space-y-6 p-6 max-w-md mx-auto">
            <div class="text-center">
                <div class="w-16 h-16 bg-gradient-to-br ${team === 'AEK' ? 'from-blue-400 to-blue-600' : team === 'Real' ? 'from-red-400 to-red-600' : 'from-gray-400 to-gray-600'} rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-user text-white text-2xl"></i>
                </div>
                <h3 class="text-2xl font-bold text-gray-800 mb-2">${edit ? "Spieler bearbeiten" : "Spieler hinzufügen"}</h3>
                <p class="text-gray-600">${team}</p>
            </div>
            <div class="space-y-4">
                <input type="text" name="name" class="w-full px-4 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-lg" placeholder="Spielername" value="${player ? player.name : ""}" required>
                <select name="position" class="w-full px-4 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-lg" required>
                <option value="">Position wählen</option>
                ${POSITIONEN.map(pos => `<option${player && player.position === pos ? " selected" : ""}>${pos}</option>`).join("")}
                </select>
                <input type="number" min="0" step="0.1" name="value" class="w-full px-4 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-lg" placeholder="Marktwert (Millionen €)" value="${player && player.value !== undefined ? player.value : ""}" required>
            </div>
            <div class="flex gap-3">
                <button type="submit" class="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-4 rounded-2xl hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all duration-150">
                    <i class="fas fa-check mr-2"></i>
                    ${edit ? "Speichern" : "Anlegen"}
                </button>
                <button type="button" class="flex-1 bg-gray-200 text-gray-700 font-bold py-4 rounded-2xl hover:bg-gray-300 active:scale-95 transition-all duration-150" onclick="window.hideModal()">
                    Abbrechen
                </button>
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
