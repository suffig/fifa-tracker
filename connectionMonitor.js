/**
 * Connection Monitor - Monitors database connectivity and handles reconnection
 */
import { supabase } from './supabaseClient.js';

class ConnectionMonitor {
    constructor() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.healthCheckInterval = 30000; // Check every 30 seconds
        this.healthCheckTimer = null;
        this.reconnectTimer = null;
        this.listeners = [];
        this.lastSuccessfulConnection = Date.now();
        
        this.startHealthCheck();
        this.setupNetworkListeners();
    }

    addListener(callback) {
        this.listeners.push(callback);
    }

    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    notifyListeners(status) {
        this.listeners.forEach(listener => {
            try {
                listener(status);
            } catch (error) {
                console.error('Error in connection listener:', error);
            }
        });
    }

    async checkConnection() {
        try {
            // Try a simple query to test connection
            const { data, error } = await supabase.from('players').select('id').limit(1);
            
            if (error) {
                throw error;
            }

            if (!this.isConnected) {
                console.log('Database connection restored');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.lastSuccessfulConnection = Date.now();
                this.notifyListeners({ connected: true, reconnected: true });
            }
            
            return true;
        } catch (error) {
            console.warn('Database connection check failed:', error);
            
            if (this.isConnected) {
                console.log('Database connection lost');
                this.isConnected = false;
                this.notifyListeners({ connected: false, error });
            }
            
            return false;
        }
    }

    async attemptReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.notifyListeners({ 
                connected: false, 
                maxAttemptsReached: true,
                nextRetry: Date.now() + this.maxReconnectDelay
            });
            
            // Wait longer before trying again
            this.reconnectTimer = setTimeout(() => {
                this.reconnectAttempts = 0;
                this.attemptReconnection();
            }, this.maxReconnectDelay);
            
            return;
        }

        this.reconnectAttempts++;
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        const connected = await this.checkConnection();
        
        if (!connected) {
            // Exponential backoff
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
            
            this.notifyListeners({ 
                connected: false, 
                reconnecting: true,
                attempt: this.reconnectAttempts,
                nextRetry: Date.now() + this.reconnectDelay
            });
            
            this.reconnectTimer = setTimeout(() => {
                this.attemptReconnection();
            }, this.reconnectDelay);
        }
    }

    startHealthCheck() {
        this.healthCheckTimer = setInterval(async () => {
            if (!this.isConnected) {
                return; // Already in reconnection mode
            }
            
            const connected = await this.checkConnection();
            if (!connected) {
                this.attemptReconnection();
            }
        }, this.healthCheckInterval);
    }

    setupNetworkListeners() {
        // Listen for online/offline events
        window.addEventListener('online', () => {
            console.log('Network connection restored');
            if (!this.isConnected) {
                this.checkConnection();
            }
        });

        window.addEventListener('offline', () => {
            console.log('Network connection lost');
            this.isConnected = false;
            this.notifyListeners({ connected: false, networkOffline: true });
        });
    }

    getStatus() {
        return {
            connected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            lastSuccessfulConnection: this.lastSuccessfulConnection,
            timeSinceLastConnection: Date.now() - this.lastSuccessfulConnection
        };
    }

    destroy() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.listeners = [];
    }
}

// Export singleton instance
export const connectionMonitor = new ConnectionMonitor();

// Export utility function to check if we should attempt database operations
export function isDatabaseAvailable() {
    return connectionMonitor.isConnected;
}