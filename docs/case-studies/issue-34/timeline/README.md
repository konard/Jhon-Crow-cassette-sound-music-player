# Timeline: Always on Top Persistence Bug

## Overview

This document reconstructs the sequence of events that led to the Always on Top persistence bug.

## Timeline of Events

### January 1, 2026 - Initial Always on Top Implementation (Commit `123d450`)

**Commit message:** "Add always-on-top window option"

The initial implementation added:
- Toggle switch in settings UI
- IPC handlers in main.js and preload.js
- State sync when opening settings panel
- **Note:** Did NOT persist across app restarts (by design at this point)

### January 1, 2026 - Settings Persistence Added (Commit `9fa8315`)

**Commit message:** "Add recursive folder scanning, 70px min window size, and settings persistence"

The commit claimed: *"All settings (audio effects, appearance, always-on-top) are now saved to a JSON file in the user data directory and automatically restored on app restart."*

**What was actually implemented:**

1. **main.js (CORRECTLY IMPLEMENTED):**
   - Added `DEFAULT_SETTINGS` with `window.alwaysOnTop: false`
   - Added `loadSettings()` function that properly loads `window` settings
   - Added `set-always-on-top` IPC handler that saves to `currentSettings.window.alwaysOnTop`
   - Added `save-settings` IPC handler that COMPLETELY REPLACES `currentSettings`

2. **renderer.js (BUG INTRODUCED HERE):**
   - Added `loadSavedSettings()` - does NOT load window settings (only audio and appearance)
   - Added `saveCurrentSettings()` - does NOT include window settings!

   The `saveCurrentSettings()` function only saves:
   ```javascript
   const settings = {
     audio: { ... },
     appearance: { ... }
   };
   // MISSING: window: { alwaysOnTop: ... }
   ```

### The Bug Mechanism

1. User enables "Always on Top" checkbox
2. → `setAlwaysOnTop(true)` is called via IPC
3. → `main.js` saves `currentSettings.window.alwaysOnTop = true` ✅
4. User closes settings panel
5. → `closeSettings()` calls `saveCurrentSettings()`
6. → `saveCurrentSettings()` builds settings object WITHOUT `window` property
7. → Calls `window.electronAPI.saveSettings(settings)` → `save-settings` IPC
8. → `main.js` handler: `currentSettings = settings` (COMPLETE REPLACEMENT!)
9. → The `window.alwaysOnTop = true` is LOST because it wasn't in the new settings object
10. → `saveSettings(currentSettings)` writes the settings WITHOUT `window.alwaysOnTop`
11. On next app restart → `loadSettings()` returns default `window.alwaysOnTop: false`

### Why the Bug Wasn't Caught

1. The main.js implementation is correct - it properly saves `window.alwaysOnTop` when the checkbox is toggled
2. The bug only manifests when:
   - User enables Always on Top
   - User then closes the settings panel (which triggers `saveCurrentSettings()`)
   - The `save-settings` IPC handler OVERWRITES the entire settings object
3. The test `experiments/test-always-on-top-persistence.js` tested the main.js code in isolation, not the full renderer → main IPC flow

### Subsequent Commits

Additional commits added more settings to `saveCurrentSettings()`:
- `bab5b23` - Added `effectsEnabled` to audio and playback state
- `8a62ec7` - Added `ui.showControlsHint`

But NO commit ever added `window.alwaysOnTop` to the `saveCurrentSettings()` function!

## Root Cause

**Two-fold problem:**

1. **Architectural flaw:** The `save-settings` IPC handler completely replaces `currentSettings` instead of merging. This means any property not included in the save call is lost.

2. **Missing implementation:** The `saveCurrentSettings()` function in renderer.js never included the `window` settings section.

## Proposed Fix

Include `window` settings in the `saveCurrentSettings()` function to ensure they're preserved when saving other settings.
