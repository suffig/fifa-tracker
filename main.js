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

// Modern mobile app features
let pullToRefreshEnabled = false;
let isRefreshing = false;
let startY = 0;
let refreshThreshold = 70;

// --- Service Worker Registration for PWA capabilities ---
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered successfully:', registration);
            
            // Listen for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateNotification();
                    }
                });
            });
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
}

// --- PWA Install Prompt ---
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallPrompt();
});

function showInstallPrompt() {
    const installButton = document.createElement('button');
    installButton.textContent = 'App installieren';
    installButton.className = 'fixed bottom-20 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm font-medium';
    installButton.onclick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const result = await deferredPrompt.userChoice;
            if (result.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            }
            deferredPrompt = null;
            installButton.remove();
        }
    };
    document.body.appendChild(installButton);
    
    // Remove after 10 seconds if not clicked
    setTimeout(() => {
        if (installButton.parentNode) {
            installButton.remove();
        }
    }, 10000);
}

function showUpdateNotification() {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 left-4 right-4 bg-blue-600 text-white p-3 rounded-lg shadow-lg z-50 text-center';
    notification.innerHTML = `
        <p class="text-sm font-medium mb-2">Neue Version verfügbar!</p>
        <button onclick="window.location.reload()" class="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium">
            Aktualisieren
        </button>
    `;
    document.body.appendChild(notification);
}

// --- Pull-to-Refresh Implementation ---
function initPullToRefresh() {
    const app = document.getElementById('app');
    const refreshIndicator = document.createElement('div');
    refreshIndicator.className = 'pull-to-refresh';
    refreshIndicator.innerHTML = '<i class="fas fa-sync-alt"></i>';
    app.parentNode.insertBefore(refreshIndicator, app);
    
    let touchStartY = 0;
    let touchMoveY = 0;
    let isPulling = false;
    
    app.addEventListener('touchstart', (e) => {
        if (app.scrollTop === 0) {
            touchStartY = e.touches[0].clientY;
            isPulling = true;
        }
    }, { passive: true });
    
    app.addEventListener('touchmove', (e) => {
        if (!isPulling || isRefreshing) return;
        
        touchMoveY = e.touches[0].clientY;
        const pullDistance = touchMoveY - touchStartY;
        
        if (pullDistance > 0 && app.scrollTop === 0) {
            e.preventDefault();
            const progress = Math.min(pullDistance / refreshThreshold, 1);
            
            refreshIndicator.style.opacity = progress;
            refreshIndicator.style.transform = `translateX(-50%) translateY(${pullDistance * 0.5}px) rotate(${progress * 360}deg)`;
            
            if (progress >= 1) {
                refreshIndicator.classList.add('active');
                hapticFeedback('medium');
            } else {
                refreshIndicator.classList.remove('active');
            }
        }
    }, { passive: false });
    
    app.addEventListener('touchend', () => {
        if (isPulling && !isRefreshing) {
            const pullDistance = touchMoveY - touchStartY;
            
            if (pullDistance >= refreshThreshold) {
                triggerRefresh(refreshIndicator);
            } else {
                resetRefreshIndicator(refreshIndicator);
            }
        }
        isPulling = false;
        touchStartY = 0;
        touchMoveY = 0;
    });
}

async function triggerRefresh(indicator) {
    if (isRefreshing) return;
    
    isRefreshing = true;
    indicator.classList.add('active', 'refreshing');
    hapticFeedback('medium');
    
    try {
        // Refresh current tab data
        await refreshCurrentTab();
        
        // Show success feedback
        setTimeout(() => {
            resetRefreshIndicator(indicator);
            isRefreshing = false;
            hapticFeedback('light');
        }, 1000);
    } catch (error) {
        console.error('Refresh failed:', error);
        resetRefreshIndicator(indicator);
        isRefreshing = false;
    }
}

function resetRefreshIndicator(indicator) {
    indicator.classList.remove('active', 'refreshing');
    indicator.style.opacity = '0';
    indicator.style.transform = 'translateX(-50%) translateY(-60px) rotate(0deg)';
}

async function refreshCurrentTab() {
    // Re-render current tab with fresh data
    switch(currentTab) {
        case 'squad':
            await renderKaderTab();
            break;
        case 'matches':
            await renderMatchesTab();
            break;
        case 'bans':
            await renderBansTab();
            break;
        case 'finanzen':
            await renderFinanzenTab();
            break;
        case 'stats':
            await renderStatsTab();
            break;
        case 'spieler':
            await renderSpielerTab();
            break;
    }
}

// --- Haptic Feedback Simulation ---
function hapticFeedback(type = 'light') {
    // Try native haptic feedback if available (iOS Safari)
    if (navigator.vibrate) {
        switch(type) {
            case 'light':
                navigator.vibrate(10);
                break;
            case 'medium':
                navigator.vibrate([50, 50, 50]);
                break;
            case 'heavy':
                navigator.vibrate([100, 50, 100]);
                break;
        }
    }
    
    // Visual feedback for all devices
    const body = document.body;
    body.classList.add('haptic-feedback', type);
    setTimeout(() => {
        body.classList.remove('haptic-feedback', type);
    }, type === 'medium' ? 150 : 100);
}

// --- Enhanced Touch Interactions ---
function addRippleEffect(button) {
    button.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');
        
        this.appendChild(ripple);
        
        setTimeout(() => {
            ripple.remove();
        }, 600);
        
        hapticFeedback('light');
    });
}

// --- Skeleton Loading States ---
function showSkeletonLoader(container) {
    const skeletonHTML = `
        <div class="space-y-4">
            ${Array.from({length: 3}, () => `
                <div class="skeleton-card">
                    <div class="flex items-center space-x-3">
                        <div class="skeleton skeleton-avatar"></div>
                        <div class="flex-1">
                            <div class="skeleton skeleton-text wide"></div>
                            <div class="skeleton skeleton-text medium"></div>
                        </div>
                        <div class="skeleton skeleton-text short"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    if (container) {
        container.innerHTML = skeletonHTML;
    }
}

// --- Enhanced Tab Switching with Animations ---
function switchTabWithAnimation(tabName) {
    const app = document.getElementById('app');
    
    // Add exit animation
    app.style.opacity = '0';
    app.style.transform = 'translateY(10px)';
    
    setTimeout(() => {
        // Switch tab content
        currentTab = tabName;
        
        // Show skeleton while loading
        showSkeletonLoader(app);
        
        // Load actual content
        setTimeout(() => {
            loadTabContent(tabName);
            
            // Add enter animation
            app.style.opacity = '1';
            app.style.transform = 'translateY(0)';
            app.classList.add('tab-transition');
            
            setTimeout(() => {
                app.classList.remove('tab-transition');
            }, 300);
        }, 100);
    }, 150);
}

async function loadTabContent(tabName) {
    try {
        switch(tabName) {
            case 'squad':
                await renderKaderTab();
                break;
            case 'matches':
                await renderMatchesTab();
                break;
            case 'bans':
                await renderBansTab();
                break;
            case 'finanzen':
                await renderFinanzenTab();
                break;
            case 'stats':
                await renderStatsTab();
                break;
            case 'spieler':
                await renderSpielerTab();
                break;
        }
    } catch (error) {
        console.error('Error loading tab content:', error);
        document.getElementById('app').innerHTML = `
            <div class="text-center py-8">
                <div class="text-red-500 mb-2">
                    <i class="fas fa-exclamation-triangle text-2xl"></i>
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">Fehler beim Laden</h3>
                <p class="text-gray-500 mb-4">Die Inhalte konnten nicht geladen werden.</p>
                <button onclick="refreshCurrentTab()" class="touch-target bg-blue-600 text-white px-4 py-2 rounded-lg">
                    Erneut versuchen
                </button>
            </div>
        `;
    }
}

// --- Enhanced Accessibility ---
function enhanceAccessibility() {
    // Add skip link
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.textContent = 'Zum Hauptinhalt springen';
    skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded z-50';
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    // Add main landmark
    const main = document.querySelector('main');
    if (main) {
        main.id = 'main-content';
        main.setAttribute('role', 'main');
    }
    
    // Enhance keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            document.body.classList.add('using-keyboard');
        }
    });
    
    document.addEventListener('mousedown', () => {
        document.body.classList.remove('using-keyboard');
    });
}

// --- Initialize Modern Mobile Features ---
function initModernMobileFeatures() {
    registerServiceWorker();
    initPullToRefresh();
    enhanceAccessibility();
    
    // Add ripple effects to all buttons
    document.querySelectorAll('button, .touch-target').forEach(addRippleEffect);
    
    // Add performance optimizations
    document.querySelectorAll('.mobile-nav-item, .player-card, .mobile-card').forEach(el => {
        el.classList.add('gpu-accelerated');
    });
    
    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            // Recalculate viewport height for iOS
            document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        }, 100);
    });
    
    // Initial viewport height calculation
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

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
    // Use enhanced tab switching with animations
    switchTabWithAnimation(tab);
    
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
    
    // Update mobile navigation with haptic feedback
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.remove("active");
    });
    const mobileTab = document.getElementById("mobile-" + tab + "-tab");
    if (mobileTab) {
        mobileTab.classList.add("active");
        hapticFeedback('light'); // Add haptic feedback for tab switches
    }
}

function renderCurrentTab() {
    // Abfangen, falls kein App-Container vorhanden ist
    const appDiv = document.getElementById("app");
    if (!appDiv) return;
    
    // Add transition animation
    appDiv.classList.add('tab-transition');
    
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
        
        // Remove transition class after animation
        setTimeout(() => {
            appDiv.classList.remove('tab-transition');
        }, 300);
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
    
    // Add swipe navigation for mobile
    setupSwipeNavigation();
    
    tabButtonsInitialized = true;
}

// Mobile swipe navigation
function setupSwipeNavigation() {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    
    let startX = 0;
    let startY = 0;
    let isScrolling = false;
    
    const tabs = ["squad", "matches", "bans", "finanzen", "stats", "spieler"];
    
    appContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isScrolling = false;
    }, { passive: true });
    
    appContainer.addEventListener('touchmove', (e) => {
        if (!startX || !startY) return;
        
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        
        const diffX = Math.abs(currentX - startX);
        const diffY = Math.abs(currentY - startY);
        
        // Determine if user is scrolling vertically
        if (diffY > diffX) {
            isScrolling = true;
        }
    }, { passive: true });
    
    appContainer.addEventListener('touchend', (e) => {
        if (!startX || !startY || isScrolling) {
            startX = 0;
            startY = 0;
            return;
        }
        
        const endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;
        
        // Minimum swipe distance
        if (Math.abs(diffX) > 50) {
            const currentIndex = tabs.indexOf(currentTab);
            let newIndex;
            
            if (diffX > 0 && currentIndex < tabs.length - 1) {
                // Swipe left - next tab
                newIndex = currentIndex + 1;
            } else if (diffX < 0 && currentIndex > 0) {
                // Swipe right - previous tab
                newIndex = currentIndex - 1;
            }
            
            if (newIndex !== undefined) {
                switchTab(tabs[newIndex]);
            }
        }
        
        startX = 0;
        startY = 0;
    }, { passive: true });
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
window.addEventListener('DOMContentLoaded', () => {
    renderLoginArea();
    initModernMobileFeatures(); // Initialize modern mobile app features
});
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', () => {
    cleanupRealtimeSubscriptions();
    if (inactivityCleanupTimer) {
        clearTimeout(inactivityCleanupTimer);
    }
    connectionMonitor.destroy();
});