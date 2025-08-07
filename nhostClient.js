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
    return false;
  }

  async select(table, query = '*', options = {}) {
    return this.retryOperation(async () => {
      let graphqlQuery = `query { ${table}`;
      
      // Add filters
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
        const orderBy = `order_by: {${options.order.column}: ${options.order.ascending !== false ? 'asc' : 'desc'}}`;
        if (options.eq) {
          graphqlQuery = graphqlQuery.replace(')', `, ${orderBy})`);
        } else {
          graphqlQuery += `(${orderBy})`;
        }
      }

      // Add limit
      if (options.limit) {
        const limitClause = `limit: ${options.limit}`;
        if (options.eq || options.order) {
          graphqlQuery = graphqlQuery.replace(')', `, ${limitClause})`);
        } else {
          graphqlQuery += `(${limitClause})`;
        }
      }

      // Determine which fields to select
      if (query === '*') {
        // For now, we'll select common fields - this can be customized per table
        switch (table) {
          case 'players':
            graphqlQuery += ` { id name team position value created_at updated_at }`;
            break;
          case 'matches':
            graphqlQuery += ` { id date team1 team2 score1 score2 created_at updated_at }`;
            break;
          case 'bans':
            graphqlQuery += ` { id player_id team type totalgames matchesserved created_at updated_at }`;
            break;
          case 'finances':
            graphqlQuery += ` { id team balance created_at updated_at }`;
            break;
          case 'transactions':
            graphqlQuery += ` { id team amount description created_at updated_at }`;
            break;
          case 'spieler_des_spiels':
            graphqlQuery += ` { id match_id player_id created_at updated_at }`;
            break;
          default:
            graphqlQuery += ` { id created_at updated_at }`;
        }
      } else {
        graphqlQuery += ` { ${query} }`;
      }

      graphqlQuery += ' }';

      console.log('GraphQL Query:', graphqlQuery);

      const result = await this.client.graphql.request(graphqlQuery);
      return { data: result.data[table], error: result.error };
    });
  }

  async insert(table, data) {
    return this.retryOperation(async () => {
      const insertData = Array.isArray(data) ? data : [data];
      const objects = insertData.map(item => {
        const fields = Object.entries(item).map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key}: "${value}"`;
          }
          return `${key}: ${value}`;
        }).join(', ');
        return `{${fields}}`;
      }).join(', ');

      const mutation = `
        mutation {
          insert_${table}(objects: [${objects}]) {
            returning {
              id
            }
          }
        }
      `;

      console.log('GraphQL Mutation:', mutation);

      const result = await this.client.graphql.request(mutation);
      return { data: result.data[`insert_${table}`]?.returning, error: result.error };
    });
  }

  async update(table, data, id) {
    return this.retryOperation(async () => {
      const setFields = Object.entries(data).map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: "${value}"`;
        }
        return `${key}: ${value}`;
      }).join(', ');

      const mutation = `
        mutation {
          update_${table}(where: {id: {_eq: ${id}}}, _set: {${setFields}}) {
            returning {
              id
            }
          }
        }
      `;

      console.log('GraphQL Mutation:', mutation);

      const result = await this.client.graphql.request(mutation);
      return { data: result.data[`update_${table}`]?.returning, error: result.error };
    });
  }

  async delete(table, id) {
    return this.retryOperation(async () => {
      const mutation = `
        mutation {
          delete_${table}(where: {id: {_eq: ${id}}}) {
            returning {
              id
            }
          }
        }
      `;

      console.log('GraphQL Mutation:', mutation);

      const result = await this.client.graphql.request(mutation);
      return { data: result.data[`delete_${table}`]?.returning, error: result.error };
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
  if (event === 'SIGNED_OUT') {
    console.log('User signed out');
  } else if (event === 'SIGNED_IN') {
    console.log('User signed in');
  } else if (event === 'TOKEN_CHANGED') {
    console.log('Auth token changed');
  }
});

// Global access for debugging
window.nhost = nhost;
window.nhostDb = nhostDb;