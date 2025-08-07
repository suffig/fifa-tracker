// Try to import nhost client, with fallback for testing environments
let NhostClient, nhost;

async function initializeNhost() {
  try {
    const nhostModule = await import('https://cdn.jsdelivr.net/npm/@nhost/nhost-js/+esm');
    NhostClient = nhostModule.NhostClient;
    
    nhost = new NhostClient({
      subdomain: 'lclasfeqhdiqxycvumjm',
      region: 'eu-central-1'
    });
    
    console.log("✅ nhostClient.js geladen - echte nhost Verbindung");
  } catch (error) {
    console.warn("⚠️ nhost CDN blocked, using mock client for development:", error);
    
    // Mock nhost client for development/testing when CDN is blocked
    nhost = {
      auth: {
        signUp: async ({ email, password }) => ({ error: new Error("Mock: nhost nicht verfügbar - bitte echte nhost-Umgebung verwenden") }),
        signIn: async ({ email, password }) => ({ error: new Error("Mock: nhost nicht verfügbar - bitte echte nhost-Umgebung verwenden") }),
        signOut: async () => {},
        getSession: async () => ({ session: null }),
        onAuthStateChanged: (callback) => {
          // Mock: immediately call with signed out state
          setTimeout(() => callback('SIGNED_OUT', null), 100);
          return { unsubscribe: () => {} };
        }
      },
      graphql: {
        request: async (query) => ({ error: new Error("Mock: nhost nicht verfügbar"), data: null }),
        unsubscribeAll: () => {}
      }
    };
    
    console.log("🔧 nhostClient.js geladen (Mock-Modus für Entwicklung)");
  }
}

// Initialize on module load
await initializeNhost();

export { nhost };

class NhostWrapper {
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
        if (result.error) throw result.error;
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error);
        if (this.isNonRetryableError(error)) throw error;
        if (attempt === maxRetries) throw error;
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  isNonRetryableError(error) {
    if (!error) return false;
    if (error.message && error.message.includes('auth')) return true;
    if (error.message && error.message.includes('permission')) return true;
    return false;
  }

  async select(table, query = '*', options = {}) {
    return this.retryOperation(async () => {
      let graphqlQuery = `query {
        ${table}`;
      
      // Add where conditions
      if (options.eq) {
        const whereConditions = Object.entries(options.eq).map(([column, value]) => {
          if (typeof value === 'string') {
            return `${column}: {_eq: "${value}"}`;
          }
          return `${column}: {_eq: ${value}}`;
        }).join(', ');
        graphqlQuery += `(where: {${whereConditions}})`;
      }
      
      // Add ordering
      if (options.order) {
        const orderBy = options.order.ascending !== false ? 'asc' : 'desc';
        graphqlQuery += `(order_by: {${options.order.column}: ${orderBy}})`;
      }
      
      // Add limit
      if (options.limit) {
        graphqlQuery += `(limit: ${options.limit})`;
      }
      
      // Add fields selection
      if (query === '*') {
        // For now, we'll need to define the fields based on the table
        // This is a simplified approach - in a real migration you'd want to introspect the schema
        graphqlQuery += ` { id created_at updated_at }`;
      } else {
        graphqlQuery += ` { ${query} }`;
      }
      
      graphqlQuery += `}`;
      
      const result = await this.client.graphql.request(graphqlQuery);
      return { data: result.data[table], error: result.error };
    });
  }

  async insert(table, data) {
    return this.retryOperation(async () => {
      const fields = Object.keys(data).join(', ');
      const values = Object.entries(data).map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        }
        return `${key}: ${value}`;
      }).join(', ');
      
      const mutation = `mutation {
        insert_${table}_one(object: {${values}}) {
          id
        }
      }`;
      
      const result = await this.client.graphql.request(mutation);
      return { data: result.data[`insert_${table}_one`], error: result.error };
    });
  }

  async update(table, data, id) {
    return this.retryOperation(async () => {
      const setValues = Object.entries(data).map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        }
        return `${key}: ${value}`;
      }).join(', ');
      
      const mutation = `mutation {
        update_${table}_by_pk(pk_columns: {id: ${id}}, _set: {${setValues}}) {
          id
        }
      }`;
      
      const result = await this.client.graphql.request(mutation);
      return { data: result.data[`update_${table}_by_pk`], error: result.error };
    });
  }

  async delete(table, id) {
    return this.retryOperation(async () => {
      const mutation = `mutation {
        delete_${table}_by_pk(id: ${id}) {
          id
        }
      }`;
      
      const result = await this.client.graphql.request(mutation);
      return { data: result.data[`delete_${table}_by_pk`], error: result.error };
    });
  }

  getClient() {
    return this.client;
  }
}

export const nhostDb = new NhostWrapper(nhost);

// Auth event handler - similar to Supabase but using nhost
nhost.auth.onAuthStateChanged((event, session) => {
  console.log('Auth state changed:', event, session?.user?.email || 'No user');
  if (event === 'SIGNED_IN') {
    console.log('User signed in');
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  } else if (event === 'TOKEN_REFRESHED') {
    if (session) {
      console.log('Auth token refreshed successfully');
    } else {
      console.error('Token refresh failed - user may need to re-authenticate');
      // Optional: Session-Expiry Event für die UI
      window.dispatchEvent(new Event('nhost-session-expired'));
    }
  }
});

// Make available globally for compatibility
window.nhost = nhost;
window.nhostDb = nhostDb;

// Compatibility layer - expose similar interface to Supabase
export const supabase = {
  auth: nhost.auth,
  from: (table) => ({
    select: (query = '*') => ({
      eq: (column, value) => nhostDb.select(table, query, { eq: { [column]: value } }),
      order: (column, options = {}) => nhostDb.select(table, query, { order: { column, ascending: options.ascending } }),
      limit: (count) => nhostDb.select(table, query, { limit: count })
    }),
    insert: (data) => nhostDb.insert(table, data),
    update: (data) => ({
      eq: (column, value) => {
        if (column === 'id') {
          return nhostDb.update(table, data, value);
        }
        // For other columns, we'd need a more complex implementation
        throw new Error('Update with non-id column not implemented in compatibility layer');
      }
    }),
    delete: () => ({
      eq: (column, value) => {
        if (column === 'id') {
          return nhostDb.delete(table, value);
        }
        throw new Error('Delete with non-id column not implemented in compatibility layer');
      }
    })
  }),
  removeChannel: (channel) => {
    // nhost subscriptions work differently - this is a placeholder
    if (channel && channel.unsubscribe) {
      channel.unsubscribe();
    }
  },
  channel: (name) => ({
    on: (event, config, callback) => {
      // This is a simplified implementation
      // Real implementation would need to use nhost's subscription system
      return {
        subscribe: (statusCallback) => {
          if (statusCallback) statusCallback('SUBSCRIBED');
          return { unsubscribe: () => {} };
        }
      };
    }
  })
};

export const supabaseDb = nhostDb;