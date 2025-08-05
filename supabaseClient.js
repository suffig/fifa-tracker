import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

alert("supabaseClient.js geladen!");
console.log("supabaseClient.js geladen!");

export const supabase = createClient(
  'https://buduldeczjwnjvsckqat.supabase.co',
  'sb_publishable_wcOHaKNEW9rQ3anrRNlEpA_r1_wGda3',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'supabase.auth.token',
      // Add retry logic for auth operations
      autoRefreshTokenRetryAttempts: 3
    },
    // Global configuration for better error handling
    global: {
      headers: {
        'X-Client-Info': 'fifa-tracker/1.0.0'
      }
    }
  }
);

/**
 * Enhanced database operations with retry logic and error handling
 */
class SupabaseWrapper {
  constructor(client) {
    this.client = client;
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
  }

  async retryOperation(operation, maxRetries = this.maxRetries) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Check for Supabase errors
        if (result.error) {
          throw result.error;
        }
        
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error);
        
        // Don't retry on authentication errors or permanent errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retrying with exponential backoff
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  isNonRetryableError(error) {
    if (!error) return false;
    
    // Authentication errors shouldn't be retried
    if (error.message && error.message.includes('auth')) {
      return true;
    }
    
    // Invalid data errors shouldn't be retried
    if (error.code === 'PGRST301' || error.code === 'PGRST116') {
      return true;
    }
    
    return false;
  }

  // Enhanced select with retry logic
  async select(table, query = '*', options = {}) {
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).select(query);
      
      if (options.eq) {
        Object.entries(options.eq).forEach(([column, value]) => {
          queryBuilder = queryBuilder.eq(column, value);
        });
      }
      
      if (options.order) {
        queryBuilder = queryBuilder.order(options.order.column, { 
          ascending: options.order.ascending ?? true 
        });
      }
      
      if (options.limit) {
        queryBuilder = queryBuilder.limit(options.limit);
      }
      
      return await queryBuilder;
    });
  }

  // Enhanced insert with retry logic
  async insert(table, data) {
    return this.retryOperation(async () => {
      return await this.client.from(table).insert(data);
    });
  }

  // Enhanced update with retry logic
  async update(table, data, id) {
    return this.retryOperation(async () => {
      return await this.client.from(table).update(data).eq('id', id);
    });
  }

  // Enhanced delete with retry logic
  async delete(table, id) {
    return this.retryOperation(async () => {
      return await this.client.from(table).delete().eq('id', id);
    });
  }

  // Get the raw client for operations that need direct access
  getClient() {
    return this.client;
  }
}

// Create enhanced wrapper instance
export const supabaseDb = new SupabaseWrapper(supabase);

// Auth event handler with better error handling
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event, session?.user?.email || 'No user');
  
  if (event === 'TOKEN_REFRESHED') {
    if (session) {
      console.log('Auth token refreshed successfully');
    } else {
      console.error('Token refresh failed - user may need to re-authenticate');
    }
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  } else if (event === 'SIGNED_IN') {
    console.log('User signed in');
  }
});

// Am Ende von supabaseClient.js
window.supabase = supabase;
window.supabaseDb = supabaseDb;