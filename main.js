import { supabase } from './supabaseClient.js';
console.log("Bis hier: vor 1");
import { signUp, signIn, signOut } from './auth.js';
console.log("Bis hier: vor 2");
import { renderKaderTab } from './kader.js';
console.log("Bis hier: vor 3");
import { renderBansTab } from './bans.js';
console.log("Bis hier: vor 4");
import { renderMatchesTab } from './matches.js';
console.log("Bis hier: vor 5");
import { renderStatsTab } from './stats.js';
console.log("Bis hier: vor 6");
import { renderFinanzenTab } from './finanzen.js';
console.log("Bis hier: vor 7");
import { renderSpielerTab } from './spieler.js';
console.log("Bis hier: vor 8");

let currentTab = "squad";
let liveSyncInitialized = false;
let tabButtonsInitialized = false;


alert("main.js geladen!");
console.log("main.js geladen!");
window.onerror = function(message, source, lineno, colno, error) {
    alert("JS-Fehler: " + message + "\n" + source + ":" + lineno + ":" + colno);
    console.error("JS-Fehler:", message, source, lineno, colno, error);
};


// 4. Dark Mode Toggle
/*const darkToggle = () => {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
};
document.addEventListener('DOMContentLoaded', () => {
    // Theme beim Laden setzen
    if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    // Toggle-Button Events
    document.getElementById('dark-toggle')?.addEventListener('click', darkToggle);
});*/

console.log("Bis hier: vor 9");

// 5. Loader anzeigen/ausblenden
function showTabLoader(show = true) {
    const loader = document.getElementById('tab-loader');
    if (loader) loader.style.display = show ? "flex" : "none";
}

console.log("Bis hier: vor 10");

function switchTab(tab) {
    currentTab = tab;
    // Entferne aktive Klasse von allen Tabs
    document.querySelectorAll('nav a').forEach(btn => {
        btn.classList.remove("bg-blue-700","text-white","active-tab","lg:text-blue-700");
        btn.removeAttribute("aria-current");
    });
    // Füge aktive Klasse hinzu (Desktop)
    const desktopTab = document.getElementById(tab + "-tab");
    if (desktopTab) {
        desktopTab.classList.add("bg-blue-700","text-white","active-tab","lg:text-blue-700");
        desktopTab.setAttribute("aria-current","page");
    }
    // 5. Loader anzeigen
    showTabLoader(true);
    setTimeout(() => { // Simuliere Ladedauer, falls render-Funktion async ist, ggf. anpassen!
        renderCurrentTab();
        showTabLoader(false);
    }, 300);
}

console.log("Bis hier: vor 11");

function renderCurrentTab() {
    if(currentTab==="squad") renderKaderTab("app");
    else if(currentTab==="bans") renderBansTab("app");
    else if(currentTab==="matches") renderMatchesTab("app");
    else if(currentTab==="stats") renderStatsTab("app");
    else if(currentTab==="finanzen") renderFinanzenTab("app");
    else if(currentTab==="spieler") renderSpielerTab("app");
}

console.log("Bis hier: vor 12");

function setupTabButtons() {
    if(tabButtonsInitialized) return;
    document.getElementById("squad-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("squad"); });
    document.getElementById("bans-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("bans"); });
    document.getElementById("matches-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("matches"); });
    document.getElementById("stats-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("stats"); });
    document.getElementById("finanzen-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("finanzen"); });
    document.getElementById("spieler-tab")?.addEventListener("click", e => { e.preventDefault(); switchTab("spieler"); });
    tabButtonsInitialized = true;
}

console.log("Bis hier: vor 13");

function subscribeAllLiveSync() {
    if (liveSyncInitialized) return;
    supabase
        .channel('global_live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => { if (document.body.contains(document.getElementById(currentTab + "-tab"))) renderCurrentTab(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => { if (document.body.contains(document.getElementById(currentTab + "-tab"))) renderCurrentTab(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { if (document.body.contains(document.getElementById(currentTab + "-tab"))) renderCurrentTab(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'finances' }, () => { if (document.body.contains(document.getElementById(currentTab + "-tab"))) renderCurrentTab(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bans' }, () => { if (document.body.contains(document.getElementById(currentTab + "-tab"))) renderCurrentTab(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'spieler_des_spiels' }, () => { if (document.body.contains(document.getElementById(currentTab + "-tab"))) renderCurrentTab(); })
        .subscribe();
    liveSyncInitialized = true;
}

console.log("Bis hier: vor 14");

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

console.log("Bis hier: vor 15");

async function renderLoginArea() {
    const loginDiv = document.getElementById('login-area');
    if (!loginDiv) {
        console.error("login-area nicht gefunden!");
        return;
    }
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) {
        console.error(".app-container nicht gefunden!");
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
        const loginForm = document.getElementById('loginform');
        if (loginForm) {
            loginForm.onsubmit = async e => {
                e.preventDefault();
                await signIn(email.value, pw.value);
            };
        }
    }
}

console.log("Bis hier: vor 16");

supabase.auth.onAuthStateChange((_event, _session) => renderLoginArea());
console.log("Bis hier: vor 17");
window.addEventListener('DOMContentLoaded', renderLoginArea);