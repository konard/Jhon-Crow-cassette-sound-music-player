/**
 * Test: User toggles Always on Top multiple times before closing settings
 */

const fs = require('fs');
const path = require('path');

const TEST_SETTINGS_FILE = path.join(__dirname, 'test-toggle.json');

let currentSettings = null;
let windowAlwaysOnTop = false;

const DEFAULT_SETTINGS = {
  window: { alwaysOnTop: false },
  audio: { volume: 0.7 }
};

function saveSettingsToFile(settings) {
  fs.writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function loadSettingsFromFile() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    return JSON.parse(fs.readFileSync(TEST_SETTINGS_FILE, 'utf8'));
  }
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function cleanup() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    fs.unlinkSync(TEST_SETTINGS_FILE);
  }
}

function appStartup() {
  currentSettings = loadSettingsFromFile();
  windowAlwaysOnTop = currentSettings.window?.alwaysOnTop || false;
}

function handleSetAlwaysOnTop(value) {
  console.log(`  [main] set-always-on-top: ${value}`);
  windowAlwaysOnTop = value;
  if (!currentSettings.window) currentSettings.window = {};
  currentSettings.window.alwaysOnTop = value;
  saveSettingsToFile(currentSettings);
}

function handleGetAlwaysOnTop() {
  console.log(`  [main] get-always-on-top returning: ${windowAlwaysOnTop}`);
  return windowAlwaysOnTop;
}

function handleSaveSettings(settings) {
  console.log(`  [main] save-settings - incoming window: ${JSON.stringify(settings.window)}, preserving: ${JSON.stringify(currentSettings.window)}`);
  currentSettings = {
    audio: { ...currentSettings?.audio, ...settings.audio },
    window: { ...currentSettings?.window }  // PRESERVE
  };
  saveSettingsToFile(currentSettings);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(60));
  console.log('TEST: Toggle Multiple Times');
  console.log('='.repeat(60));

  cleanup();

  // Scenario 1: Toggle ON, then OFF, then ON again, close settings
  console.log('\n=== Scenario 1: ON -> OFF -> ON -> Close ===');
  appStartup();
  console.log(`  Initial state: ${windowAlwaysOnTop}`);

  // Toggle ON
  handleSetAlwaysOnTop(true);
  await sleep(5);

  // Toggle OFF
  handleSetAlwaysOnTop(false);
  await sleep(5);

  // Toggle ON
  handleSetAlwaysOnTop(true);
  await sleep(5);

  // Close settings - saveCurrentSettings
  const value1 = handleGetAlwaysOnTop();
  handleSaveSettings({ window: { alwaysOnTop: value1 }, audio: {} });

  // Restart
  currentSettings = null;
  windowAlwaysOnTop = false;
  appStartup();
  console.log(`  After restart: ${windowAlwaysOnTop ? '✅ ON' : '❌ OFF'}`);

  // Scenario 2: Start with ON, toggle OFF, close quickly
  console.log('\n=== Scenario 2: Start ON, toggle OFF, close quickly ===');
  cleanup();
  saveSettingsToFile({ window: { alwaysOnTop: true }, audio: {} });
  appStartup();
  console.log(`  Initial state: ${windowAlwaysOnTop}`);

  // Toggle OFF
  console.log('  User toggles OFF...');

  // Simulate race: getAlwaysOnTop runs BEFORE setAlwaysOnTop
  const staleValue = handleGetAlwaysOnTop(); // Returns true (stale!)

  // Now setAlwaysOnTop runs
  handleSetAlwaysOnTop(false);

  // saveSettings runs with stale value
  console.log(`  [renderer] Using stale value: ${staleValue}`);
  handleSaveSettings({ window: { alwaysOnTop: staleValue }, audio: {} });

  // Restart
  currentSettings = null;
  windowAlwaysOnTop = false;
  appStartup();
  console.log(`  After restart: ${windowAlwaysOnTop ? '❌ ON (BUG!)' : '✅ OFF'}`);

  // Wait, in this scenario the fix PRESERVES currentSettings.window
  // which was set to FALSE by setAlwaysOnTop...
  // Let me trace this more carefully

  console.log('\n=== Scenario 3: Same as 2, with detailed trace ===');
  cleanup();
  saveSettingsToFile({ window: { alwaysOnTop: true }, audio: {} });

  currentSettings = loadSettingsFromFile();
  windowAlwaysOnTop = currentSettings.window.alwaysOnTop;
  console.log(`  [startup] currentSettings.window: ${JSON.stringify(currentSettings.window)}`);
  console.log(`  [startup] windowAlwaysOnTop: ${windowAlwaysOnTop}`);

  console.log('\n  [user action] Opens settings, toggles OFF');

  // The getAlwaysOnTop happens first (race)
  console.log('  [renderer] calls getAlwaysOnTop()...');
  const stale = windowAlwaysOnTop; // This is still TRUE
  console.log(`  [renderer] got: ${stale}`);

  // Now setAlwaysOnTop runs
  console.log('  [main] processing set-always-on-top(false)...');
  windowAlwaysOnTop = false;
  currentSettings.window.alwaysOnTop = false;
  saveSettingsToFile(currentSettings);
  console.log(`  [main] currentSettings.window is now: ${JSON.stringify(currentSettings.window)}`);

  // Now saveSettings runs with stale value
  console.log(`  [main] processing save-settings({ window: { alwaysOnTop: ${stale} } })...`);
  currentSettings = {
    audio: { ...currentSettings.audio },
    window: { ...currentSettings.window }  // This is { alwaysOnTop: false }
  };
  saveSettingsToFile(currentSettings);
  console.log(`  [main] After save, currentSettings.window: ${JSON.stringify(currentSettings.window)}`);

  // Restart
  currentSettings = null;
  windowAlwaysOnTop = true; // reset
  appStartup();
  console.log(`\n  After restart: ${windowAlwaysOnTop ? '❌ ON (BUG - should be OFF!)' : '✅ OFF (correct!)'}`);

  cleanup();
}

main();
