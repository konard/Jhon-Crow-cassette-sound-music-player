# Case Study: Issue #27 - Mobile Audio "Source Not Supported" Error

## Issue Summary

**Original Report (in Russian)**: "Error loading track" when using the Android mobile version of the cassette music player. Even granting storage permissions manually doesn't resolve the error.

**User Feedback After Initial Fix (PR #29)**: "audio source not supported"

This indicates the initial fix (enhanced blob URL handling and error messages) did not resolve the underlying audio playback issue on Android.

## Timeline of Events

### Phase 1: Initial Issue Report
- **Issue #24**: Mobile version requested (resolved with PR #25)
- **Issue #27**: "Error loading track" persists even with manual permission grant

### Phase 2: First Fix Attempt (PR #29 - Initial Draft)
- Added enhanced error handling with MediaError codes
- Implemented ArrayBuffer fallback loading method
- Added explicit MIME type handling
- Added blob URL cleanup for memory management

### Phase 3: User Feedback
- User reports: "audio source not supported"
- Error code: `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4)
- This indicates the HTML5 `<audio>` element cannot play the audio source

## Root Cause Analysis

### The Problem

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

## Recommended Implementation Strategy

1. **Immediate Fix**: Remove the unnecessary `new Blob([file], { type: mimeType })` wrapper in `openFilesWeb()`. Use `URL.createObjectURL(file)` directly.

2. **Short-term**: Improve the fallback mechanism to try multiple loading strategies.

3. **Long-term**: Consider adding `@capawesome/capacitor-file-picker` or a native audio plugin for robust Android support.

## Sources and References

1. [Capacitor Blob Downloads Issue #5478](https://github.com/ionic-team/capacitor/issues/5478)
2. [Capawesome File Handling Guide](https://capawesome.io/blog/the-file-handling-guide-for-capacitor/)
3. [Google Issue Tracker: No HTML5 Audio Support in WebView #36920496](https://issuetracker.google.com/issues/36920496)
4. [Capacitor convertFileSrc Issue #3840](https://github.com/ionic-team/capacitor/issues/3840)
5. [HTML5 Audio Not Working in Android WebView](https://www.tutorialspoint.com/HTML5-audio-tag-not-working-in-Android-Webview)
6. [Howler.js Android WebView Issue #810](https://github.com/goldfire/howler.js/issues/810)
7. [Resolving Blob Download Issues in Android WebView](https://medium.com/@SrimanthChowdary/resolving-blob-download-issues-in-android-webview-a-comprehensive-guide-for-developers-ad103e0833bd)
8. [Capacitor File Picker Plugin](https://capawesome.io/plugins/file-picker/)
9. [Capacitor Native Audio Plugin](https://github.com/capacitor-community/native-audio)

## Related Issues and PRs

- [Issue #24](https://github.com/Jhon-Crow/cassette-sound-music-player/issues/24) - Original mobile implementation request
- [Issue #27](https://github.com/Jhon-Crow/cassette-sound-music-player/issues/27) - Current issue (Error loading track)
- [PR #25](https://github.com/Jhon-Crow/cassette-sound-music-player/pull/25) - Initial mobile support
- [PR #29](https://github.com/Jhon-Crow/cassette-sound-music-player/pull/29) - This fix

## Lessons Learned

1. **Don't wrap File objects in new Blob**: File is already a Blob subclass
2. **Android WebView has limited HTML5 audio support**: Consider native plugins
3. **Blob URLs are problematic on Android**: Use `Capacitor.convertFileSrc()` when possible
4. **Always test on actual Android devices**: Emulators may not show all issues
5. **Provide detailed error logging**: Critical for diagnosing mobile-specific issues
