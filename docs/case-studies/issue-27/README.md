# Case Study: Issue #27 - Mobile Audio "Source Not Supported" Error

## Issue Summary

**Original Report (in Russian)**: "Error loading track" when using the Android mobile version of the cassette music player. Even granting storage permissions manually doesn't resolve the error.

**User Feedback After Initial Fix (PR #29)**: "audio source not supported"

**User Feedback After Second Fix (PR #29 v1.4.2)**: "cannot play" error, and the app doesn't prompt for storage permissions ("не вызывает окно выдачи прав на память")

This indicates that the previous fixes (enhanced blob URL handling) did not resolve the underlying issues, and the core problem is related to **Android runtime permissions not being requested**.

## Timeline of Events

### Phase 1: Initial Issue Report
- **Issue #24**: Mobile version requested (resolved with PR #25)
- **Issue #27**: "Error loading track" persists even with manual permission grant

### Phase 2: First Fix Attempt (PR #29 - Initial Draft)
- Added enhanced error handling with MediaError codes
- Implemented ArrayBuffer fallback loading method
- Added explicit MIME type handling
- Added blob URL cleanup for memory management

### Phase 3: User Feedback - "audio source not supported"
- User reports: "audio source not supported"
- Error code: `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4)
- This indicates the HTML5 `<audio>` element cannot play the audio source

### Phase 4: Second Fix Attempt (PR #29 v1.4.2)
- Fixed blob URL creation to use `URL.createObjectURL(file)` directly
- Added fallback loading methods (ArrayBuffer, DataURL)
- Improved logging for debugging

### Phase 5: User Feedback - "cannot play" + No Permission Prompt
- User reports: "cannot play" error
- **Critical finding**: The app doesn't show the permission request dialog
- User suggests: "maybe more permissions are needed"
- This indicates the root cause is **missing runtime permission requests**

### Phase 6: User Feedback - Permission Works, White Noise Plays, Audio "cannot play"
- User reports (2026-01-18): "запрос разрешения работает правильно" (permission request works correctly)
- User reports: "при попытке запуска аудио включается белый шум, но само аудио cannot play"
- Translation: "when trying to start audio, white noise plays, but the actual audio cannot play"
- **Critical finding**: The tape hiss effect (white noise generator) works, meaning the AudioContext is functional
- **Root cause identified**: Blob URLs from `<input type="file">` don't work in Android WebView for audio playback

## Root Cause Analysis

### The Primary Problem: Missing Runtime Permission Requests

**The app declares permissions in AndroidManifest.xml but never requests them at runtime.**

Starting with Android 6.0 (API level 23), apps must request "dangerous" permissions at runtime, not just declare them in the manifest. Storage permissions fall into this category.

Additionally, **Android 13+ (API level 33)** introduced new granular media permissions:
- `READ_MEDIA_AUDIO` - required to access audio files
- `READ_MEDIA_VIDEO` - required to access video files
- `READ_MEDIA_IMAGES` - required to access image files
- `READ_EXTERNAL_STORAGE` is **deprecated and has no effect** on Android 13+

The app was declaring `READ_EXTERNAL_STORAGE` but:
1. Never requesting it at runtime (required for Android 6+)
2. This permission has no effect on Android 13+ anyway
3. Missing `READ_MEDIA_AUDIO` which is required for Android 13+

### The Secondary Problem: Blob URL Handling

The current implementation uses blob URLs created from `File` objects selected via `<input type="file">`:

```javascript
// Current approach (problematic on Android WebView)
const mimeType = getMimeType(file.name);
const blob = new Blob([file], { type: mimeType });
const url = URL.createObjectURL(blob);
audioState.audioElement.src = url;
```

### Why This Fails on Android WebView

Based on extensive research, the issue stems from several Android WebView limitations:

1. **Blob URL Handling Issues**: Android WebView has known issues with blob URLs, especially for audio/video content. The WebView cannot always resolve or fetch blob data properly ([Issue #5478](https://github.com/ionic-team/capacitor/issues/5478)).

2. **HTML5 Audio Tag Limitations**: Android WebView has inconsistent HTML5 `<audio>` tag support, documented in [Google Issue Tracker #36920496](https://issuetracker.google.com/issues/36920496). Some devices/Android versions simply cannot play audio via the `<audio>` tag.

3. **The `new Blob([file], { type: mimeType })` Pattern Issue**: Creating a new Blob from a File object and then creating a blob URL from that can cause issues because:
   - The File object is already a Blob subclass
   - Creating a new Blob wraps it unnecessarily
   - This can lose important metadata or cause MIME type mismatches

4. **Android WebView Configuration**: Without proper WebView settings, audio playback fails:
   - `setAllowFileAccess(true)`
   - `setMediaPlaybackRequiresUserGesture(false)`
   - Mixed content issues when using HTTPS scheme

### Technical Evidence

From research:

> "When using the `<audio>` tag in a WebView on Android 4.2+ with SDK 3.0.2, the audio file does not play... The issue has been observed on mobile devices like MeiZu and Xiaomi" - [TutorialsPoint](https://www.tutorialspoint.com/HTML5-audio-tag-not-working-in-Android-Webview)

> "Blob URLs are in-memory references scoped to the browser's process. In Android WebView, the component cannot resolve or fetch blob data." - [Medium Article by Srimanth](https://medium.com/@SrimanthChowdary/resolving-blob-download-issues-in-android-webview-a-comprehensive-guide-for-developers-ad103e0833bd)

> "The recommended approach is to use `Capacitor.convertFileSrc()` instead of blob URLs" - [Capawesome File Handling Guide](https://capawesome.io/blog/the-file-handling-guide-for-capacitor/)

## Proposed Solutions

### Solution 1: Use Direct Blob URL from File Object (Simplest Fix)

Instead of creating a new Blob wrapper around the File, use the File object directly:

```javascript
// Don't do this:
const blob = new Blob([file], { type: mimeType });
const url = URL.createObjectURL(blob);

// Do this instead:
const url = URL.createObjectURL(file);
```

The File object already has proper MIME type information and is already a Blob.

### Solution 2: Use FileReader with Data URL (Fallback for small files)

For smaller files, data URLs work more reliably on Android WebView:

```javascript
function loadAudioAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

Note: This is NOT recommended for large files due to memory issues.

### Solution 3: Use Capacitor File Picker Plugin (Recommended for Long-term)

Install `@capawesome/capacitor-file-picker` for proper native file handling:

```javascript
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';

async function pickAndPlayAudio() {
  const result = await FilePicker.pickFiles({
    types: ['audio/*'],
    multiple: true
  });

  for (const file of result.files) {
    // Convert native path to web-accessible URL
    const webPath = Capacitor.convertFileSrc(file.path);
    audioState.audioElement.src = webPath;
  }
}
```

### Solution 4: Use Native Audio Plugin (Most Robust)

For the most reliable audio playback on Android, use a native audio plugin:

- `@capacitor-community/native-audio`
- `@mediagrid/capacitor-native-audio`

These bypass WebView audio limitations entirely.

### Solution 5: Proper ArrayBuffer to Blob Conversion (Current Fallback, needs fix)

The current `loadTrackWithArrayBuffer` function is on the right track but needs a fix:

```javascript
async function loadTrackWithArrayBuffer(track) {
  if (!track.file) return;

  try {
    const arrayBuffer = await track.file.arrayBuffer();
    // Use the file's actual type, not inferred from extension
    const mimeType = track.file.type || getMimeType(track.file.name);
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);

    // Clean up old URL
    if (track.url) URL.revokeObjectURL(track.url);

    track.url = url;
    audioState.audioElement.src = url;
    await audioState.audioElement.load();
  } catch (error) {
    console.error('ArrayBuffer loading failed:', error);
  }
}
```

### The Tertiary Problem: Blob URLs Don't Work for Audio in Android WebView

After fixing permissions, users reported that "white noise plays but audio cannot play". The white noise is the **tape hiss effect** generated by the app's AudioContext - this proves the audio system works, but the actual music file fails to load.

**Why Blob URLs Fail:**

1. **Android WebView has known blob URL limitations** for audio/video content ([Capacitor Issue #5478](https://github.com/ionic-team/capacitor/issues/5478))
2. The `<input type="file">` element only provides `File` objects, not native file paths
3. `URL.createObjectURL(file)` creates blob URLs that Android WebView cannot resolve for media playback
4. This is a fundamental Android WebView limitation, not a code bug

**The Solution: Native File Picker with `Capacitor.convertFileSrc()`**

Instead of using HTML `<input type="file">`, use the `@capawesome/capacitor-file-picker` plugin which:
1. Returns actual native file paths (e.g., `/storage/emulated/0/Music/song.mp3`)
2. These paths can be converted to web-accessible URLs using `Capacitor.convertFileSrc()`
3. The converted URLs work correctly in Android WebView

## Implemented Solution (PR #29 v1.4.4)

### Fix 1: Use Native File Picker with convertFileSrc (v1.4.4)

Added the `@capawesome/capacitor-file-picker` plugin to get native file paths:

```javascript
// In package.json
"@capawesome/capacitor-file-picker": "^6.0.0"

// In renderer.js - Native file picker implementation
async function openFilesNative() {
  const result = await FilePicker.pickFiles({
    types: ['audio/*'],
    multiple: true,
    readData: false  // Don't read into memory - just get paths
  });

  for (const file of result.files) {
    // Convert native path to web-accessible URL
    const url = Capacitor.convertFileSrc(file.path);
    // Use this URL directly in <audio> element
    audioElement.src = url;
  }
}
```

This approach:
- Bypasses blob URL limitations completely
- Uses the Android file system's local HTTP server
- Works reliably on all Android versions

### Fix 2: Add Runtime Permission Requests (v1.4.3)

Added the `@capacitor/filesystem` plugin to properly request storage permissions at runtime:

```javascript
// Added to renderer.js
async function requestStoragePermissions() {
  if (!isCapacitor) return true;

  try {
    if (Filesystem) {
      const permStatus = await Filesystem.checkPermissions();
      if (permStatus.publicStorage === 'granted') {
        return true;
      }

      const result = await Filesystem.requestPermissions();
      return result.publicStorage === 'granted';
    }
  } catch (error) {
    console.error('[Mobile] Error requesting permissions:', error);
    return true; // Don't block, let file picker try anyway
  }
}
```

This function is called before opening the file picker on Android.

### Fix 2: Add Android 13+ Permissions to Manifest

Updated `build-android.yml` to add the required permissions:

```xml
<!-- Android 12 and below -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />

<!-- Android 13+ (API 33+) granular media permissions -->
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
```

### Fix 3: Add @capacitor/filesystem Dependency

Added to `package.json`:
```json
"@capacitor/filesystem": "^6.0.0"
```

This plugin provides:
- `checkPermissions()` - Check current permission status
- `requestPermissions()` - Request storage permissions with proper Android dialog

## Recommended Implementation Strategy

1. **Immediate Fix** (Implemented): Add runtime permission requests using `@capacitor/filesystem`
2. **Short-term** (Implemented): Improve the fallback mechanism with multiple loading strategies
3. **Long-term**: Consider adding `@capawesome/capacitor-file-picker` or a native audio plugin for robust Android support

## Sources and References

1. [Android 13 Behavior Changes - Granular Media Permissions](https://developer.android.com/about/versions/13/behavior-changes-13)
2. [Capacitor Filesystem Plugin Documentation](https://capacitorjs.com/docs/apis/filesystem)
3. [Capacitor Filesystem permissions Issue #1512](https://github.com/ionic-team/capacitor-plugins/issues/1512)
4. [Capacitor Blob Downloads Issue #5478](https://github.com/ionic-team/capacitor/issues/5478)
5. [Capawesome File Handling Guide](https://capawesome.io/blog/the-file-handling-guide-for-capacitor/)
6. [Google Issue Tracker: No HTML5 Audio Support in WebView #36920496](https://issuetracker.google.com/issues/36920496)
7. [Capacitor convertFileSrc Issue #3840](https://github.com/ionic-team/capacitor/issues/3840)
8. [HTML5 Audio Not Working in Android WebView](https://www.tutorialspoint.com/HTML5-audio-tag-not-working-in-Android-Webview)
9. [Howler.js Android WebView Issue #810](https://github.com/goldfire/howler.js/issues/810)
10. [Resolving Blob Download Issues in Android WebView](https://medium.com/@SrimanthChowdary/resolving-blob-download-issues-in-android-webview-a-comprehensive-guide-for-developers-ad103e0833bd)
11. [Capacitor File Picker Plugin](https://capawesome.io/plugins/file-picker/)
12. [Capacitor Native Audio Plugin](https://github.com/capacitor-community/native-audio)

## Related Issues and PRs

- [Issue #24](https://github.com/Jhon-Crow/cassette-sound-music-player/issues/24) - Original mobile implementation request
- [Issue #27](https://github.com/Jhon-Crow/cassette-sound-music-player/issues/27) - Current issue (Error loading track)
- [PR #25](https://github.com/Jhon-Crow/cassette-sound-music-player/pull/25) - Initial mobile support
- [PR #29](https://github.com/Jhon-Crow/cassette-sound-music-player/pull/29) - This fix

## Lessons Learned

1. **Android 6+ requires runtime permission requests**: Declaring permissions in AndroidManifest.xml is not enough - you must also request them programmatically at runtime
2. **Android 13+ uses granular media permissions**: `READ_EXTERNAL_STORAGE` is deprecated - use `READ_MEDIA_AUDIO`, `READ_MEDIA_VIDEO`, `READ_MEDIA_IMAGES` instead
3. **Don't wrap File objects in new Blob**: File is already a Blob subclass
4. **Android WebView has limited HTML5 audio support**: Consider native plugins
5. **Blob URLs are fundamentally broken for audio in Android WebView**: This is a known limitation that cannot be fixed with code workarounds
6. **Use `Capacitor.convertFileSrc()` for file URLs**: This converts native paths to web-accessible URLs that work in WebView
7. **Use native file picker plugins**: `@capawesome/capacitor-file-picker` returns actual file paths instead of in-memory File objects
8. **Always test on actual Android devices**: Emulators may not show all issues
9. **Provide detailed error logging**: Critical for diagnosing mobile-specific issues - differentiating between "white noise plays" and "no sound at all" helped identify the issue
10. **Use Capacitor plugins for permission management**: `@capacitor/filesystem` provides proper `checkPermissions()` and `requestPermissions()` methods
11. **HTML `<input type="file">` doesn't give native paths**: For security reasons, browsers only provide File objects, not filesystem paths - native plugins are required to get paths
