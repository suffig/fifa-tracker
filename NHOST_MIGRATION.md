# nhost Migration Guide

## Overview
This guide documents the migration from Supabase to nhost for the FIFA tracker application.

## nhost Configuration
- **Region**: eu-central-1
- **Subdomain**: lclasfeqhdiqxycvumjm

### URLs
- **Auth**: `https://lclasfeqhdiqxycvumjm.auth.eu-central-1.nhost.run/v1`
- **GraphQL**: `https://lclasfeqhdiqxycvumjm.hasura.eu-central-1.nhost.run/v1/graphql`
- **Storage**: `https://lclasfeqhdiqxycvumjm.storage.eu-central-1.nhost.run/v1`

## Database Schema Requirements
The application expects the following tables in your nhost/Hasura database:

### Required Tables:
- `players` - Player information
- `matches` - Match data
- `bans` - Player ban information
- `transactions` - Financial transactions
- `finances` - Team finances
- `spieler_des_spiels` - Player of the match statistics

### Schema Migration
If migrating from Supabase, you'll need to:
1. Export your data from Supabase
2. Set up corresponding tables in Hasura
3. Import the data to nhost

## Development Setup

### Local Development
For local development when CDN access is limited:
1. The application includes a mock client that activates when nhost CDN is blocked
2. This allows basic UI testing without full backend functionality
3. Console will show: "🔧 nhostClient.js geladen (Mock-Modus für Entwicklung)"

### Production Deployment
For production deployment:
1. Ensure nhost CDN access (`https://cdn.jsdelivr.net/npm/@nhost/nhost-js/+esm`)
2. Configure your nhost project with the correct subdomain and region
3. Set up proper authentication and database permissions
4. The application will automatically use the real nhost client

## Migration Changes Summary

### Files Modified:
- `nhostClient.js` - New nhost client with compatibility layer
- `auth.js` - Updated authentication methods
- `main.js` - Updated imports and session handling
- `data.js` - Updated database operations
- `connectionMonitor.js` - Updated health checks
- All module files updated to use compatibility layer

### Key Features:
- ✅ Compatibility layer maintains existing API structure
- ✅ Graceful fallback for development environments
- ✅ GraphQL operations wrapped to appear like REST API
- ✅ Authentication methods adapted for nhost
- ✅ Connection monitoring adapted for nhost

## Testing
The migration has been tested and verified:
- ✅ Application loads correctly
- ✅ Authentication flow works
- ✅ UI renders properly
- ✅ Mock mode functions for development

## Troubleshooting

### Common Issues:
1. **CDN Blocked**: Use the mock mode for development, ensure CDN access for production
2. **Authentication Errors**: Verify nhost subdomain and region configuration
3. **Database Errors**: Ensure proper Hasura schema and permissions are set up

### Console Messages:
- "✅ nhostClient.js geladen - echte nhost Verbindung" = Real nhost connection
- "🔧 nhostClient.js geladen (Mock-Modus für Entwicklung)" = Mock mode for development