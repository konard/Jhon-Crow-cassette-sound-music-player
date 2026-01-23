/**
 * Test script to reproduce the EXACT bug scenario
 *
 * The bug: When user toggles "Always on Top" ON and closes settings,
 * the setting is NOT persisted correctly.
 *
 * This simulates the FIRST TIME a user enables the feature.
 */

const fs = require('fs');
const path = require('path');

const TEST_SETTINGS_FILE = path.join(__dirname, 'test-bug.json');

// Simulated state
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
    const data = fs.readFileSync(TEST_SETTINGS_FILE, 'utf8');
    const loaded = JSON.parse(data);
    return {
      window: { ...DEFAULT_SETTINGS.window, ...loaded.window },
      audio: { ...DEFAULT_SETTINGS.audio, ...loaded.audio }
    };
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
  console.log(`  [Startup] Loaded: window.alwaysOnTop = ${currentSettings.window.alwaysOnTop}`);
  console.log(`  [Startup] Window state set to: ${windowAlwaysOnTop}`);
}

// IPC Handlers matching main.js

function handleSetAlwaysOnTop(value) {
  console.log(`  [set-always-on-top] Received value: ${value}`);
  windowAlwaysOnTop = value;
  if (!currentSettings.window) {
    currentSettings.window = { alwaysOnTop: false };
  }
  currentSettings.window.alwaysOnTop = value;
  console.log(`  [set-always-on-top] Updated currentSettings.window to: ${JSON.stringify(currentSettings.window)}`);
  saveSettingsToFile(currentSettings);
  console.log(`  [set-always-on-top] Saved to file`);
}

function handleGetAlwaysOnTop() {
  console.log(`  [get-always-on-top] Returning: ${windowAlwaysOnTop}`);
  return windowAlwaysOnTop;
}

function handleSaveSettings(settings) {
  console.log(`  [save-settings] Received settings.window: ${JSON.stringify(settings.window)}`);
  console.log(`  [save-settings] Current currentSettings.window: ${JSON.stringify(currentSettings.window)}`);

  // THE FIX: Preserve window settings from currentSettings
  currentSettings = {
    audio: { ...currentSettings?.audio, ...settings.audio },
    window: { ...currentSettings?.window }  // PRESERVE from main process
  };

  console.log(`  [save-settings] After merge, currentSettings.window: ${JSON.stringify(currentSettings.window)}`);
  saveSettingsToFile(currentSettings);
  console.log(`  [save-settings] Saved to file`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('='.repeat(60));
console.log('REPRODUCING THE BUG SCENARIO');
console.log('='.repeat(60));

// Clean start
cleanup();

console.log('\n=== FIRST APP LAUNCH (fresh install) ===');
appStartup();
console.log('  User opens settings panel...');

console.log('\n=== USER ENABLES "ALWAYS ON TOP" ===');
// User clicks the checkbox
// In renderer, this triggers: window.electronAPI.setAlwaysOnTop(true)
// Which sends IPC message to main process

// Simulating RACE CONDITION:
// The IPC message is sent, but we simulate the renderer proceeding
// before the main process has finished processing the message

console.log('  [renderer] User toggles checkbox ON');
console.log('  [renderer] Calling setAlwaysOnTop(true) - IPC send (fire-and-forget)');
// In real Electron, this is async. Let's delay it slightly
let setAlwaysOnTopProcessed = false;
setTimeout(() => {
  handleSetAlwaysOnTop(true);
  setAlwaysOnTopProcessed = true;
}, 10);

console.log('\n=== USER IMMEDIATELY CLOSES SETTINGS ===');
console.log('  [renderer] Settings panel closed');
console.log('  [renderer] saveCurrentSettings() called');

// saveCurrentSettings does:
// 1. Call getAlwaysOnTop() and wait for response
console.log('  [renderer] Calling getAlwaysOnTop()...');

// In the race condition, getAlwaysOnTop might return BEFORE
// setAlwaysOnTop was processed
const alwaysOnTopValue = handleGetAlwaysOnTop();

console.log(`  [renderer] Got alwaysOnTop = ${alwaysOnTopValue}`);

// 2. Build settings object
const settingsToSave = {
  window: { alwaysOnTop: alwaysOnTopValue },
  audio: { volume: 0.7 }
};
console.log(`  [renderer] Built settings object: window = ${JSON.stringify(settingsToSave.window)}`);

// 3. Call saveSettings
console.log('  [renderer] Calling saveSettings()...');

// Wait a bit for setAlwaysOnTop to process first (simulating real timing)
setTimeout(() => {
  handleSaveSettings(settingsToSave);

  // Now simulate app restart
  console.log('\n=== APP RESTART ===');
  windowAlwaysOnTop = false; // Reset window state
  currentSettings = null;
  appStartup();

  // Check result
  console.log('\n=== VERIFICATION ===');
  if (windowAlwaysOnTop) {
    console.log('✅ SUCCESS: Always on Top setting was persisted correctly!');
  } else {
    console.log('❌ FAILURE: Always on Top setting was NOT persisted!');
    console.log('   The bug is still present.');
  }

  // Show file contents
  console.log('\n=== SETTINGS FILE CONTENTS ===');
  const fileContents = fs.readFileSync(TEST_SETTINGS_FILE, 'utf8');
  console.log(fileContents);

  cleanup();
}, 20);
