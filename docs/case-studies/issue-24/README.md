# Case Study: Issue #24 - Mobile Version Support

## Issue Summary

Original request: Create a mobile version of the cassette music player maintaining all existing functionality, hiding the controls hint, and adding APK build to GitHub Actions.

**Reported Problem**: "Error loading track" when using the Android version. Likely related to the app not requesting file access permissions.

## Root Cause Analysis

### 1. Android File Access Permissions Problem

The initial mobile implementation used HTML5 `<input type="file">` for file selection, which works on web browsers but requires specific permissions on Android.

#### Android Permission Model Evolution

| Android Version | API Level | Required Permissions |
|-----------------|-----------|---------------------|
| Android 9 and below | 28 | `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` |
| Android 10-12 | 29-32 | `READ_EXTERNAL_STORAGE` (scoped storage) |
| Android 13+ | 33+ | `READ_MEDIA_AUDIO`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` |

#### Key Findings

1. **READ_EXTERNAL_STORAGE is deprecated** on Android 13+ and is not granted when targeting API 33+
2. **WRITE_EXTERNAL_STORAGE has no effect** on Android SDK versions above 29
3. **Granular media permissions** (`READ_MEDIA_AUDIO`, etc.) are required for Android 13+
4. **Capacitor WebView** requires proper AndroidManifest.xml configuration for file access

### 2. Missing Permissions in AndroidManifest.xml

The Capacitor-generated Android project didn't include the necessary file access permissions:

```xml
<!-- Required for Android 12 and below -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />

<!-- Required for Android 13+ (API 33+) -->
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
```

### 3. Screen Orientation Issue

User requested horizontal (landscape) orientation by default for the cassette tape, which makes sense as cassette tapes are naturally horizontal.

## Technical Research

### Sources Consulted

1. [Capacitor Filesystem Plugin Documentation](https://capacitorjs.com/docs/v5/apis/filesystem)
2. [Android Storage Permission Updates](https://developer.android.com/about/versions/11/privacy/storage)
3. [Capacitor File Input Behavior Issue #6536](https://github.com/ionic-team/capacitor/issues/6536)
4. [Android Data Storage Overview](https://developer.android.com/training/data-storage)
5. [Capacitor Permissions Issue #1666](https://github.com/ionic-team/capacitor-plugins/issues/1666)

### Key Technical Points

1. **HTML5 File Input on Android WebView**: Works but requires proper permissions declared in AndroidManifest.xml
2. **Capacitor's Default Behavior**: Does not automatically add media permissions
3. **Runtime Permission Requests**: On Android 6+, "dangerous" permissions must be requested at runtime, but Capacitor handles this for file input dialogs

## Solution Implementation

### 1. Add Android Permissions

Create/modify `android/app/src/main/AndroidManifest.xml` permissions:

```xml
<!-- File access for audio playback -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
```

### 2. Configure Capacitor for Permissions

Update `capacitor.config.ts` to configure the Android platform properly.

### 3. Implement Screen Orientation

- Set default orientation to landscape on mobile
- Add orientation toggle in settings
- Support auto-rotate when enabled

## Files Modified

1. `capacitor.config.ts` - Add orientation and permission settings
2. `src/renderer.js` - Add orientation management and settings
3. `src/index.html` - Add orientation toggle UI
4. `.github/workflows/build-android.yml` - Ensure permissions are set

## Testing Plan

1. Build APK with new permissions
2. Test file selection on Android 13+ device
3. Test file selection on Android 12 and below
4. Verify audio playback after file selection
5. Test screen orientation changes
6. Verify all existing functionality works

## Lessons Learned

1. **Always research platform-specific permission requirements** before deploying mobile apps
2. **Android permission model changes frequently** - what worked in older versions may not work in newer ones
3. **WebView-based apps (Capacitor/Cordova)** still need native permissions declared in AndroidManifest.xml
4. **Testing on multiple Android versions** is essential for identifying permission-related issues

## Related Links

- [Issue #24](https://github.com/Jhon-Crow/cassette-sound-music-player/issues/24)
- [PR #25](https://github.com/Jhon-Crow/cassette-sound-music-player/pull/25)
