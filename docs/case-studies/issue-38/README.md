# Case Study: Issue #38 - Track Persistence Failure in Portable EXE

## Executive Summary

**Issue**: Shuffle, previous track history, and track persistence features are not working in the Windows portable executable build.

**Reporter**: @Jhon-Crow (Project owner)

**Status**: Under investigation

**Root Cause Hypothesis**: Settings persistence mechanism relies on `app.getPath('userData')` which may not work correctly in portable executable mode.

---

## Timeline of Events

### Phase 1: Initial Implementation (2026-01-23)

**23:48:56 UTC** - First commit: "Initial commit with task details"
- Commit SHA: `c2f6b63`
- CI Status: ✅ Build Windows Portable, ✅ Build Android APK

**23:53:45 UTC** - Second commit: "Fix shuffle and previous track functionality"
- Commit SHA: `039f0bd`
- CI Status: ✅ Build Windows Portable, ✅ Build Android APK

**23:59:08 UTC** - Third commit: "Revert 'Initial commit with task details'"
- Commit SHA: `be1baba`
- CI Status: ✅ Build Windows Portable, ✅ Build Android APK

### Phase 2: Track Persistence Fix (2026-01-24)

**00:57:35 UTC** - Fourth commit: "Fix track persistence on app restart"
- Commit SHA: `51cd895`
- CI Status: ✅ Build Windows Portable, ✅ Build Android APK
- **Key change**: Modified `restorePlaybackState()` to call `loadTrack()` instead of manually setting track index

**01:00:32 UTC** - Fifth commit: "Add experiment to test track persistence fix"
- Commit SHA: `34a4284`
- CI Status: ✅ Build Windows Portable, ✅ Build Android APK
- Added experiment script: `experiments/test-track-persistence.js`

**01:04:04 UTC** - Work session completed
- PR marked as ready for review
- All CI checks passing

### Phase 3: Portable EXE Issue Reported (2026-01-24)

**02:15:20 UTC** - Owner reports: "не работает в portable exe" (doesn't work in portable exe)
- Request for comprehensive case study analysis
- Request to download all logs and compile to `./docs/case-studies/issue-{id}`
- Request for timeline reconstruction, root cause analysis, and proposed solutions

**04:21:02 UTC** - New work session started
- PR converted back to draft mode
- Investigation phase begins

---

## Technical Analysis

### What Was Implemented

The solution addressed four requirements from issue #38:

1. ✅ **Previous track uses play history** - Added `trackHistory` array (50 track limit)
2. ✅ **Shuffle uses persistent order** - Added `shuffledPlaylist` array with Fisher-Yates shuffle
3. ✅ **Playback wraps at playlist boundaries** - Implemented modulo arithmetic for wrapping
4. ✅ **Track persists on app restart** - Fixed `restorePlaybackState()` to call `loadTrack()`

### Key Code Changes

#### 1. Audio State Structure (src/renderer.js:101-106)
```javascript
let audioState = {
  isPlaying: false,
  currentTrackIndex: 0,
  audioFiles: [],
  folderPath: null,
  trackHistory: [],           // NEW: History of played tracks for prev button
  shuffledPlaylist: []        // NEW: Persistent shuffled order when shuffle is enabled
};
```

#### 2. Settings Structure (src/main.js:32-37)
```javascript
playback: {
  folderPath: null,
  currentTrackIndex: 0,
  shuffleEnabled: false,      // NEW
  shuffledPlaylist: []        // NEW
}
```

#### 3. Settings Persistence (src/main.js:9)
```javascript
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
```

**⚠️ CRITICAL**: This is where the portable EXE issue likely originates.

---

## Root Cause Analysis

### The Problem with `app.getPath('userData')`

According to Electron documentation and research:

**Default userData Locations**:
- **macOS**: `~/Library/Application Support/<Your App Name>`
- **Windows**: `C:\Users\<you>\AppData\Local\<Your App Name>`
- **Linux**: `~/.config/<Your App Name>`

**Issues with Portable Executables**:

1. **Non-Relative Path**: `app.getPath('userData')` returns an absolute path in the system's AppData folder, not relative to the executable
2. **Permission Issues**: Some environments may restrict write access to AppData
3. **Not Truly Portable**: Settings are stored system-wide, not with the application
4. **Multi-User Conflicts**: Different users on the same machine would share settings location

### Why CI Passes But User Reports Failure

- **CI builds successfully** ✅ (compile-time check)
- **CI doesn't test runtime persistence** ❌ (no runtime tests in CI)
- **User runs portable EXE** → Settings fail to persist → Features don't work

### What Breaks in Portable Mode

When the portable EXE runs:
1. App tries to save settings to `C:\Users\<user>\AppData\Local\cassette-music-player\settings.json`
2. One of these scenarios occurs:
   - Path is not writable (permission denied)
   - Path doesn't exist and can't be created
   - Settings are written but app expects them relative to EXE
   - Settings are cleared on app restart
3. Features that depend on persistence fail:
   - Shuffled playlist order is lost
   - Track history is lost
   - Current track index is lost
   - Shuffle enabled state is lost

---

## Evidence Collection

### CI Logs Analysis
- All builds pass: ✅ No compilation errors
- No runtime tests exist
- Portable artifact is created successfully
- **Missing**: Runtime testing of settings persistence

### Build Configuration Analysis

From `package.json:77-79`:
```json
"portable": {
  "artifactName": "${productName}-${version}-portable.${ext}"
}
```

From `.github/workflows/build.yml:29-30`:
```bash
- name: Build portable exe
  run: npm run build:portable
```

**Observation**: No special portable configuration is set for userData path.

---

## Proposed Solutions

### Solution 1: Use Portable Paths (Recommended)

Detect portable mode and set userData path relative to executable:

```javascript
// In src/main.js, before SETTINGS_FILE is defined

const isPortable = process.env.PORTABLE_EXECUTABLE_DIR !== undefined;

if (isPortable) {
  // Set userData to be relative to the portable executable
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  app.setPath('userData', path.join(portableDir, 'UserData'));
}

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
```

**Pros**:
- True portability (settings travel with EXE)
- No AppData dependency
- Minimal code changes

**Cons**:
- Requires write permissions in portable directory
- May need to create UserData folder

### Solution 2: Fallback to Local Storage

Use a fallback mechanism when userData is not writable:

```javascript
function getSafeSettingsPath() {
  try {
    const userDataPath = app.getPath('userData');
    const testFile = path.join(userDataPath, '.write-test');

    // Test if we can write to userData
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    return path.join(userDataPath, 'settings.json');
  } catch (error) {
    // Fallback to executable directory
    return path.join(process.resourcesPath, '..', 'settings.json');
  }
}

const SETTINGS_FILE = getSafeSettingsPath();
```

**Pros**:
- Gracefully handles permission issues
- Works in both installed and portable modes

**Cons**:
- More complex logic
- Potential security concerns with fallback location

### Solution 3: Use electron-portable-paths Package

Install and use the `@warren-bank/electron-portable-paths` package:

```bash
npm install @warren-bank/electron-portable-paths
```

```javascript
const { makePortable } = require('@warren-bank/electron-portable-paths');

// Call before app is ready
makePortable();

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
```

**Pros**:
- Battle-tested solution
- Handles cross-platform differences
- Automatic detection of portable mode

**Cons**:
- Adds external dependency
- May be overkill for simple use case

### Solution 4: Environment Variable Configuration

Allow users to specify settings location via environment variable:

```javascript
const SETTINGS_DIR = process.env.CASSETTE_SETTINGS_DIR || app.getPath('userData');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// Ensure directory exists
if (!fs.existsSync(SETTINGS_DIR)) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}
```

**Pros**:
- User control
- Flexible deployment
- Can work with both modes

**Cons**:
- Requires user configuration
- Documentation burden

---

## Recommended Implementation

**Hybrid Approach**: Combine Solution 1 (portable detection) with Solution 2 (fallback):

```javascript
// src/main.js

const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Detect and configure portable mode
const isPortable = process.env.PORTABLE_EXECUTABLE_DIR !== undefined;

if (isPortable) {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  const portableUserData = path.join(portableDir, 'UserData');

  try {
    // Ensure UserData directory exists
    if (!fs.existsSync(portableUserData)) {
      fs.mkdirSync(portableUserData, { recursive: true });
    }

    // Set userData path for portable mode
    app.setPath('userData', portableUserData);
    console.log('[Portable Mode] Settings will be stored in:', portableUserData);
  } catch (error) {
    console.error('[Portable Mode] Failed to set userData path:', error);
    // Fall back to default behavior
  }
}

// Settings file path (works for both modes)
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
```

**Testing Strategy**:
1. Create experiment script to test portable mode settings
2. Build portable EXE locally
3. Run portable EXE and verify settings persist across restarts
4. Test shuffle, history, and track persistence features
5. Verify no settings files created in AppData

---

## Next Steps

1. ✅ Create case study documentation
2. ⏳ Implement portable mode detection and path configuration
3. ⏳ Create experiment script for portable mode testing
4. ⏳ Test locally with portable build
5. ⏳ Update PR with fix
6. ⏳ Request user testing of portable EXE
7. ⏳ Document portable mode behavior in README

---

## References

- [How to store user data in Electron - Cameron Nokes](https://cameronnokes.com/blog/how-to-store-user-data-in-electron/)
- [electron-store - npm](https://www.npmjs.com/package/electron-store)
- [Electron app API Documentation](https://www.electronjs.org/docs/latest/api/app)
- [electron-portable-paths - GitHub](https://github.com/warren-bank/electron-portable-paths)
- [Is it possible to set PORTABLE_EXECUTABLE_DIR to a different path? - GitHub Issue](https://github.com/electron-userland/electron-builder/issues/3799)

---

## Additional Notes

### User Feedback Requirements

From PR comment by @Jhon-Crow:
> "Please download all logs and data related about the issue to this repository, make sure we compile that data to `./docs/case-studies/issue-{id}` folder, and use it to do deep case study analysis (also make sure to search online for additional facts and data), in which we will reconstruct timeline/sequence of events, find root causes of the problem, and propose possible solutions."

**Completed**:
- ✅ Downloaded solution draft log (410KB)
- ✅ Collected CI run data
- ✅ Collected PR diff
- ✅ Researched Electron portable mode best practices
- ✅ Reconstructed timeline
- ✅ Analyzed root cause
- ✅ Proposed multiple solutions

**Status**: Ready for implementation phase
