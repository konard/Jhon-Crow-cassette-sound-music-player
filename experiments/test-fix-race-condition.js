/**
 * Test script to verify the race condition fix for Always on Top persistence
 *
 * This test simulates the race condition scenario where:
 * 1. User enables Always on Top (set-always-on-top IPC sent)
 * 2. User immediately closes settings (save-settings IPC sent with stale value)
 * 3. The save-settings handler should NOT overwrite the correct value
 *
 * Run: node experiments/test-fix-race-condition.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_SETTINGS_FILE = path.join(os.tmpdir(), 'cassette-player-fix-race-test.json');

const DEFAULT_SETTINGS = {
  audio: { volume: 0.7, effectsEnabled: true },
  appearance: { gradientEnabled: false },
  window: { alwaysOnTop: false },
  ui: { showControlsHint: true },
  playback: { folderPath: null, currentTrackIndex: 0 }
};

// ============================================================================
// SIMULATED MAIN PROCESS (with the FIX applied)
// ============================================================================
let currentSettings = null;
let windowAlwaysOnTop = false;

function loadSettings() {
  try {
    if (fs.existsSync(TEST_SETTINGS_FILE)) {
      const data = fs.readFileSync(TEST_SETTINGS_FILE, 'utf8');
      const loaded = JSON.parse(data);
      return {
        audio: { ...DEFAULT_SETTINGS.audio, ...loaded.audio },
        appearance: { ...DEFAULT_SETTINGS.appearance, ...loaded.appearance },
        window: { ...DEFAULT_SETTINGS.window, ...loaded.window },
        ui: { ...DEFAULT_SETTINGS.ui, ...loaded.ui },
        playback: { ...DEFAULT_SETTINGS.playback, ...loaded.playback }
      };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function saveSettingsToFile(settings) {
  fs.writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// FIX: save-settings handler that preserves window settings from currentSettings
async function handleSaveSettings_FIXED(settings, delayMs) {
  await delay(delayMs);
  // FIXED: Merge incoming settings with current settings
  // Preserve window settings from currentSettings (managed by set-always-on-top)
  currentSettings = {
    audio: { ...currentSettings?.audio, ...settings.audio },
    appearance: { ...currentSettings?.appearance, ...settings.appearance },
    window: { ...currentSettings?.window },  // PRESERVE window from main process!
    ui: { ...currentSettings?.ui, ...settings.ui },
    playback: { ...currentSettings?.playback, ...settings.playback }
  };
  saveSettingsToFile(currentSettings);
  console.log(`  [Main] save-settings (FIXED): preserved window.alwaysOnTop=${currentSettings.window?.alwaysOnTop} after ${delayMs}ms`);
}

// OLD BUGGY: save-settings handler that replaces everything
async function handleSaveSettings_BUGGY(settings, delayMs) {
  await delay(delayMs);
  currentSettings = settings;
  saveSettingsToFile(settings);
  console.log(`  [Main] save-settings (BUGGY): wrote window.alwaysOnTop=${settings.window?.alwaysOnTop} after ${delayMs}ms`);
}

async function handleSetAlwaysOnTop(value, delayMs) {
  await delay(delayMs);
  windowAlwaysOnTop = value;
  if (currentSettings) {
    if (!currentSettings.window) currentSettings.window = { ...DEFAULT_SETTINGS.window };
    currentSettings.window.alwaysOnTop = value;
    saveSettingsToFile(currentSettings);
    console.log(`  [Main] set-always-on-top(${value}): saved after ${delayMs}ms`);
  }
}

async function handleGetAlwaysOnTop(delayMs) {
  await delay(delayMs);
  console.log(`  [Main] get-always-on-top(): returning ${windowAlwaysOnTop} after ${delayMs}ms`);
  return windowAlwaysOnTop;
}

// ============================================================================
// SIMULATED RENDERER CODE
// ============================================================================
const CONFIG = { audio: { volume: 0.7 }, appearance: { gradientEnabled: false }, ui: { showControlsHint: true } };
const audioState = { folderPath: null, currentTrackIndex: 0 };

async function saveCurrentSettings(getDelay, saveDelay, useFix) {
  let alwaysOnTop = await handleGetAlwaysOnTop(getDelay);
  console.log(`  [Renderer] saveCurrentSettings: got alwaysOnTop=${alwaysOnTop}`);

  const settings = {
    audio: { volume: CONFIG.audio.volume },
    appearance: { gradientEnabled: CONFIG.appearance.gradientEnabled },
    window: { alwaysOnTop: alwaysOnTop },  // This may have stale value!
    ui: { showControlsHint: CONFIG.ui.showControlsHint },
    playback: { folderPath: audioState.folderPath, currentTrackIndex: audioState.currentTrackIndex }
  };

  if (useFix) {
    handleSaveSettings_FIXED(settings, saveDelay);
  } else {
    handleSaveSettings_BUGGY(settings, saveDelay);
  }
}

// ============================================================================
// UTILITY
// ============================================================================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanUp() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) fs.unlinkSync(TEST_SETTINGS_FILE);
  currentSettings = null;
  windowAlwaysOnTop = false;
}

function readFile() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    return JSON.parse(fs.readFileSync(TEST_SETTINGS_FILE, 'utf8'));
  }
  return null;
}

// ============================================================================
// TESTS
// ============================================================================

async function testBuggyBehavior() {
  console.log('\n=== TEST: OLD BUGGY BEHAVIOR ===');
  console.log('Timing: set-always-on-top=5ms, getAlwaysOnTop=2ms, save-settings=10ms');
  console.log('Expected: FAIL (save-settings overwrites correct value)\n');
  cleanUp();

  currentSettings = loadSettings();
  console.log('1. App started. window.alwaysOnTop =', currentSettings.window?.alwaysOnTop);

  console.log('2. User enables Always on Top');
  handleSetAlwaysOnTop(true, 5);

  console.log('3. User immediately closes settings');
  await saveCurrentSettings(2, 10, false);  // useFix=false

  await delay(50);
  console.log('\n4. All IPC done. File window.alwaysOnTop =', readFile()?.window?.alwaysOnTop);

  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('5. Restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗ (as expected - this is the bug)');
  return passed;
}

async function testFixedBehavior() {
  console.log('\n=== TEST: FIXED BEHAVIOR ===');
  console.log('Timing: set-always-on-top=5ms, getAlwaysOnTop=2ms, save-settings=10ms');
  console.log('Expected: PASS (save-settings preserves window.alwaysOnTop)\n');
  cleanUp();

  currentSettings = loadSettings();
  console.log('1. App started. window.alwaysOnTop =', currentSettings.window?.alwaysOnTop);

  console.log('2. User enables Always on Top');
  handleSetAlwaysOnTop(true, 5);

  console.log('3. User immediately closes settings');
  await saveCurrentSettings(2, 10, true);  // useFix=true

  await delay(50);
  console.log('\n4. All IPC done. File window.alwaysOnTop =', readFile()?.window?.alwaysOnTop);

  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('5. Restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

async function testToggleOff() {
  console.log('\n=== TEST: TOGGLE OFF PERSISTENCE (with fix) ===');
  cleanUp();

  // Start with Always on Top enabled
  currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  currentSettings.window.alwaysOnTop = true;
  saveSettingsToFile(currentSettings);

  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('1. App started with alwaysOnTop enabled:', currentSettings.window?.alwaysOnTop);

  console.log('2. User disables Always on Top');
  handleSetAlwaysOnTop(false, 5);

  console.log('3. User closes settings');
  await saveCurrentSettings(2, 10, true);

  await delay(50);
  console.log('\n4. All IPC done. File window.alwaysOnTop =', readFile()?.window?.alwaysOnTop);

  currentSettings = loadSettings();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
  console.log('5. Restart - alwaysOnTop:', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.window?.alwaysOnTop === false;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');
  return passed;
}

async function testOtherSettingsPreserved() {
  console.log('\n=== TEST: OTHER SETTINGS STILL SAVED (with fix) ===');
  cleanUp();

  currentSettings = loadSettings();
  console.log('1. App started. volume =', currentSettings.audio?.volume);

  // User changes volume
  CONFIG.audio.volume = 0.5;
  console.log('2. User changes volume to 0.5');

  // User also enables Always on Top
  console.log('3. User enables Always on Top');
  handleSetAlwaysOnTop(true, 5);

  // User closes settings
  console.log('4. User closes settings');
  await saveCurrentSettings(2, 10, true);

  await delay(50);
  const fileContents = readFile();
  console.log('\n5. All IPC done.');
  console.log('   File volume =', fileContents?.audio?.volume);
  console.log('   File window.alwaysOnTop =', fileContents?.window?.alwaysOnTop);

  currentSettings = loadSettings();
  console.log('6. After restart:');
  console.log('   volume =', currentSettings.audio?.volume);
  console.log('   alwaysOnTop =', currentSettings.window?.alwaysOnTop);

  const passed = currentSettings.audio?.volume === 0.5 && currentSettings.window?.alwaysOnTop === true;
  console.log('\n   Result:', passed ? 'PASS ✓' : 'FAIL ✗');

  // Reset for other tests
  CONFIG.audio.volume = 0.7;
  return passed;
}

// Run all tests
async function runTests() {
  console.log('=====================================');
  console.log('Race Condition Fix Verification Tests');
  console.log('=====================================');

  const buggy = await testBuggyBehavior();
  const fixed = await testFixedBehavior();
  const toggleOff = await testToggleOff();
  const otherSettings = await testOtherSettingsPreserved();

  console.log('\n=====================================');
  console.log('Summary');
  console.log('=====================================');
  console.log('Old buggy behavior (should fail):  ', buggy ? 'PASS (unexpected)' : 'FAIL ✓ (expected - confirms bug)');
  console.log('Fixed behavior:                    ', fixed ? 'PASS ✓' : 'FAIL ✗');
  console.log('Toggle off persistence:            ', toggleOff ? 'PASS ✓' : 'FAIL ✗');
  console.log('Other settings preserved:          ', otherSettings ? 'PASS ✓' : 'FAIL ✗');

  cleanUp();

  if (!fixed || !toggleOff || !otherSettings) {
    console.log('\n❌ Fix verification FAILED!');
    process.exit(1);
  } else {
    console.log('\n✅ Fix verified! All tests passed.');
    process.exit(0);
  }
}

runTests();
