import { showModal, hideModal } from './modal.js';
import { supabase } from './supabaseClient.js';
import { matches } from './matches.js';

let finances = {
    aekAthen: { balance: 0, debt: 0 },
    realMadrid: { balance: 0, debt: 0 }
};
let transactions = [];

// Lädt alle Finanzen und Transaktionen und ruft das Rendern auf
async function loadFinancesAndTransactions(renderFn = renderFinanzenTabInner) {
    const { data: finData, error: finError } = await supabase.from('finances').select('*');
    if (finError) {
        alert("Fehler beim Laden der Finanzen: " + finError.message);
    }
    if (finData && finData.length) {
        finances = {
            aekAthen: finData.find(f => f.team === "AEK") || { balance: 0, debt: 0 },
            realMadrid: finData.find(f => f.team === "Real") || { balance: 0, debt: 0 }
        };
    } else {
        finances = {
            aekAthen: { balance: 0, debt: 0 },
            realMadrid: { balance: 0, debt: 0 }
        };
    }

    const { data: transData, error: transError } = await supabase.from('transactions').select('*').order('id', { ascending: false });
    if (transError) {
        alert("Fehler beim Laden der Transaktionen: " + transError.message);
    }
    transactions = transData || [];
    renderFn("app");
}

// Transaktion in die DB schreiben und Finanzen aktualisieren
async function saveTransaction(trans) {
    trans.amount = parseInt(trans.amount, 10) || 0;
    const { error: insertError } = await supabase.from('transactions').insert([{
        date: trans.date,
        type: trans.type,
        team: trans.team,
        amount: trans.amount,
        info: trans.info || null,
        match_id: trans.match_id || null
    }]);
    if (insertError) {
        alert("Fehler beim Speichern der Transaktion: " + insertError.message);
        return;
    }
    const teamKey = trans.team === "AEK" ? "aekAthen" : "realMadrid";
    let updateObj = {};
    if (trans.type === "Echtgeld-Ausgleich") {
        updateObj.debt = (finances[teamKey].debt || 0) + trans.amount;
    } else {
        let newBalance = (finances[teamKey].balance || 0) + trans.amount;
        if (newBalance < 0) newBalance = 0;
        updateObj.balance = newBalance;
    }
    const { error: updateError } = await supabase.from('finances').update(updateObj).eq('team', trans.team);
    if (updateError) {
        alert("Fehler beim Aktualisieren der Finanzen: " + updateError.message);
    }
}

export async function renderFinanzenTab(containerId = "app") {
    await loadFinancesAndTransactions(renderFinanzenTabInner);
}

function renderFinanzenTabInner(containerId = "app") {
    const app = document.getElementById(containerId);
    app.innerHTML = `
        <div class="w-full animation-fade-in-up">
            <div class="mb-6">
                <h2 class="text-apple-title text-white mb-2">Finanzen</h2>
                <p class="text-apple-body text-white text-opacity-70">Verwaltung der Team-Finanzen</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                <div class="card-apple p-6">
                    <div class="flex items-center mb-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center mr-4">
                            <i class="fas fa-shield-alt text-white text-lg"></i>
                        </div>
                        <h3 class="text-apple-headline text-blue-600">AEK</h3>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-apple-body text-gray-600">Kontostand:</span>
                            <span class="text-apple-body font-bold text-blue-600">${(finances.aekAthen.balance || 0).toLocaleString('de-DE')} €</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-apple-body text-gray-600">Echtgeldschulden:</span>
                            <span class="text-apple-body font-bold text-red-500">${(finances.aekAthen.debt || 0).toLocaleString('de-DE')} €</span>
                        </div>
                    </div>
                </div>
                <div class="card-apple p-6">
                    <div class="flex items-center mb-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center mr-4">
                            <i class="fas fa-crown text-white text-lg"></i>
                        </div>
                        <h3 class="text-apple-headline text-red-600">Real</h3>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <span class="text-apple-body text-gray-600">Kontostand:</span>
                            <span class="text-apple-body font-bold text-red-600">${(finances.realMadrid.balance || 0).toLocaleString('de-DE')} €</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-apple-body text-gray-600">Echtgeldschulden:</span>
                            <span class="text-apple-body font-bold text-red-500">${(finances.realMadrid.debt || 0).toLocaleString('de-DE')} €</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-apple p-6">
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-apple-headline text-gray-800">Transaktionen</h3>
                    <button id="add-trans-btn" class="btn-apple-secondary">
                        <i class="fas fa-plus mr-2"></i>
                        Hinzufügen
                    </button>
                </div>
                <div id="transactions-list" class="space-y-3"></div>
            </div>
        </div>
    `;

    document.getElementById("add-trans-btn").onclick = openTransForm;
    renderTransactions();
}

let transactionGroups = [];
let selectedDateIdx = 0;

function groupTransactionsByDate(transactions) {
    const groups = {};
    for (const t of transactions) {
        if (!t.date) continue;
        if (!groups[t.date]) groups[t.date] = [];
        groups[t.date].push(t);
    }
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => ({
        date,
        items: groups[date]
    }));
}

function renderTransactions() {
    const container = document.getElementById('transactions-list');
    if (!transactions.length) {
        container.innerHTML = `<div class="text-gray-400 text-sm">Keine Transaktionen vorhanden.</div>`;
        return;
    }

    transactionGroups = groupTransactionsByDate(transactions);
    if (selectedDateIdx >= transactionGroups.length) selectedDateIdx = 0;
    if (selectedDateIdx < 0) selectedDateIdx = 0;

    const { date, items } = transactionGroups[selectedDateIdx];

    // Matches sortieren wie Übersicht (neueste oben)
    let matchOrder = [];
    if (typeof matches !== "undefined" && Array.isArray(matches)) {
        matchOrder = matches.slice().sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
    }

    function getAppMatchNumber(matchId) {
        const idx = matchOrder.findIndex(m => m.id == matchId);
        return idx >= 0 ? matchOrder.length - idx : null;
    }

    // Gruppiere Transaktionen nach match_id
    const matchGroups = [];
    const nonMatchTransactions = [];
    for (const match of matchOrder) {
        const matchTx = items.filter(t => t.match_id == match.id);
        if (matchTx.length) {
            matchGroups.push({ match, txs: matchTx });
        }
    }
    const matchIds = new Set(matchOrder.map(m => m.id));
    items.forEach(t => {
        if (!t.match_id || !matchIds.has(t.match_id)) {
            nonMatchTransactions.push(t);
        }
    });

    let html = "";

    function getCellBgClass(team) {
        if (team === "AEK") return "bg-blue-50 dark:bg-blue-950";
        if (team === "Real") return "bg-red-50 dark:bg-red-950";
        return "";
    }

    // Match-Transaktionen
    matchGroups.forEach(({ match, txs }) => {
        const appNr = getAppMatchNumber(match.id);
        html += `
        <div class="border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-900 rounded-lg mb-4 p-2">
            <div class="font-bold text-yellow-800 dark:text-yellow-300 pl-2 mb-1">
                Match #${appNr}
            </div>
            <table class="w-full text-xs sm:text-sm dark:bg-gray-900 dark:text-gray-100">
                <thead>
                    <tr>
                        <th class="p-2 text-left">Datum</th>
                        <th class="p-2 text-left">Typ</th>
                        <th class="p-2 text-left">Team</th>
                        <th class="p-2 text-left">Info</th>
                        <th class="p-2 text-left">Betrag (€)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        txs.forEach(t => {
            html += `
                <tr>
                    <td class="p-2 text-left ${getCellBgClass(t.team)}">${t.date}</td>
                    <td class="p-2 text-left ${getCellBgClass(t.team)}">${t.type}</td>
                    <td class="p-2 text-left ${getCellBgClass(t.team)}">${t.team}</td>
                    <td class="p-2 text-left ${getCellBgClass(t.team)}">Match #${appNr}</td>
                    <td class="p-2 text-left font-bold ${getCellBgClass(t.team)} ${t.amount >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
                        ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}
                    </td>
                </tr>
            `;
        });
        html += `
                </tbody>
            </table>
        </div>
        `;
    });

    // Normale Transaktionen (ohne Match)
    if (nonMatchTransactions.length) {
        html += `
        <table class="w-full text-xs sm:text-sm dark:bg-gray-900 dark:text-gray-100">
            <thead>
                <tr>
                    <th class="p-2 text-left">Datum</th>
                    <th class="p-2 text-left">Typ</th>
                    <th class="p-2 text-left">Team</th>
                    <th class="p-2 text-left">Info</th>
                    <th class="p-2 text-left">Betrag (€)</th>
                </tr>
            </thead>
            <tbody>
        `;
        nonMatchTransactions.forEach(t => {
            html += `
                <tr>
                    <td class="p-2 text-left ${getCellBgClass(t.team)}">${t.date}</td>
                    <td class="p-2 text-left ${getCellBgClass(t.team)}">${t.type}</td>
                    <td class="p-2 text-left ${getCellBgClass(t.team)}">${t.team}</td>
                    <td class="p-2 text-left ${getCellBgClass(t.team)}">${t.info || ""}</td>
                    <td class="p-2 text-left font-bold ${getCellBgClass(t.team)} ${t.amount >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
                        ${t.amount >= 0 ? '+' : ''}${t.amount.toLocaleString('de-DE')}
                    </td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
    }

    // Navigation Buttons
    html += `<div class="flex gap-2 mt-4">`;
    if (selectedDateIdx < transactionGroups.length - 1) {
        html += `<button id="older-trans-btn" class="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg font-semibold">Ältere Transaktionen</button>`;
    }
    if (selectedDateIdx > 0) {
        html += `<button id="newer-trans-btn" class="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg font-semibold">Neuere Transaktionen</button>`;
    }
    html += `</div>`;

    container.innerHTML = html;

    if (selectedDateIdx < transactionGroups.length - 1) {
        document.getElementById('older-trans-btn').onclick = () => {
            selectedDateIdx++;
            renderTransactions();
        };
    }
    if (selectedDateIdx > 0) {
        document.getElementById('newer-trans-btn').onclick = () => {
            selectedDateIdx--;
            renderTransactions();
        };
    }
}

function openTransForm() {
    showModal(`
        <form id="trans-form" class="space-y-4 px-2 max-w-[420px] mx-auto bg-white dark:bg-gray-800 rounded-lg">
            <h3 class="font-bold text-lg mb-2">Transaktion hinzufügen</h3>
            <select name="team" class="border rounded-lg p-3 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" required>
                <option value="">Team wählen</option>
                <option value="AEK">AEK</option>
                <option value="Real">Real</option>
            </select>
            <select name="type" class="border rounded-lg p-3 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" required>
                <option value="Sonstiges">Sonstiges</option>
                <option value="Spielerkauf">Spielerkauf</option>
                <option value="Spielerverkauf">Spielerverkauf</option>
                <option value="Echtgeld-Ausgleich">Echtgeld-Ausgleich</option>
            </select>
            <input type="number" step="any" name="amount" class="border rounded-lg p-3 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" required placeholder="Betrag (negativ für Abzug)">
            <input type="text" name="info" class="border rounded-lg p-3 w-full h-12 text-base dark:bg-gray-700 dark:text-gray-100" placeholder="Zusatzinfo (Spielername, Kommentar)">
            <div class="flex gap-2">
                <button type="submit" class="bg-green-600 hover:bg-green-700 text-white w-full px-4 py-3 rounded-lg text-base font-semibold transition flex gap-2 items-center justify-center">
                  <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                  Speichern
                </button>
                <button type="button" class="bg-gray-200 dark:bg-gray-700 w-full px-4 py-3 rounded-lg text-base font-semibold" onclick="window.hideModal()">Abbrechen</button>
            </div>
        </form>
    `);

    document.getElementById("trans-form").onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target;
        const team = f.team.value;
        const type = f.type.value;
        const amount = parseInt(f.amount.value, 10) || 0;
        const now = new Date().toISOString().slice(0,10);
        const info = f.info.value?.trim() || "";

        await saveTransaction({
            date: now,
            type, team, amount, info
        });

        hideModal();
    };
}

export function resetFinanzenState() {
    finances = {
        aekAthen: { balance: 0, debt: 0 },
        realMadrid: { balance: 0, debt: 0 }
    };
    transactions = [];
}