# Configuration Interface

This extension now includes a unified popup interface that seamlessly combines the main view and configuration view in a single-page application.

## Features

The popup (`popup_unified.html`) provides:

### Main View
- Status indicator for the extension
- Hours selection dropdown
- "Remplir le formulaire" button
- Quick access to configuration

### Configuration View
1. **Number of Hours** - Daily work hours (0.5 - 24 hours)
2. **Rest Time** - Break duration in minutes (0 - 120 minutes)
3. **Default Code Project** - Default project code for time tracking
4. **Weekly Transport Mode** - Choose transport mode for each weekday:
   - Monday through Friday
   - Options: In Place, Bicycle, Client

## Navigation

**Seamless View Switching:**
- Click "⚙️ Configuration" to switch to config view (instant, no popup close)
- Click "← Back to Main" to return to main view (instant, no popup close)
- Click "💾 Save" to save settings and automatically return to main view

## Accessing Configuration

### From Code
Use the `configUtils.js` utility module to access configuration:

```javascript
// Get full configuration
const config = await getConfig();

// Get specific value
const workHours = await getConfigValue('workHours');

// Get transport mode for a specific day
const mondayMode = await getTransportMode('monday');

// Get today's transport mode
const todayMode = await getTodayTransportMode();

// Update configuration
await updateConfig({ workHours: 7.5 });

// Reset to defaults
await resetConfig();
```

## Storage

Configuration is stored using Chrome's `chrome.storage.sync` API, which:
- Syncs across devices when user is signed in to Chrome
- Persists even when extension is updated
- Has a limit of 100KB total storage

## Files

- `popup_unified.html` - Unified popup interface with both views
- `popup_unified.js` - Combined logic for main and config views
- `configUtils.js` - Utility functions for accessing configuration
- `manifest.json` - Updated to use unified popup
