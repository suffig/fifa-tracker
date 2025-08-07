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
    if (error.message && error.message.includes('unauthorized')) return true;
    if (error.message && error.message.includes('forbidden')) return true;
    return false;
  }

  async select(table, query = '*', options = {}) {
    return this.retryOperation(async () => {
      let gqlQuery = '';
      
      // Build GraphQL query based on table and options
      if (query === '*') {
        // Get all fields - we'll need to define these based on the schema
        const fieldMap = {
          'players': 'id name team position value',
          'matches': 'id date team1 team2 score1 score2 result',
          'bans': 'id player_name reason duration created_at',
          'transactions': 'id amount description team date',
          'finances': 'id team balance',
          'spieler_des_spiels': 'id player_name match_id date'
        };
        gqlQuery = fieldMap[table] || 'id';
      } else {
        gqlQuery = query;
      }

      let gql = `query {
        ${table}`;

      // Add where conditions
      if (options.eq) {
        const conditions = Object.entries(options.eq).map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key}: {_eq: "${value}"}`;
          }
          return `${key}: {_eq: ${value}}`;
        }).join(', ');
        gql += `(where: {${conditions}})`;
      }

      // Add ordering
      if (options.order) {
        const orderBy = options.order.ascending === false ? 'desc' : 'asc';
        gql += options.eq ? ', ' : '(';
        gql += `order_by: {${options.order.column}: ${orderBy}}`;
        if (!options.eq) gql += ')';
      }

      // Add limit
      if (options.limit) {
        if (!options.eq && !options.order) gql += '(';
        else if (options.eq && !options.order) gql += ', ';
        gql += `limit: ${options.limit}`;
        if (!options.eq && !options.order) gql += ')';
      }

      gql += ` {
        ${gqlQuery}
      }
    }`;

      const result = await this.client.graphql.request(gql);
      
      return {
        data: result.data[table],
        error: result.error
      };
    });
  }

  async insert(table, data) {
    return this.retryOperation(async () => {
      const dataArray = Array.isArray(data) ? data : [data];
      
      // Build insert mutation
      const fieldsStr = Object.keys(dataArray[0]).join(' ');
      const objectsStr = dataArray.map(item => {
        const entries = Object.entries(item).map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key}: "${value}"`;
          }
          return `${key}: ${value}`;
        }).join(', ');
        return `{${entries}}`;
      }).join(', ');

      const gql = `mutation {
        insert_${table}(objects: [${objectsStr}]) {
          affected_rows
          returning {
            ${fieldsStr}
          }
        }
      }`;

      const result = await this.client.graphql.request(gql);
      
      return {
        data: result.data[`insert_${table}`]?.returning,
        error: result.error
      };
    });
  }

  async update(table, data, id) {
    return this.retryOperation(async () => {
      // Build update mutation
      const setClause = Object.entries(data).map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        }
        return `${key}: ${value}`;
      }).join(', ');

      const fieldsStr = Object.keys(data).join(' ') + ' id';

      const gql = `mutation {
        update_${table}(where: {id: {_eq: ${id}}}, _set: {${setClause}}) {
          affected_rows
          returning {
            ${fieldsStr}
          }
        }
      }`;

      const result = await this.client.graphql.request(gql);
      
      return {
        data: result.data[`update_${table}`]?.returning,
        error: result.error
      };
    });
  }

  async delete(table, id) {
    return this.retryOperation(async () => {
      const gql = `mutation {
        delete_${table}(where: {id: {_eq: ${id}}}) {
          affected_rows
          returning {
            id
          }
        }
      }`;

      const result = await this.client.graphql.request(gql);
      
      return {
        data: result.data[`delete_${table}`]?.returning,
        error: result.error
      };
    });
  }

  getClient() {
    return this.client;
  }
}

export const nhostDb = new NhostWrapper(nhost);

// Auth event handler - similar to Supabase
nhost.auth.onAuthStateChanged((event, session) => {
  console.log('Auth state changed:', event, session?.user?.email || 'No user');
  if (event === 'SIGNED_IN') {
    console.log('User signed in');
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  } else if (event === 'TOKEN_CHANGED') {
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