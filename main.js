import { supabase, supabaseDb } from './supabaseClient.js';
import { connectionMonitor, isDatabaseAvailable } from './connectionMonitor.js';

import { signUp, signIn, signOut } from './auth.js';
import { renderKaderTab } from './kader.js';
import { renderBansTab } from './bans.js';
import { renderMatchesTab } from './matches.js';
import { renderStatsTab } from './stats.js';
import { renderFinanzenTab } from './finanzen.js';
import { renderSpielerTab } from './spieler.js';

let currentTab = "squad";
let liveSyncInitialized = false;
let tabButtonsInitialized = false;
let realtimeChannel = null;
let isAppVisible = true;
let inactivityCleanupTimer = null;

// --- Connection status indicator ---
function updateConnectionStatus(status) {
    let indicator = document.getElementById('connection-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.className = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300';
        document.body.appendChild(indicator);
    }
    if (status.connected) {
        indicator.textContent = status.reconnected ? 'Verbindung wiederhergestellt' : 'Online';
        indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-green-500 text-white';
        if (status.reconnected) {
            setTimeout(() => {
                indicator.textContent = 'Online';
            }, 3000);
        }
    } else {
        if (status.networkOffline) {
            indicator.textContent = 'Offline';
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-gray-500 text-white';
        } else if (status.sessionExpired) {
            indicator.textContent = 'Session abgelaufen – bitte neu anmelden';
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-700 text-white';
        } else if (status.reconnecting) {
            indicator.textContent = `Verbinde... (${status.attempt}/5)`;
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-yellow-500 text-white';
        } else if (status.maxAttemptsReached) {
            indicator.textContent = 'Verbindung unterbrochen';
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-500 text-white';
        } else {
            indicator.textContent = 'Verbindung verloren';
            indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-500 text-white';
        }
    }
}

// --- Session expiry UI handler (for supabaseClient.js event dispatch) ---
window.addEventListener('supabase-session-expired', () => {
    let indicator = document.getElementById('connection-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'connection-status';
        indicator.className = 'fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300';
        document.body.appendChild(indicator);
    }
    indicator.textContent = 'Session abgelaufen – bitte neu anmelden';
    indicator.className = indicator.className.replace(/bg-\w+-\d+/g, '') + ' bg-red-700 text-white';
});

// Handle app visibility changes to prevent crashes during inactivity
function handleVisibilityChange() {
    const wasVisible = isAppVisible;
    isAppVisible = !document.hidden;

    if (!isAppVisible && wasVisible) {
        inactivityCleanupTimer = setTimeout(() => {
            cleanupRealtimeSubscriptions();
            connectionMonitor.pauseHealthChecks();
        }, 5 * 60 * 1000);
    } else if (isAppVisible && !wasVisible) {
        if (inactivityCleanupTimer) {
            clearTimeout(inactivityCleanupTimer);
            inactivityCleanupTimer = null;
        }
        connectionMonitor.resumeHealthChecks();
        supabase.auth.getSession().then(({data: {session}}) => {
            if(session) subscribeAllLiveSync();
        });
    }
}

function cleanupRealtimeSubscriptions() {
    if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
        liveSyncInitialized = false;
    }
}

function showTabLoader(show = true) {
    const loader = document.getElementById('tab-loader');
    if (loader) loader.style.display = show ? "flex" : "none";
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-item').forEach(btn => {
        btn.classList.remove("active");
        btn.removeAttribute("aria-current");
    });
    const desktopTab = document.getElementById(tab + "-tab");
    if (desktopTab) {
        desktopTab.classList.add("active");
        desktopTab.setAttribute("aria-current","page");
    }
    showTabLoader(true);
    setTimeout(() => {
        renderCurrentTab();
        showTabLoader(false);
    }, 300);
}

function renderCurrentTab() {
    // Abfangen, falls kein App-Container vorhanden ist
    const appDiv = document.getElementById("app");
    if (!appDiv) return;
    appDiv.innerHTML = ""; // leeren, um Fehler zu vermeiden
    // Robust: Tabs nur anzeigen, wenn Session da
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
            appDiv.innerHTML = `<div class="card-modern rounded-2xl p-6 text-center">
                <i class="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                <p class="text-gray-600">Nicht angemeldet. Bitte einloggen.</p>
            </div>`;
            return;
        }
        // Tab-Render
        if(currentTab==="squad") renderKaderTab("app");
        else if(currentTab==="bans") renderBansTab("app");
        else if(currentTab==="matches") renderMatchesTab("app");
        else if(currentTab==="stats") renderStatsTab("app");
        else if(currentTab==="finanzen") renderFinanzenTab("app");
        else if(currentTab==="spieler") renderSpielerTab("app");
    });
}

function setupTabButtons() {
    if(tabButtonsInitialized) return;
    document.getElementById("squad-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("squad"); });
    document.getElementById("bans-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("bans"); });
    document.getElementById("matches-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("matches"); });
    document.getElementById("stats-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("stats"); });
    document.getElementById("finanzen-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("finanzen"); });
    document.getElementById("spieler-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("spieler"); });
    
    // Setup floating action button
    document.getElementById("floating-add-btn")?.addEventListener("click", () => {
        // Trigger add action based on current tab
        if (currentTab === "squad") {
            // Show team selection for adding player
            showTeamSelectionModal();
        } else if (currentTab === "matches") {
            // Open match form
            if (typeof openMatchForm === 'function') openMatchForm();
        } else if (currentTab === "bans") {
            // Open ban form
            if (typeof openBanForm === 'function') openBanForm();
        } else if (currentTab === "finanzen") {
            // Open transaction form
            if (typeof openTransForm === 'function') openTransForm();
        }
    });
    
    tabButtonsInitialized = true;
}

function showTeamSelectionModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-end justify-center';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black bg-opacity-50" onclick="this.parentElement.remove()"></div>
        <div class="card-modern rounded-t-3xl p-6 w-full max-w-md">
            <h3 class="text-xl font-bold mb-4 text-center">Spieler hinzufügen</h3>
            <div class="space-y-3">
                <button onclick="openPlayerForm('AEK'); this.closest('.fixed').remove();" 
                        class="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 rounded-2xl font-semibold text-lg hover:from-blue-600 hover:to-blue-700 transition-all">
                    <i class="fas fa-plus mr-2"></i> AEK Spieler
                </button>
                <button onclick="openPlayerForm('Real'); this.closest('.fixed').remove();" 
                        class="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-4 rounded-2xl font-semibold text-lg hover:from-red-600 hover:to-red-700 transition-all">
                    <i class="fas fa-plus mr-2"></i> Real Spieler
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function subscribeAllLiveSync() {
    if (liveSyncInitialized || !isAppVisible) return;
    cleanupRealtimeSubscriptions();
    realtimeChannel = supabase
        .channel('global_live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finances' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bans' }, () => renderCurrentTab())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spieler_des_spiels' }, () => renderCurrentTab())
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                liveSyncInitialized = true;
            } else if (status === 'CHANNEL_ERROR') {
                liveSyncInitialized = false;
                if (isAppVisible) setTimeout(() => {
                    if (!liveSyncInitialized && isAppVisible) subscribeAllLiveSync();
                }, 5000);
            } else if (status === 'CLOSED') {
                liveSyncInitialized = false;
                if (isDatabaseAvailable() && isAppVisible) setTimeout(() => {
                    if (isAppVisible) subscribeAllLiveSync();
                }, 2000);
            }
        });
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await signOut();
            let tries = 0;
            while (tries < 20) {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) break;
                await new Promise(res => setTimeout(res, 100));
                tries++;
            }
            window.location.reload();
        };
    }
}

async function renderLoginArea() {
    const loginDiv = document.getElementById('login-area');
    const appContainer = document.querySelector('.app-container');
    if (!loginDiv || !appContainer) {
        document.body.innerHTML = `<div style="color:red;padding:2rem;text-align:center">
          Kritischer Fehler: UI-Container nicht gefunden.<br>
          Bitte Seite neu laden oder Admin kontaktieren.
        </div>`;
        return;
    }
    const logoutBtn = document.getElementById('logout-btn');
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        loginDiv.innerHTML = "";
        appContainer.style.display = '';
        if (logoutBtn) logoutBtn.style.display = "";
        setupLogoutButton();
        setupTabButtons();
        connectionMonitor.addListener(updateConnectionStatus);
        if (!tabButtonsInitialized) {
            switchTab(currentTab);
        } else {
            renderCurrentTab();
        }
        subscribeAllLiveSync();
    } else {
        loginDiv.innerHTML = `
            <div class="min-h-screen flex flex-col items-center justify-center p-6">
                <div class="card-modern rounded-3xl p-8 w-full max-w-md">
                    <div class="text-center mb-8">
                        <div class="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-futbol text-white text-3xl"></i>
                        </div>
                        <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">FIFA Tracker</h1>
                        <p class="text-gray-600">Willkommen zurück!</p>
                    </div>
                    <form id="loginform" class="space-y-4">
                        <div class="space-y-4">
                            <input type="email" id="email" required placeholder="E-Mail" 
                                   class="w-full px-4 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-lg" />
                            <input type="password" id="pw" required placeholder="Passwort" 
                                   class="w-full px-4 py-4 rounded-2xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none text-lg" />
                        </div>
                        <button type="submit" class="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold text-lg py-4 rounded-2xl shadow-lg hover:from-blue-600 hover:to-purple-700 active:scale-95 transition-all duration-150">
                            <i class="fas fa-sign-in-alt mr-2"></i> Anmelden
                        </button>
                    </form>
                </div>
            </div>
        `;
        appContainer.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = "none";
        liveSyncInitialized = false;
        tabButtonsInitialized = false;
        cleanupRealtimeSubscriptions();
        if (inactivityCleanupTimer) {
            clearTimeout(inactivityCleanupTimer);
            inactivityCleanupTimer = null;
        }
        connectionMonitor.removeListener(updateConnectionStatus);
        const loginForm = document.getElementById('loginform');
        if (loginForm) {
            loginForm.onsubmit = async e => {
                e.preventDefault();
                await signIn(email.value, pw.value);
            };
        }
    }
}

// Nur HIER wird der Render-Flow getriggert!
supabase.auth.onAuthStateChange((_event, _session) => renderLoginArea());
window.addEventListener('DOMContentLoaded', renderLoginArea);
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', () => {
    cleanupRealtimeSubscriptions();
    if (inactivityCleanupTimer) {
        clearTimeout(inactivityCleanupTimer);
    }
    connectionMonitor.destroy();
});