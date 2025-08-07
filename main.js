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
    // Update desktop navigation
    document.querySelectorAll('nav a[id$="-tab"]').forEach(btn => {
        btn.classList.remove("bg-blue-700","text-white","active-tab","lg:text-blue-700");
        btn.removeAttribute("aria-current");
    });
    const desktopTab = document.getElementById(tab + "-tab");
    if (desktopTab) {
        desktopTab.classList.add("bg-blue-700","text-white","active-tab","lg:text-blue-700");
        desktopTab.setAttribute("aria-current","page");
    }
    
    // Update mobile navigation
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.remove("active");
    });
    const mobileTab = document.getElementById("mobile-" + tab + "-tab");
    if (mobileTab) {
        mobileTab.classList.add("active");
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
            appDiv.innerHTML = `<div class="text-red-700 text-center py-6">Nicht angemeldet. Bitte einloggen.</div>`;
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
    // Desktop navigation
    document.getElementById("squad-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("squad"); });
    document.getElementById("bans-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("bans"); });
    document.getElementById("matches-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("matches"); });
    document.getElementById("stats-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("stats"); });
    document.getElementById("finanzen-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("finanzen"); });
    document.getElementById("spieler-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("spieler"); });
    
    // Mobile navigation
    document.getElementById("mobile-squad-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("squad"); });
    document.getElementById("mobile-bans-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("bans"); });
    document.getElementById("mobile-matches-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("matches"); });
    document.getElementById("mobile-stats-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("stats"); });
    document.getElementById("mobile-finanzen-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("finanzen"); });
    document.getElementById("mobile-spieler-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("spieler"); });
    
    tabButtonsInitialized = true;
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
            <div class="flex flex-col items-center mb-3">
                <img src="assets/logo.png" alt="Logo" class="w-60 h-60 mb-2" />
            </div>
            <form id="loginform" class="login-area flex flex-col gap-4">
                <input type="email" id="email" required placeholder="E-Mail" class="rounded border px-6 py-3 focus:ring focus:ring-blue-200" />
                <input type="password" id="pw" required placeholder="Passwort" class="rounded border px-6 py-3 focus:ring focus:ring-blue-200" />
				<div class="flex gap-2 w-full">
				  <button
					class="login-btn bg-blue-600 text-white font-bold text-lg md:text-xl py-4 w-full rounded-2xl shadow-lg hover:bg-fuchsia-500 active:scale-95 transition-all duration-150 outline-none ring-2 ring-transparent focus:ring-blue-300"
					style="min-width:180px;">
					<i class="fas fa-sign-in-alt mr-2"></i> Login
				  </button>
				</div>
            </form>
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