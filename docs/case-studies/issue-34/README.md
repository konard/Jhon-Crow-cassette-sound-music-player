# Case Study: Issue #34 - Always on Top Persistence Bug

## Summary

**Issue:** The "Always on Top" setting does not persist across application restarts.

**Initial Root Cause (Incomplete):** The `saveCurrentSettings()` function in `renderer.js` did not include the `window.alwaysOnTop` setting.

**Real Root Cause (Race Condition):** Even after adding `window.alwaysOnTop` to `saveCurrentSettings()`, a race condition exists due to the asynchronous nature of IPC:
1. When the user enables "Always on Top", `set-always-on-top` IPC is sent (fire-and-forget)
2. When the user immediately closes settings, `saveCurrentSettings()` queries `getAlwaysOnTop()`
3. Due to IPC timing, `getAlwaysOnTop()` may return the **OLD value** before `set-always-on-top` has finished
4. The `save-settings` handler then **overwrites** the correct value with the stale value

**Final Fix:** Modified the `save-settings` IPC handler in `main.js` to **preserve** the `window` settings from `currentSettings` (which is always up-to-date thanks to `set-always-on-top`), instead of replacing them with the renderer's potentially stale value.

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

### IPC Communication Patterns

The application uses two IPC patterns with different behaviors:

| Pattern | Method | Behavior |
|---------|--------|----------|
| Fire-and-forget | `ipcRenderer.send()` | No response, no waiting |
| Request-response | `ipcRenderer.invoke()` | Returns Promise, waits for response |

The bug involved a race condition between these two patterns.

### Race Condition Diagram

```
Timeline (milliseconds):
0ms   5ms   10ms
│     │     │
├─────┼─────┼─────────────────────────────────────────
│     │     │
│ [1] setAlwaysOnTop(true) sent via send() (fire-and-forget)
│     │
│ [2] getAlwaysOnTop() called via invoke()
│  │  │
│  │  └─► [3] getAlwaysOnTop() returns FALSE (old value!)
│  │      │
│  │      └─► [4] save-settings sent with { window: { alwaysOnTop: false } }
│  │
│  └─────────────► [5] set-always-on-top handler runs
│                  │   - Saves currentSettings.window.alwaysOnTop = true ✅
│                  │
│                  └──────────► [6] save-settings handler runs
│                              │   - REPLACES currentSettings with renderer's object
│                              │   - window.alwaysOnTop = false ❌ (OVERWRITES!)
│
└─► Final result: window.alwaysOnTop = false (BUG!)
```

### Bug Mechanism (Detailed)

1. User clicks "Always on Top" checkbox in settings
2. `setAlwaysOnTop(true)` is called via `ipcRenderer.send()` (fire-and-forget, no waiting)
3. User clicks close button (or clicks outside settings panel)
4. `closeSettings()` calls `saveCurrentSettings()`
5. `saveCurrentSettings()` calls `await getAlwaysOnTop()` to get current state
6. **RACE CONDITION:** `getAlwaysOnTop()` may return `false` if `set-always-on-top` hasn't finished
7. Renderer builds settings object with potentially stale `window.alwaysOnTop` value
8. `save-settings` IPC is sent with potentially wrong value
9. Main process `save-settings` handler replaces entire `currentSettings` object
10. If `save-settings` completes **AFTER** `set-always-on-top`, it **OVERWRITES** the correct value!

### Code Evidence

**The Initial Fix (Incomplete) in `renderer.js`:**
```javascript
async function saveCurrentSettings() {
  // Get current always-on-top state from main process to preserve it
  let alwaysOnTop = false;
  if (window.electronAPI.getAlwaysOnTop) {
    alwaysOnTop = await window.electronAPI.getAlwaysOnTop();
  }

  const settings = {
    // ... other settings
    window: {
      alwaysOnTop: alwaysOnTop  // May have stale value due to race condition!
    },
  };
  window.electronAPI.saveSettings(settings);
}
```

**The Buggy Handler in `main.js`:**
```javascript
ipcMain.on('save-settings', (event, settings) => {
  currentSettings = settings;  // COMPLETE REPLACEMENT - loses any recent updates!
  saveSettings(settings);
});
```

**The Final Fix in `main.js`:**
```javascript
ipcMain.on('save-settings', (event, settings) => {
  // Merge incoming settings with current settings
  // IMPORTANT: Preserve window settings from currentSettings to avoid race conditions
  currentSettings = {
    audio: { ...currentSettings?.audio, ...settings.audio },
    appearance: { ...currentSettings?.appearance, ...settings.appearance },
    window: { ...currentSettings?.window },  // PRESERVE from main process!
    ui: { ...currentSettings?.ui, ...settings.ui },
    playback: { ...currentSettings?.playback, ...settings.playback }
  };
  saveSettings(currentSettings);
});
```

## Test Results

### Race Condition Test (`experiments/test-fix-race-condition.js`)

```
=== TEST: OLD BUGGY BEHAVIOR ===
Timing: set-always-on-top=5ms, getAlwaysOnTop=2ms, save-settings=10ms

  [Main] get-always-on-top(): returning false after 2ms
  [Renderer] saveCurrentSettings: got alwaysOnTop=false
  [Main] set-always-on-top(true): saved after 5ms
  [Main] save-settings (BUGGY): wrote window.alwaysOnTop=false after 10ms

5. Restart - alwaysOnTop: false
   Result: FAIL ✗ (confirms the bug)

=== TEST: FIXED BEHAVIOR ===
  [Main] get-always-on-top(): returning false after 2ms
  [Renderer] saveCurrentSettings: got alwaysOnTop=false
  [Main] set-always-on-top(true): saved after 5ms
  [Main] save-settings (FIXED): preserved window.alwaysOnTop=true after 10ms

5. Restart - alwaysOnTop: true
   Result: PASS ✓
```

## Timeline

| Date | Event | Details |
|------|-------|---------|
| Jan 1, 2026 | Initial always-on-top feature added | `set-always-on-top` handler saves setting |
| Jan 1, 2026 | Settings persistence added | `save-settings` handler introduced with REPLACE semantics |
| Jan 23, 2026 | Bug reported by @Jhon-Crow | Issue #34 created |
| Jan 23, 2026 | First fix attempt | Added `window.alwaysOnTop` to `saveCurrentSettings()` |
| Jan 23, 2026 | Fix still not working | @Jhon-Crow confirmed persistence still broken |
| Jan 24, 2026 | Race condition discovered | Identified IPC timing issue |
| Jan 24, 2026 | Final fix implemented | Changed `save-settings` to preserve `window` settings |

## Lessons Learned

1. **Fire-and-forget IPC creates race conditions:** Using `ipcRenderer.send()` for settings that need immediate persistence, combined with other IPC calls that read the same settings, can lead to race conditions.

2. **Complete replacement is dangerous:** The `save-settings` handler's complete replacement of `currentSettings` means any concurrent updates from other handlers can be lost.

3. **The main process should be authoritative for its own state:** Window settings like `alwaysOnTop` are fundamentally main process state. The main process should be the single source of truth, and the renderer shouldn't be able to overwrite it with potentially stale data.

4. **Testing must account for real-world timing:** Synchronous tests may pass even when race conditions exist. Tests need to simulate realistic IPC timing to catch these issues.

5. **Multiple fix attempts may be needed:** The initial fix addressed the obvious issue (missing property) but missed the deeper race condition. Real-world testing by the user revealed the remaining problem.

## Design Recommendations

1. **Use merge semantics for settings updates:** Instead of complete replacement, merge incoming settings with existing settings.

2. **Separate concerns by ownership:** Window settings should only be updated via dedicated handlers (`set-always-on-top`), not through generic `save-settings`.

3. **Consider using `invoke` for confirmation:** If settings MUST be saved from the renderer, use `ipcRenderer.invoke()` for the checkbox change to confirm the save completed before allowing any other saves.

4. **Add logging for debugging:** Include verbose logging in IPC handlers to track the order of operations during debugging.

## Files Changed

- `src/main.js`: Changed `save-settings` handler to use merge semantics and preserve `window` settings
- `src/renderer.js`: Made `saveCurrentSettings()` async and added `window` property (retained for documentation)
- `experiments/test-fix-race-condition.js`: New test that verifies the race condition fix
- `experiments/test-real-race-condition.js`: Test that demonstrates the race condition
- `docs/case-studies/issue-34/README.md`: Updated case study with race condition analysis
