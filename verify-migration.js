// Quick verification script to test nhost migration
import { nhost, supabase } from './nhostClient.js';

console.log('🧪 Testing nhost migration...');

// Test 1: Check if nhost client is initialized
console.log('1. nhost client:', nhost ? '✅ Initialized' : '❌ Not initialized');

// Test 2: Check if compatibility layer is working
console.log('2. Compatibility layer:', supabase ? '✅ Available' : '❌ Not available');

// Test 3: Check if auth is accessible
console.log('3. Auth methods:', 
  supabase.auth && supabase.auth.signIn ? '✅ Available' : '❌ Not available');

// Test 4: Check if database operations are accessible
console.log('4. Database operations:', 
  supabase.from ? '✅ Available' : '❌ Not available');

console.log('Migration verification complete!');