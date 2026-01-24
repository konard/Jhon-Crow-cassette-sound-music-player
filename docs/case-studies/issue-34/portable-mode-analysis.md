# Portable Mode Analysis - Issue #34

## User Report (Jan 24, 2026)

User (@Jhon-Crow) reports:
> я использую собранный portable exe последней версии (из этой ветки).
> всё ещё не работает
> 
> Translation: "I am using the compiled portable exe of the latest version (from this branch). Still not working"

This is the fourth report that the fix does not work, specifically with the **portable .exe build**.

## Build Verification

### CI Build Status
All builds passing successfully:
- Build run: 21305212219
- Commit: a137f44e5097823bf533fc2710cd36b5a26082d4
- Build artifact: `Cassette Music Player-1.4.4-portable.exe` (69.8 MB)
- Build completed: 2026-01-24T00:01:01Z

### Build Process
```bash
npm run build:portable
# Runs: electron-builder --win portable --publish never
```

The build correctly includes all source files and the fix is present in the built artifact.

## Root Cause: Portable App Settings Storage Issue

### The Problem

**electron-builder's portable mode is NOT truly portable** when it comes to settings storage:

1. When a portable .exe is executed, it unpacks itself into `%temp%` directory
2. Settings are stored in `%appdata%` via `app.getPath('userData')`
3. When the app is launched from a USB drive or different computer, settings are stored in the **new computer's** `%appdata%`
4. When the app is launched again on the **original computer**, it reads from the **original computer's** `%appdata%`
5. **Result:** Settings appear to be lost because they're in a different location than expected

### Technical Details

**Current Implementation:**
```javascript
// src/main.js:8
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
```

**Default userData Paths:**
- Windows: `C:\Users\<username>\AppData\Roaming\cassette-music-player\settings.json`
- macOS: `~/Library/Application Support/cassette-music-player/settings.json`
- Linux: `~/.config/cassette-music-player/settings.json`

**The Issue:**
- These paths are **machine-specific** and **user-specific**
- A portable app running from a USB drive will create different settings files on each computer
- Settings do NOT travel with the portable executable

### Why This Matters

User scenarios where this fails:
1. **Testing on multiple machines:** User tests on Computer A, settings saved. Tests on Computer B, settings appear lost.
2. **USB drive usage:** Running from a USB drive on different computers
3. **Multiple user accounts:** Same computer, different Windows user accounts
4. **Reinstalling Windows:** After OS reinstall, old settings are not accessible

## Evidence from Research

### electron-builder Issues

From Issue [#1612](https://github.com/electron-userland/electron-builder/issues/1612) - "portable" it's not so portable:
> "When a portable version is executed, portable unpack itself into %temp% directory and settings into %appdata%... when application is launched from a portable drive, all settings are lost when launched on a different computer from the same drive."

From Issue [#6473](https://github.com/electron-userland/electron-builder/issues/6473) - Make portable a true portable:
> Portable apps should store settings next to the executable, not in system directories

### Electron Environment Variables

For portable executables, electron-builder provides:
- `PORTABLE_EXECUTABLE_FILE`: Path to the portable executable
- `PORTABLE_EXECUTABLE_DIR`: Directory where the portable executable is located

## Possible Solutions

### Solution 1: Detect Portable Mode and Store Settings Next to Executable

```javascript
const { app } = require('electron');
const path = require('path');

function getSettingsPath() {
  // Check if running as portable
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    // Store settings.json next to the portable .exe
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'settings.json');
  }
  // Default: use userData directory
  return path.join(app.getPath('userData'), 'settings.json');
}

const SETTINGS_FILE = getSettingsPath();
```

**Pros:**
- True portability - settings travel with the executable
- No changes needed for installer version
- Easy for users to find and edit settings

**Cons:**
- Settings file in the same directory as .exe (some users may not like this)
- Requires write permissions in the executable directory
- May not work if running from read-only media (CD-ROM)

### Solution 2: Store Settings in User's Documents Folder

```javascript
function getSettingsPath() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    // Store in user's Documents folder with app subfolder
    const documentsPath = app.getPath('documents');
    return path.join(documentsPath, 'Cassette Music Player', 'settings.json');
  }
  return path.join(app.getPath('userData'), 'settings.json');
}
```

**Pros:**
- User-accessible location
- Usually has write permissions
- Survives OS reinstalls if Documents is on a separate partition

**Cons:**
- Still not truly portable (different Documents folder on each computer)
- Users need to manually back up settings

### Solution 3: Use a Portable Data Folder

```javascript
function getSettingsPath() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    // Create a 'data' folder next to the executable
    const dataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'settings.json');
  }
  return path.join(app.getPath('userData'), 'settings.json');
}
```

**Pros:**
- Cleaner organization (settings in 'data' subfolder)
- True portability
- Easy to find and back up

**Cons:**
- Still requires write permissions
- Creates additional directory

## Recommended Solution

**Solution 3** (Portable Data Folder) is recommended because:
1. Provides true portability for the portable build
2. Keeps settings organized in a 'data' folder
3. Makes it obvious where settings are stored
4. Allows users to easily back up the entire 'data' folder
5. Doesn't affect the installer version (continues using userData)

## Testing Requirements

To verify the fix works with portable builds:

1. **Test on single computer:**
   - Run portable .exe
   - Enable "Always on Top"
   - Close app
   - Check that `data/settings.json` exists next to the .exe
   - Reopen app
   - Verify "Always on Top" is still enabled

2. **Test portability:**
   - Copy the portable .exe and `data` folder to a different location
   - Run the app
   - Verify settings are preserved

3. **Test on multiple computers:**
   - Copy portable .exe and `data` folder to USB drive
   - Run on Computer A, enable "Always on Top"
   - Run on Computer B
   - Verify "Always on Top" is still enabled

## Next Steps

1. Implement Solution 3 (Portable Data Folder)
2. Add debug logging to show where settings file is located
3. Update documentation to explain portable vs installer differences
4. Ask user to test the updated portable build

## References

- [electron-builder Issue #1612: "portable" it's not so portable](https://github.com/electron-userland/electron-builder/issues/1612)
- [electron-builder Issue #6473: Make portable a true portable](https://github.com/electron-userland/electron-builder/issues/6473)
- [Electron app.getPath() documentation](https://www.electronjs.org/docs/latest/api/app#appgetpathname)
- [How to store user data in Electron - Cameron Nokes](https://cameronnokes.com/blog/how-to-store-user-data-in-electron/)
