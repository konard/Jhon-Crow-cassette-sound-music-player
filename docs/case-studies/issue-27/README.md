# Case Study: Issue #27 - Mobile Version File Access Fix

## Issue Summary

**Original Report**: "Error loading track" when using the Android mobile version of the cassette music player. Even granting storage permissions manually doesn't resolve the error.

**Initial Issue #24 Solution**: Added `READ_MEDIA_AUDIO`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` permissions to `AndroidManifest.xml` - but this alone didn't fully solve the problem.

## Root Cause Analysis

### Primary Problem: File URL Protocol Incompatibility

The app uses HTML5 `<input type="file">` for file selection on mobile, which creates blob URLs (`blob:...`) that work correctly. However, the underlying issue is more nuanced:

1. **Capacitor WebView URL Scheme**: Capacitor apps are served via a local HTTP server using the `https://` protocol (configured as `androidScheme: 'https'` in `capacitor.config.ts`).

2. **Blob URL Handling**: When files are selected via the file input, blob URLs are created which should work. However, there are potential issues with:
   - Mixed content restrictions (HTTPS page loading from insecure sources)
   - CORS restrictions when trying to access local files
   - WebView security restrictions on `file://` protocol access

3. **Audio Element Loading**: The `<audio>` element attempts to load the blob URL, but on some Android devices/versions, this can fail due to:
   - CORS policy violations
   - Missing WebView configuration for file access
   - Blob URL lifetime issues

### Secondary Problem: Missing Error Handling

The current code shows "Error loading track" but doesn't provide detailed diagnostic information about what exactly failed.

## Technical Research

### Sources Consulted

1. [Capacitor Filesystem Plugin Documentation](https://capacitorjs.com/docs/apis/filesystem)
2. [Capacitor Android Troubleshooting](https://capacitorjs.com/docs/android/troubleshooting)
3. [Capacitor WebView Documentation](https://ionicframework.com/docs/core-concepts/webview)
4. [Android 13 Behavior Changes](https://developer.android.com/about/versions/13/behavior-changes-13)
5. [Capacitor File Picker Plugin](https://capawesome.io/plugins/file-picker/)
6. [Blob downloads issue #5478](https://github.com/ionic-team/capacitor/issues/5478)
7. [Capacitor 5 Filesystem permissions issue #6647](https://github.com/ionic-team/capacitor/issues/6647)

### Key Technical Findings

#### 1. File Protocol Incompatibility

According to Capacitor documentation:
> "Capacitor and Cordova apps are hosted on a local HTTP server and are served with the `http://` protocol. Some plugins, however, attempt to access device files via the `file://` protocol. To avoid difficulties between `http://` and `file://`, paths to device files must be rewritten."

#### 2. Recommended Approach

From the Capacitor File Handling Guide:
> "When reading a file, you should make sure that the file is not loaded into the WebView as a base64 string or data URL. Instead, use the fetch API in combination with the `convertFileSrc(...)` method to load the file as a blob."

#### 3. Android WebView File Access Settings

WebView has file access settings (`setAllowFileAccess`, `setAllowFileAccessFromURLs`, `setAllowUniversalAccessFromFileURLs`) that are disabled by default for security reasons. Instead of enabling these (which is insecure), the recommended approach is to use `Capacitor.convertFileSrc()`.

#### 4. Blob URL Lifetime

Blob URLs created with `URL.createObjectURL()` remain valid as long as the document that created them exists. However, on some Android WebView implementations, blob URLs may have issues with cross-origin access.

## Solution Implementation

### Approach 1: Enhanced Blob URL Handling (Recommended)

Keep using blob URLs but add better error handling and fallback mechanisms:

```javascript
// When loading audio for mobile:
async function loadTrackMobile(track) {
  try {
    if (track.url) {
      // Use existing blob URL
      audioState.audioElement.src = track.url;
    } else if (track.file) {
      // Create new blob URL from File object
      const url = URL.createObjectURL(track.file);
      audioState.audioElement.src = url;
    }
    await audioState.audioElement.load();
  } catch (error) {
    console.error('Error loading track:', error);
    updateStatusBar(`Error: ${error.message}`);
  }
}
```

### Approach 2: Use Capacitor.convertFileSrc() for Native File Paths

If files have native paths (from plugins like Capacitor File Picker), convert them:

```javascript
if (isCapacitor && track.path) {
  // Convert native file path to WebView-accessible URL
  const webViewPath = Capacitor.convertFileSrc(track.path);
  audioState.audioElement.src = webViewPath;
}
```

### Approach 3: Read Files as ArrayBuffer

For problematic cases, read the file content directly:

```javascript
async function loadTrackFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type });
  const url = URL.createObjectURL(blob);
  audioState.audioElement.src = url;
  await audioState.audioElement.load();
}
```

## Files Modified

1. `src/renderer.js` - Enhanced file loading with better error handling
2. `capacitor.config.ts` - No changes needed (already configured correctly)
3. `.github/workflows/build-android.yml` - No changes needed (permissions already added)

## Testing Plan

1. Build APK with the changes
2. Test file selection on Android 13+ device
3. Test file selection on Android 12 and below
4. Verify audio playback after file selection
5. Test error scenarios (invalid files, permission denied)
6. Test blob URL cleanup to prevent memory leaks

## Prevention Measures

1. **Enhanced Logging**: Add detailed console logging for mobile file operations
2. **User-Friendly Error Messages**: Show specific error information to users
3. **Fallback Mechanisms**: Implement multiple approaches to load audio files
4. **Clean Up Blob URLs**: Revoke blob URLs when tracks are unloaded to prevent memory leaks

## Lessons Learned

1. **Blob URLs are generally reliable** on modern Android WebView, but error handling is crucial
2. **Always provide detailed error information** during development to diagnose issues
3. **Test on multiple Android versions** - behavior can differ between versions
4. **Consider using dedicated file picker plugins** for better cross-platform compatibility

## Related Links

- [Issue #27](https://github.com/Jhon-Crow/cassette-sound-music-player/issues/27)
- [Issue #24](https://github.com/Jhon-Crow/cassette-sound-music-player/issues/24) (original mobile implementation)
- [PR #25](https://github.com/Jhon-Crow/cassette-sound-music-player/pull/25) (previous fix)
- [PR #29](https://github.com/Jhon-Crow/cassette-sound-music-player/pull/29) (this fix)
