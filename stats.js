import { supabase } from './supabaseClient.js';

export async function renderStatsTab(containerId = "app") {
    // Lade Daten
    const [
        { data: bans = [], error: errorBans },
        { data: matches = [], error: errorMatches },
        { data: players = [], error: errorPlayers }
    ] = await Promise.all([
        supabase.from('bans').select('*'),
        supabase.from('matches').select('*'),
        supabase.from('players').select('*')
    ]);
    if (errorBans || errorMatches || errorPlayers) {
        document.getElementById(containerId).innerHTML =
            `<div class="text-red-700 p-4">Fehler beim Laden der Statistiken: ${errorBans?.message || ''} ${errorMatches?.message || ''} ${errorPlayers?.message || ''}</div>`;
        return;
    }

    // Spielerlisten
    const aekPlayers = players.filter(p => p.team === "AEK");
    const realPlayers = players.filter(p => p.team === "Real");

    // Übersicht: Tore, Karten, etc.
    const totalMatches = matches.length;
    const totalGoals = matches.reduce((sum, m) => sum + (m.goalsa || 0) + (m.goalsb || 0), 0);
    let gelbA = 0, rotA = 0, gelbB = 0, rotB = 0;
    matches.forEach(m => {
        gelbA += m.yellowa || 0;
        rotA += m.reda || 0;
        gelbB += m.yellowb || 0;
        rotB += m.redb || 0;
    });
    const totalGelb = gelbA + gelbB;
    const totalRot = rotA + rotB;
    const avgGoalsPerMatch = totalMatches ? (totalGoals / totalMatches).toFixed(2) : "0.00";
    const avgCardsPerMatch = totalMatches ? ((gelbA+rotA+gelbB+rotB)/totalMatches).toFixed(2) : "0.00";

    // Höchster Sieg pro Team
    function getHighestWin(team) {
        let maxDiff = -1;
        let result = null;
        matches.forEach(m => {
            let diff = 0, goalsFor = 0, goalsAgainst = 0, date = m.date || "";
            if (team === "AEK") {
                diff = (m.goalsa || 0) - (m.goalsb || 0);
                goalsFor = m.goalsa || 0;
                goalsAgainst = m.goalsb || 0;
            } else {
                diff = (m.goalsb || 0) - (m.goalsa || 0);
                goalsFor = m.goalsb || 0;
                goalsAgainst = m.goalsa || 0;
            }
            if (diff > maxDiff) {
                maxDiff = diff;
                result = { goalsFor, goalsAgainst, date, diff };
            }
        });
        return (result && result.diff > 0) ? result : null;
    }
    const aekBestWin = getHighestWin("AEK");
    const realBestWin = getHighestWin("Real");

    // Sperren Stats
    const bansAek = bans.filter(b => b.team === "AEK");
    const bansReal = bans.filter(b => b.team === "Real");
    const totalBansAek = bansAek.length;
    const totalBansReal = bansReal.length;
    const avgBanDurationAek = totalBansAek ? (bansAek.reduce((s, b) => s + (b.totalgames || b.matchesserved || 0), 0) / totalBansAek).toFixed(2) : "0.00";
    const avgBanDurationReal = totalBansReal ? (bansReal.reduce((s, b) => s + (b.totalgames || b.matchesserved || 0), 0) / totalBansReal).toFixed(2) : "0.00";
    function getTopBannedPlayer(bansArr, teamPlayers) {
        const counter = {};
        bansArr.forEach(b => {
            if (!b.player_id) return;
            counter[b.player_id] = (counter[b.player_id] || 0) + 1;
        });
        const sorted = Object.entries(counter).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return "–";
        if (sorted.length === 1 || (sorted.length > 1 && sorted[0][1] > sorted[1][1])) {
            const p = teamPlayers.find(pl => pl.id === Number(sorted[0][0]));
            return p ? `${p.name} (${sorted[0][1]})` : "–";
        }
        return "mehrere";
    }
    const topBannedAek = getTopBannedPlayer(bansAek, aekPlayers);
    const topBannedReal = getTopBannedPlayer(bansReal, realPlayers);

    // Sperren-Tabelle
    const bansTableHtml = bans.length
        ? `
        <div class="mt-3" id="bans-table-wrap" style="display:none;">
            <b>Alle Sperren</b>
            <div style="overflow-x:auto;">
                <table class="w-full mt-2 text-xs border border-gray-200 rounded overflow-hidden bg-white">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="p-1 text-left">Spieler</th>
                            <th class="p-1 text-left">Typ</th>
                            <th class="p-1 text-left">Spiele</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bans.map(b => {
                            const p = players.find(pl => pl.id === b.player_id);
                            return `<tr>
                                <td class="p-1">${p ? p.name : "?"}</td>
                                <td class="p-1">${b.type || ""}</td>
                                <td class="p-1">${b.totalgames || ""}</td>
                            </tr>`;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        </div>
        `
        : '';

    // Tore Stats
    const totalToreAek = aekPlayers.reduce((sum, p) => sum + (p.goals || 0), 0);
    const totalToreReal = realPlayers.reduce((sum, p) => sum + (p.goals || 0), 0);
    function getTopScorer(playersArr) {
        if (!playersArr.length) return null;
        const top = playersArr.slice().sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
        return (top && top.goals > 0) ? { name: top.name, goals: top.goals } : null;
    }
    const topScorerAek = getTopScorer(aekPlayers);
    const topScorerReal = getTopScorer(realPlayers);

    // Karten pro Spiel
    const avgGelbA = totalMatches ? (gelbA / totalMatches).toFixed(2) : "0.00";
    const avgRotA = totalMatches ? (rotA / totalMatches).toFixed(2) : "0.00";
    const avgGelbB = totalMatches ? (gelbB / totalMatches).toFixed(2) : "0.00";
    const avgRotB = totalMatches ? (rotB / totalMatches).toFixed(2) : "0.00";

    // Meiste Tore eines Spielers
    let maxGoalsSingle = 0, maxGoalsPlayer = null;
    matches.forEach(m => {
        if (m.goalslista) {
            m.goalslista.forEach(g => {
                if (g.count > maxGoalsSingle) {
                    maxGoalsSingle = g.count;
                    maxGoalsPlayer = aekPlayers.find(p => p.id === g.player_id) || { name: g.player };
                }
            });
        }
        if (m.goalslistb) {
            m.goalslistb.forEach(g => {
                if (g.count > maxGoalsSingle) {
                    maxGoalsSingle = g.count;
                    maxGoalsPlayer = realPlayers.find(p => p.id === g.player_id) || { name: g.player };
                }
            });
        }
    });

    // --- HTML ---
    const app = document.getElementById(containerId);
    app.innerHTML = `
        <div class="w-full animation-fade-in-up">
            <div class="mb-6">
                <h2 class="text-apple-title text-white mb-2">Statistiken</h2>
                <p class="text-apple-body text-white text-opacity-70">Übersicht und Analysen</p>
            </div>
            <div class="grid grid-cols-1 gap-6">

                <!-- Übersicht -->
                <div class="card-apple p-6">
                    <div class="flex items-center mb-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl flex items-center justify-center mr-4">
                            <i class="fas fa-chart-bar text-white text-lg"></i>
                        </div>
                        <h3 class="text-apple-headline text-gray-800">Spielübersicht</h3>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <div class="text-center">
                            <div class="w-16 h-16 bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl flex items-center justify-center mx-auto mb-2">
                                <i class="fas fa-futbol text-blue-600 text-2xl"></i>
                            </div>
                            <p class="text-2xl font-bold text-blue-600">${totalMatches}</p>
                            <p class="text-apple-caption text-gray-500">Spiele</p>
                        </div>
                        <div class="text-center">
                            <div class="w-16 h-16 bg-gradient-to-br from-green-100 to-green-200 rounded-2xl flex items-center justify-center mx-auto mb-2">
                                <i class="fas fa-bullseye text-green-600 text-2xl"></i>
                            </div>
                            <p class="text-2xl font-bold text-green-600">${totalGoals}</p>
                            <p class="text-apple-caption text-gray-500">Tore</p>
                        </div>
                        <div class="text-center">
                            <div class="w-16 h-16 bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-2xl flex items-center justify-center mx-auto mb-2">
                                <i class="fas fa-square text-yellow-600 text-2xl"></i>
                            </div>
                            <p class="text-2xl font-bold text-yellow-600">${totalGelb}</p>
                            <p class="text-apple-caption text-gray-500">Gelb</p>
                        </div>
                        <div class="text-center">
                            <div class="w-16 h-16 bg-gradient-to-br from-red-100 to-red-200 rounded-2xl flex items-center justify-center mx-auto mb-2">
                                <i class="fas fa-square text-red-600 text-2xl"></i>
                            </div>
                            <p class="text-2xl font-bold text-red-600">${totalRot}</p>
                            <p class="text-apple-caption text-gray-500">Rot</p>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="badge-apple text-center">
                            <i class="fas fa-calculator mr-2"></i>
                            Ø ${avgGoalsPerMatch} Tore/Spiel
                        </div>
                        <div class="badge-apple text-center">
                            <i class="fas fa-calculator mr-2"></i>
                            Ø ${avgCardsPerMatch} Karten/Spiel
                        </div>
                    </div>
                    ${maxGoalsSingle > 0 ? `
                    <div class="bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl p-3 border-l-4 border-yellow-400 mt-4">
                        <div class="flex items-center space-x-2">
                            <div class="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
                                <i class="fas fa-star text-white text-sm"></i>
                            </div>
                            <div>
                                <p class="text-apple-caption font-semibold text-yellow-700">Rekord</p>
                                <p class="text-apple-body font-bold text-yellow-800">${maxGoalsSingle} Tore - ${maxGoalsPlayer?.name || "?"}</p>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>

                <!-- Team-Vergleich -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="card-apple p-6">
                        <div class="flex items-center mb-4">
                            <div class="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center mr-4">
                                <i class="fas fa-shield-alt text-white text-lg"></i>
                            </div>
                            <h3 class="text-apple-headline text-blue-600">AEK</h3>
                        </div>
                        <div class="space-y-3">
                            ${aekBestWin ? `
                            <div class="badge-apple-success">
                                <i class="fas fa-trophy mr-2"></i>
                                Höchster Sieg: ${aekBestWin.goalsFor}:${aekBestWin.goalsAgainst}
                            </div>
                            ` : ''}
                            <div class="flex justify-between">
                                <span class="text-apple-body text-gray-600">Sperren:</span>
                                <span class="font-bold text-blue-600">${totalBansAek}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-apple-body text-gray-600">Ø Sperre:</span>
                                <span class="font-bold text-blue-600">${avgBanDurationAek} Spiele</span>
                            </div>
                            ${topBannedAek !== "–" ? `
                            <div class="text-apple-caption text-gray-500">
                                <i class="fas fa-exclamation-triangle mr-1"></i>
                                Meiste Sperren: ${topBannedAek}
                            </div>
                            ` : ''}
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
                            ${realBestWin ? `
                            <div class="badge-apple-success">
                                <i class="fas fa-trophy mr-2"></i>
                                Höchster Sieg: ${realBestWin.goalsFor}:${realBestWin.goalsAgainst}
                            </div>
                            ` : ''}
                            <div class="flex justify-between">
                                <span class="text-apple-body text-gray-600">Sperren:</span>
                                <span class="font-bold text-red-600">${totalBansReal}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-apple-body text-gray-600">Ø Sperre:</span>
                                <span class="font-bold text-red-600">${avgBanDurationReal} Spiele</span>
                            </div>
                            ${topBannedReal !== "–" ? `
                            <div class="text-apple-caption text-gray-500">
                                <i class="fas fa-exclamation-triangle mr-1"></i>
                                Meiste Sperren: ${topBannedReal}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                ${bans.length ? `
                <div class="card-apple p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-apple-headline text-gray-800">Detaillierte Sperren</h3>
                        <button id="show-bans-table" class="btn-apple-secondary">
                            <i class="fas fa-list mr-2"></i>Alle anzeigen
                        </button>
                    </div>
                </div>
                ` : ""}
                ${bansTableHtml}
            </div>

            <!-- Geschossene Tore -->
            <div class="flex gap-4 mb-2">
                <div class="flex-1 flex flex-col items-center justify-center rounded-xl bg-blue-50 text-blue-900 border border-blue-200 shadow px-4 py-3 min-w-[130px]">
                    <span class="font-bold text-lg flex items-center gap-2">AEK: <span class="text-2xl">${totalToreAek}</span></span>
                    <span class="flex items-center gap-1 mt-1 text-base">${topScorerAek ? `👑 <span class="font-semibold">${topScorerAek.name}</span> <span class="text-xs">(${topScorerAek.goals})</span>` : "–"}</span>
                </div>
                <div class="flex-1 flex flex-col items-center justify-center rounded-xl bg-red-50 text-red-900 border border-red-200 shadow px-4 py-3 min-w-[130px]">
                    <span class="font-bold text-lg flex items-center gap-2">Real: <span class="text-2xl">${totalToreReal}</span></span>
                    <span class="flex items-center gap-1 mt-1 text-base">${topScorerReal ? `👑 <span class="font-semibold">${topScorerReal.name}</span> <span class="text-xs">(${topScorerReal.goals})</span>` : "–"}</span>
                </div>
            </div>
            
            <!-- Karten (modern, mit schönen Badges & Durchschnitt) -->
            <div class="rounded-xl shadow border bg-white p-4 mb-2 flex flex-col gap-4">
                <div class="font-bold text-lg mb-2">Karten</div>
                <div class="flex flex-col sm:flex-row gap-4">
                    <div class="flex-1">
                        <div class="font-bold text-blue-900 text-base mb-1">AEK:</div>
                        <div class="flex gap-2 mb-2">
                            <span class="inline-flex items-center bg-yellow-100 text-yellow-900 rounded-full px-3 py-1 font-semibold shadow-sm border border-yellow-200">
                                <span class="mr-1">🟨</span>Gelb: <span class="ml-1">${gelbA}</span>
                            </span>
                            <span class="inline-flex items-center bg-red-100 text-red-700 rounded-full px-3 py-1 font-semibold shadow-sm border border-red-200">
                                <span class="mr-1">🟥</span>Rot: <span class="ml-1">${rotA}</span>
                            </span>
                        </div>
                        <div class="flex gap-3 mt-1">
                            <span class="inline-flex items-center bg-yellow-50 text-yellow-900 rounded-full px-3 py-1 text-xs font-medium border border-yellow-100 shadow-sm">
                                Ø GK/Spiel: <b class="ml-1">${avgGelbA}</b>
                            </span>
                            <span class="inline-flex items-center bg-red-50 text-red-700 rounded-full px-3 py-1 text-xs font-medium border border-red-100 shadow-sm">
                                Ø RK/Spiel: <b class="ml-1">${avgRotA}</b>
                            </span>
                        </div>
                    </div>
                    <div class="flex-1">
                        <div class="font-bold text-red-900 text-base mb-1">Real:</div>
                        <div class="flex gap-2 mb-2">
                            <span class="inline-flex items-center bg-yellow-100 text-yellow-900 rounded-full px-3 py-1 font-semibold shadow-sm border border-yellow-200">
                                <span class="mr-1">🟨</span>Gelb: <span class="ml-1">${gelbB}</span>
                            </span>
                            <span class="inline-flex items-center bg-red-100 text-red-700 rounded-full px-3 py-1 font-semibold shadow-sm border border-red-200">
                                <span class="mr-1">🟥</span>Rot: <span class="ml-1">${rotB}</span>
                            </span>
                        </div>
                        <div class="flex gap-3 mt-1">
                            <span class="inline-flex items-center bg-yellow-50 text-yellow-900 rounded-full px-3 py-1 text-xs font-medium border border-yellow-100 shadow-sm">
                                Ø GK/Spiel: <b class="ml-1">${avgGelbB}</b>
                            </span>
                            <span class="inline-flex items-center bg-red-50 text-red-700 rounded-full px-3 py-1 text-xs font-medium border border-red-100 shadow-sm">
                                Ø RK/Spiel: <b class="ml-1">${avgRotB}</b>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Button-Logik für die Sperren-Tabelle
    if (bans.length) {
        setTimeout(() => {
            const btn = document.getElementById("show-bans-table");
            const wrap = document.getElementById("bans-table-wrap");
            if (btn && wrap) {
                btn.onclick = () => {
                    wrap.style.display = wrap.style.display === "none" ? "" : "none";
                    btn.innerText = wrap.style.display === "none" ? "Alle Sperren anzeigen" : "Alle Sperren ausblenden";
                };
            }
        }, 0);
    }
}