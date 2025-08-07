import { NhostClient } from 'https://cdn.jsdelivr.net/npm/@nhost/nhost-js/+esm';

alert("nhostClient.js geladen!");
console.log("nhostClient.js geladen!");

export const nhost = new NhostClient({
  subdomain: 'lclasfeqhdiqxycvumjm',
  region: 'eu-central-1'
});

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
    if (error.code === 'PGRST301' || error.code === 'PGRST116') return true;
    return false;
  }

  async select(table, query = '*', options = {}) {
    return this.retryOperation(async () => {
      let gqlQuery = `query {
        ${table}`;
      
      // Add filters
      if (options.eq) {
        const filters = Object.entries(options.eq).map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key}: {_eq: "${value}"}`;
          }
          return `${key}: {_eq: ${value}}`;
        }).join(', ');
        gqlQuery += `(where: {${filters}})`;
      }
      
      // Add ordering
      if (options.order) {
        const orderBy = `{${options.order.column}: ${options.order.ascending !== false ? 'asc' : 'desc'}}`;
        gqlQuery += `(order_by: ${orderBy})`;
      }
      
      // Add limit
      if (options.limit) {
        gqlQuery += `(limit: ${options.limit})`;
      }
      
      // Determine which fields to select
      let fields;
      if (query === '*') {
        // Default fields for most tables
        fields = 'id created_at updated_at';
        // Add common fields based on table name
        if (table === 'players') {
          fields += ' name team position value goals';
        } else if (table === 'matches') {
          fields += ' date home_team away_team home_score away_score home_scorers away_scorers feld';
        } else if (table === 'bans') {
          fields += ' playerid matchesserved totalmatchesban reason';
        } else if (table === 'finances') {
          fields += ' team balance debt';
        } else if (table === 'transactions') {
          fields += ' date type team amount info match_id';
        } else if (table === 'spieler_des_spiels') {
          fields += ' name team count match_id';
        }
      } else {
        fields = query;
      }
      
      gqlQuery += ` {
        ${fields}
      }
      }`;

      const result = await this.client.graphql.request(gqlQuery);
      return { data: result.data?.[table] || [], error: result.error };
    });
  }

  async insert(table, data) {
    return this.retryOperation(async () => {
      // Prepare the data object for GraphQL
      const dataFields = Object.entries(data).map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        } else if (value === null || value === undefined) {
          return `${key}: null`;
        }
        return `${key}: ${value}`;
      }).join(', ');
      
      const mutation = `mutation {
        insert_${table}_one(object: {${dataFields}}) {
          id
        }
      }`;
      
      const result = await this.client.graphql.request(mutation);
      return { data: result.data?.[`insert_${table}_one`], error: result.error };
    });
  }

  async update(table, data, id) {
    return this.retryOperation(async () => {
      // Prepare the data object for GraphQL
      const setFields = Object.entries(data).map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        } else if (value === null || value === undefined) {
          return `${key}: null`;
        }
        return `${key}: ${value}`;
      }).join(', ');
      
      const mutation = `mutation {
        update_${table}_by_pk(pk_columns: {id: ${id}}, _set: {${setFields}}) {
          id
        }
      }`;
      
      const result = await this.client.graphql.request(mutation);
      return { data: result.data?.[`update_${table}_by_pk`], error: result.error };
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
      return { data: result.data?.[`delete_${table}_by_pk`], error: result.error };
    });
  }

  getClient() {
    return this.client;
  }
}

export const nhostDb = new NhostWrapper(nhost);

// Auth event handler
nhost.auth.onAuthStateChanged((event, session) => {
  console.log('Auth state changed:', event, session?.user?.email || 'No user');
  if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  } else if (event === 'SIGNED_IN') {
    console.log('User signed in');
  } else if (event === 'TOKEN_CHANGED') {
    if (session) {
      console.log('Auth token refreshed successfully');
    } else {
      console.error('Token refresh failed - user may need to re-authenticate');
      // Session-Expiry Event für die UI
      window.dispatchEvent(new Event('nhost-session-expired'));
    }
  }
});

// Global exports for compatibility
window.nhost = nhost;
window.nhostDb = nhostDb;