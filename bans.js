import { showModal, hideModal } from './modal.js';
import { supabase } from './supabaseClient.js';

// --- Helper-Funktion: Spieler für Team laden ---
async function getPlayersByTeam(team) {
    const { data, error } = await supabase.from('players').select('*').eq('team', team);
    if (error) {
        console.warn('Fehler beim Laden der Spieler:', error.message);
        return [];
    }
    return data || [];
}

let bans = [];
let playersCache = [];

const BAN_TYPES = [
    { value: "Gelb-Rote Karte", label: "Gelb-Rote Karte", duration: 1 },
    { value: "Rote Karte", label: "Rote Karte", duration: 2 },
    { value: "Verletzung", label: "Verletzung", duration: 3 }
];
const ALLOWED_BAN_COUNTS = [1, 2, 3, 4, 5, 6];

export async function loadBansAndRender(renderFn = renderBansLists) {
    const [{ data: bansData, error: errorBans }, { data: playersData, error: errorPlayers }] = await Promise.all([
        supabase.from('bans').select('*'),
        supabase.from('players').select('*')
    ]);
    if (errorBans) {
        alert('Fehler beim Laden der Sperren: ' + errorBans.message);
        bans = [];
    } else {
        bans = bansData || [];
    }
    if (errorPlayers) {
        alert('Fehler beim Laden der Spieler: ' + errorPlayers.message);
        playersCache = [];
    } else {
        playersCache = playersData || [];
    }
    renderFn();
}

export function renderBansTab(containerId = "app") {
    const app = document.getElementById(containerId);

    app.innerHTML = `
        <div class="w-full animation-fade-in-up">
            <div class="mb-6">
                <h2 class="text-apple-title text-white mb-2">Sperren</h2>
                <p class="text-apple-body text-white text-opacity-70">Verwalte Spielersperren</p>
            </div>
            
            <div class="card-apple p-6 mb-6">
                <h3 class="text-apple-headline text-red-600 flex items-center mb-4">
                    <div class="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center mr-4">
                        <i class="fas fa-ban text-white text-lg"></i>
                    </div>
                    Aktive Sperren
                </h3>
                <div id="bans-active-list" class="space-y-3"></div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="card-apple p-6">
                    <h3 class="text-apple-headline text-blue-600 flex items-center mb-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center mr-4">
                            <i class="fas fa-shield-alt text-white text-lg"></i>
                        </div>
                        AEK Sperrenhistorie
                    </h3>
                    <div id="bans-history-aek" class="space-y-3"></div>
                </div>
                <div class="card-apple p-6">
                    <h3 class="text-apple-headline text-red-600 flex items-center mb-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center mr-4">
                            <i class="fas fa-crown text-white text-lg"></i>
                        </div>
                        Real Sperrenhistorie
                    </h3>
                    <div id="bans-history-real" class="space-y-3"></div>
                </div>
            </div>
        </div>
    `;

    loadBansAndRender(renderBansLists);
}

function renderBansLists() {
    const activeBans = bans.filter(b => getRestGames(b) > 0);
    renderBanList(activeBans, 'bans-active-list', true);

    // Vergangene Sperren: restGames <= 0, nach Team
    const oldAek = bans.filter(b => getRestGames(b) <= 0 && b.team === "AEK");
    const oldReal = bans.filter(b => getRestGames(b) <= 0 && b.team === "Real");
    renderBanList(oldAek, 'bans-history-aek', false);
    renderBanList(oldReal, 'bans-history-real', false);
}

function getRestGames(ban) {
    return (ban.totalgames || 1) - (ban.matchesserved || 0);
}

function renderBanList(list, containerId, active) {
    const c = document.getElementById(containerId);
    if (!c) return;
    if (!list.length) {
        c.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas ${active ? 'fa-check-circle' : 'fa-history'} text-3xl mb-2"></i>
                <p class="text-apple-body">${active ? "Keine aktiven Sperren" : "Keine vergangenen Sperren"}</p>
            </div>
        `;
        return;
    }
    c.innerHTML = '';
    list.forEach(ban => {
        const player = playersCache.find(p => p.id === ban.player_id);
        let teamColor, teamIcon;
        if (!player || player.team === "Ehemalige") {
            teamColor = "from-gray-400 to-gray-600";
            teamIcon = "fa-user";
        } else if (player.team === "AEK") {
            teamColor = "from-blue-400 to-blue-600";
            teamIcon = "fa-shield-alt";
        } else {
            teamColor = "from-red-400 to-red-600";
            teamIcon = "fa-crown";
        }
        
        const restGames = getRestGames(ban);
        const div = document.createElement('div');
        div.className = `list-item-apple ${active ? '' : 'opacity-75'}`;
        
        let statusBadge = '';
        if (active) {
            statusBadge = restGames > 3 ? 'badge-apple-error' : restGames > 1 ? 'badge-apple-warning' : 'badge-apple-success';
        }
        
        div.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-4">
                    <div class="w-14 h-14 bg-gradient-to-br ${teamColor} rounded-2xl flex items-center justify-center touch-target">
                        <i class="fas ${teamIcon} text-white text-lg"></i>
                    </div>
                    <div>
                        <p class="text-apple-body font-bold text-gray-800">${player ? player.name : "Unbekannter Spieler"}</p>
                        <p class="text-apple-caption text-gray-500">${player ? player.team : "-"} • ${ban.type || "-"}</p>
                        ${ban.reason ? `<p class="text-apple-caption text-gray-400">${ban.reason}</p>` : ''}
                        <div class="flex items-center space-x-2 mt-1">
                            <span class="badge-apple">Gesamt: ${ban.totalgames}</span>
                            ${active ? `<span class="${statusBadge}">Verbleibend: ${restGames < 0 ? 0 : restGames}</span>` : ''}
                        </div>
                    </div>
                </div>
                ${active ? `
                <div class="flex space-x-2">
                    <button class="edit-ban-btn w-12 h-12 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-2xl flex items-center justify-center transition-all touch-target hover:scale-105" title="Bearbeiten">
                        <i class="fas fa-edit text-lg"></i>
                    </button>
                    <button class="delete-ban-btn w-12 h-12 bg-red-100 hover:bg-red-200 text-red-600 rounded-2xl flex items-center justify-center transition-all touch-target hover:scale-105" title="Löschen">
                        <i class="fas fa-trash text-lg"></i>
                    </button>
                </div>
                ` : ''}
            </div>
        `;
        if (active) {
            div.querySelector('.edit-ban-btn').onclick = () => openBanForm(ban);
            div.querySelector('.delete-ban-btn').onclick = () => deleteBan(ban.id);
        }
        c.appendChild(div);
    });
}

async function saveBan(ban) {
    if (ban.id) {
        // Update
        const { error } = await supabase
            .from('bans')
            .update({
                player_id: ban.player_id,
                team: ban.team,
                type: ban.type,
                totalgames: ban.totalgames,
                matchesserved: ban.matchesserved,
                reason: ban.reason
            })
            .eq('id', ban.id);
        if (error) alert('Fehler beim Speichern: ' + error.message);
    } else {
        // Insert
        const { error } = await supabase
            .from('bans')
            .insert([{
                player_id: ban.player_id,
                team: ban.team,
                type: ban.type,
                totalgames: ban.totalgames,
                matchesserved: ban.matchesserved || 0,
                reason: ban.reason
            }]);
        if (error) alert('Fehler beim Anlegen: ' + error.message);
    }
}

// --- ASYNCHRONE SPIELERAUSWAHL IM MODAL ---
async function openBanForm(ban = null) {
    const edit = !!ban;
    let team = ban ? ban.team : "AEK";
    // Alle Spieler des gewählten Teams laden
    let spielerArr = await getPlayersByTeam(team);

    function playerOptions(arr, selectedPlayerId = null) {
        return arr.map(p =>
            `<option value="${p.id}"${p.id === selectedPlayerId ? " selected" : ""}>${p.name}</option>`
        ).join('');
    }

    // Typ-Auswahl
    const typeOptions = BAN_TYPES.map(t =>
        `<option value="${t.value}"${ban && ban.type === t.value ? " selected" : ""}>${t.label}</option>`
    ).join('');

    // Gesamtsperrenzahl (dropdown 1-6, außer Gelb-Rote Karte)
    function numberOptions(selectedType, selected, fieldName = "totalgames") {
        if (selectedType === "Gelb-Rote Karte")
            return `<option value="1" selected>1</option>`;
        return ALLOWED_BAN_COUNTS.map(v =>
            `<option value="${v}"${Number(selected) === v ? " selected" : ""}>${v}</option>`
        ).join('');
    }

    const initialType = ban ? ban.type : BAN_TYPES[0].value;
    const initialTotalGames = ban
        ? ban.totalgames
        : BAN_TYPES.find(t => t.value === initialType)?.duration || 1;

    showModal(`
        <form id="ban-form" class="space-y-4 px-2 max-w-[420px] mx-auto bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg">
            <h3 class="font-bold text-lg mb-2">${edit ? 'Sperre bearbeiten' : 'Sperre hinzufügen'}</h3>
            <div>
                <label class="font-semibold">Team:</label>
                <select name="team" id="ban-team" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100">
                    <option value="AEK"${team === "AEK" ? " selected" : ""}>AEK</option>
                    <option value="Real"${team === "Real" ? " selected" : ""}>Real</option>
                </select>
            </div>
            <div>
                <label class="font-semibold">Spieler:</label>
                <select name="player_id" id="ban-player" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100">
                    ${playerOptions(spielerArr, ban ? ban.player_id : null)}
                </select>
            </div>
            <div>
                <label class="font-semibold">Typ:</label>
                <select name="type" id="ban-type" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100">
                    ${typeOptions}
                </select>
            </div>
            <div>
                <label class="font-semibold">Gesamtsperrenzahl:</label>
                <select name="totalgames" id="ban-totalgames" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" ${initialType === "Gelb-Rote Karte" ? "disabled" : ""}>
                    ${numberOptions(initialType, initialTotalGames, "totalgames")}
                </select>
            </div>
            <div>
                <label class="font-semibold">Grund (optional):</label>
                <input type="text" name="reason" class="border rounded-md p-2 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" placeholder="Grund" value="${ban && ban.reason ? ban.reason : ''}">
            </div>
            <div class="flex gap-2">
                <button type="submit" class="bg-sky-600 hover:bg-sky-700 text-white w-full px-4 py-3 rounded-lg text-base font-semibold transition flex gap-2 items-center justify-center">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  ${edit ? 'Speichern' : 'Anlegen'}
                </button>
                <button type="button" class="bg-gray-200 dark:bg-gray-700 w-full px-4 py-3 rounded-lg text-base font-semibold" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);

    document.getElementById('ban-team').onchange = async function() {
        const val = this.value;
        const playerSel = document.getElementById('ban-player');
        playerSel.innerHTML = '<option>Lade...</option>';
        const arr = await getPlayersByTeam(val);
        playerSel.innerHTML = playerOptions(arr, null);
    };

    document.getElementById('ban-type').onchange = function() {
        const type = this.value;
        let duration = BAN_TYPES.find(t => t.value === type)?.duration || 1;
        updateTotalGames(type, duration);
    };

    function updateTotalGames(type, val) {
        const totalGamesSel = document.getElementById('ban-totalgames');
        if (type === "Gelb-Rote Karte") {
            totalGamesSel.innerHTML = `<option value="1" selected>1</option>`;
            totalGamesSel.setAttribute("disabled", "disabled");
        } else {
            totalGamesSel.removeAttribute("disabled");
            totalGamesSel.innerHTML = ALLOWED_BAN_COUNTS.map(v =>
                `<option value="${v}"${Number(val) === v ? " selected" : ""}>${v}</option>`
            ).join('');
        }
    }

    document.getElementById('ban-form').onsubmit = async e => {
        e.preventDefault();
        const form = e.target;
        const team = form.team.value;
        const player_id = parseInt(form.player_id.value, 10);
        const type = form.type.value;
        let totalgames = parseInt(form.totalgames.value, 10);
        if (type === "Gelb-Rote Karte") totalgames = 1;
        const reason = form.reason.value.trim();

        if (ban) {
            await saveBan({
                ...ban,
                team,
                player_id,
                type,
                totalgames,
                reason
            });
        } else {
            await saveBan({
                team,
                player_id,
                type,
                totalgames,
                matchesserved: 0,
                reason
            });
        }
        hideModal();
    };
}

// Hilfsfunktion für andere Module:
export async function decrementBansAfterMatch() {
    const { data: bansData, error } = await supabase.from('bans').select('*');
    if (error) return;
    const updates = [];
    bansData.forEach(ban => {
        if (getRestGames(ban) > 0) {
            updates.push(
                supabase.from('bans').update({ matchesserved: (ban.matchesserved || 0) + 1 }).eq('id', ban.id)
            );
        }
    });
    await Promise.all(updates);
}

// --- RESET-STATE-FUNKTION ---
export function resetBansState() {
    bans = [];
    playersCache = [];
}