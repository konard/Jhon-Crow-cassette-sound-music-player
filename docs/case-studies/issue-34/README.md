# Case Study: Issue #34 - Always on Top Persistence Bug

## Summary

**Issue:** The "Always on Top" setting does not persist across application restarts.

**Root Cause:** The `saveCurrentSettings()` function in `renderer.js` did not include the `window.alwaysOnTop` setting, causing it to be overwritten when the settings panel was closed.

**Fix:** Modified `saveCurrentSettings()` to include the `window` settings section by querying the current state from the main process.

## Bug Report

- **Issue URL:** https://github.com/Jhon-Crow/cassette-sound-music-player/issues/34
- **PR URL:** https://github.com/Jhon-Crow/cassette-sound-music-player/pull/35
- **Reported by:** @Jhon-Crow
- **Date:** January 23, 2026

## Technical Analysis

### Architecture Overview

The Cassette Music Player uses Electron with a split architecture:
- **Main Process** (`src/main.js`): Handles window management, file system, and settings persistence
- **Renderer Process** (`src/renderer.js`): Handles UI, audio playback, and user interactions
- **IPC Bridge** (`src/preload.js`): Secure communication between processes

### Settings Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                            │
│                                                             │
│  currentSettings = {                                        │
│    audio: {...},                                            │
│    appearance: {...},                                       │
│    window: { alwaysOnTop: true/false },  ← STORED HERE     │
│    ui: {...},                                               │
│    playback: {...}                                          │
│  }                                                          │
│                                                             │
│  IPC Handlers:                                              │
│  ├─ 'save-settings': currentSettings = settings; save()    │
│  ├─ 'set-always-on-top': window.alwaysOnTop = value; save()│
│  └─ 'get-always-on-top': return isAlwaysOnTop()            │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ IPC
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS                         │
│                                                             │
│  saveCurrentSettings():                                     │
│    settings = {                                             │
│      audio: {...},                                          │
│      appearance: {...},                                     │
│      // MISSING: window: { alwaysOnTop: ... }  ← BUG!      │
│      ui: {...},                                             │
│      playback: {...}                                        │
│    }                                                        │
│    electronAPI.saveSettings(settings)  ← OVERWRITES ALL    │
└─────────────────────────────────────────────────────────────┘
```

### Bug Mechanism

1. User enables "Always on Top" checkbox
2. → `setAlwaysOnTop(true)` IPC call
3. → Main process saves `currentSettings.window.alwaysOnTop = true` ✅
4. User closes the settings panel
5. → `closeSettings()` calls `saveCurrentSettings()`
6. → `saveCurrentSettings()` builds new settings object **WITHOUT** `window` property
7. → `save-settings` IPC call with incomplete settings
8. → Main process: `currentSettings = settings` **(COMPLETE REPLACEMENT!)**
9. → `window.alwaysOnTop` is **LOST**
10. → Settings file is written without `window.alwaysOnTop`
11. On restart → Default value `false` is used

### Code Evidence

**Before (Bug):** `src/renderer.js:217-253`
```javascript
function saveCurrentSettings() {
  const settings = {
    audio: { ... },
    appearance: { ... },
    ui: { ... },
    playback: { ... }
    // MISSING: window: { alwaysOnTop: ... }
  };
  window.electronAPI.saveSettings(settings);
}
```

**After (Fix):**
```javascript
async function saveCurrentSettings() {
  // Get current always-on-top state from main process to preserve it
  let alwaysOnTop = false;
  if (window.electronAPI.getAlwaysOnTop) {
    alwaysOnTop = await window.electronAPI.getAlwaysOnTop();
  }

  const settings = {
    audio: { ... },
    appearance: { ... },
    window: {
      alwaysOnTop: alwaysOnTop  // NOW INCLUDED!
    },
    ui: { ... },
    playback: { ... }
  };
  window.electronAPI.saveSettings(settings);
}
```

## Test Results

The fix was verified using `experiments/test-always-on-top-persistence-fix.js`:

```
=== TEST: Old Behavior (BUG) ===
File after setAlwaysOnTop: true
After old saveCurrentSettings - File contents window property: undefined
→ BUG CONFIRMED ✓

=== TEST: New Behavior (FIX) ===
After new saveCurrentSettings - alwaysOnTop: true
After restart - alwaysOnTop: true
→ PASS ✓

=== TEST: Toggle Off Persistence ===
After disabling and save - alwaysOnTop: false
After restart - alwaysOnTop: false
→ PASS ✓
```

## Timeline

| Date | Event | Commit |
|------|-------|--------|
| Jan 1, 2026 | Initial always-on-top feature added (no persistence) | `123d450` |
| Jan 1, 2026 | Settings persistence added (bug introduced here) | `9fa8315` |
| Jan 23, 2026 | Bug reported by @Jhon-Crow | Issue #34 |
| Jan 23, 2026 | Initial investigation (incorrectly concluded bug didn't exist) | PR #35 v1 |
| Jan 23, 2026 | @Jhon-Crow confirmed persistence does NOT work | PR #35 comment |
| Jan 23, 2026 | Deep investigation found actual root cause | PR #35 v2 |
| Jan 23, 2026 | Fix implemented and verified | This commit |

## Lessons Learned

1. **Partial saves are dangerous:** The `save-settings` IPC handler completely replaces `currentSettings`. This design is fragile because any caller that forgets to include a property will lose it.

2. **Testing in isolation can miss integration bugs:** The original test (`experiments/test-always-on-top-persistence.js`) tested the main process code in isolation and passed. But it didn't test the full renderer → main process IPC flow where the bug actually occurred.

3. **Commit messages can be misleading:** The commit `9fa8315` claimed to add persistence for "always-on-top" but the implementation was incomplete in `renderer.js`.

## Possible Future Improvements

1. **Deep merge in save-settings handler:** Instead of complete replacement, merge incoming settings with existing settings.

2. **Single source of truth:** Have the renderer track `window.alwaysOnTop` in CONFIG and include it in saves, or have the main process be the sole authority on window settings.

3. **Type-safe settings:** Use TypeScript interfaces to ensure all settings properties are included when saving.

## Files Changed

- `src/renderer.js`: Added `window` property to `saveCurrentSettings()` function
- `experiments/test-always-on-top-persistence-fix.js`: New test for the fix
- `docs/case-studies/issue-34/`: Case study documentation
