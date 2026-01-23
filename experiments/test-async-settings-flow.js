/**
 * Test script to simulate the ASYNC settings flow for Always on Top persistence
 * This test mimics the ACTUAL timing of IPC communication in Electron.
 *
 * The key insight is that:
 * - setAlwaysOnTop uses ipcRenderer.send() (fire-and-forget, async)
 * - getAlwaysOnTop uses ipcRenderer.invoke() (async, returns promise)
 * - saveSettings uses ipcRenderer.send() (fire-and-forget, async)
 *
 * When user quickly toggles and closes settings, the timing is:
 * 1. setAlwaysOnTop(true) sent at T=0ms
 * 2. Close settings panel at T=5ms
 * 3. saveCurrentSettings() starts, calls getAlwaysOnTop() at T=5ms
 * 4. getAlwaysOnTop() handler runs at T=7ms, but setAlwaysOnTop hasn't run yet!
 *
 * This is because JavaScript event loop processes IPC messages sequentially.
 */

const fs = require('fs');
const path = require('path');

// Temporary settings file for testing
const TEST_SETTINGS_FILE = path.join(__dirname, 'test-async-settings.json');

// Default settings
const DEFAULT_SETTINGS = {
  window: { alwaysOnTop: false },
  audio: { volume: 0.7 }
};

// Simulated main process state
let currentSettings = null;
let windowAlwaysOnTop = false;

// Pending IPC messages queue (simulates how Electron handles IPC)
const ipcQueue = [];

function saveSettingsToFile(settings) {
  fs.writeFileSync(TEST_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  console.log('  [FILE] Wrote settings:', JSON.stringify(settings.window));
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
  return { ...DEFAULT_SETTINGS };
}

// Simulate IPC handlers in main process

// set-always-on-top (via ipcRenderer.send - fire and forget)
async function mainHandleSetAlwaysOnTop(value, delay) {
  console.log(`  [main:${delay}ms] Processing set-always-on-top: ${value}`);
  windowAlwaysOnTop = value;
  if (!currentSettings.window) {
    currentSettings.window = { alwaysOnTop: false };
  }
  currentSettings.window.alwaysOnTop = value;
  saveSettingsToFile(currentSettings);
}

// get-always-on-top (via ipcRenderer.invoke - returns promise)
async function mainHandleGetAlwaysOnTop(delay) {
  console.log(`  [main:${delay}ms] Processing get-always-on-top, returning: ${windowAlwaysOnTop}`);
  return windowAlwaysOnTop;
}

// save-settings (via ipcRenderer.send - fire and forget)
async function mainHandleSaveSettings(settings, delay) {
  console.log(`  [main:${delay}ms] Processing save-settings with window: ${JSON.stringify(settings.window)}`);
  // Using the FIXED version that preserves window settings
  currentSettings = {
    audio: { ...currentSettings?.audio, ...settings.audio },
    window: { ...currentSettings?.window }  // Preserve from main process
  };
  saveSettingsToFile(currentSettings);
}

// Cleanup
function cleanup() {
  if (fs.existsSync(TEST_SETTINGS_FILE)) {
    fs.unlinkSync(TEST_SETTINGS_FILE);
  }
  currentSettings = null;
  windowAlwaysOnTop = false;
}

// Simulate app startup
function appStartup() {
  currentSettings = loadSettingsFromFile();
  if (currentSettings.window?.alwaysOnTop) {
    windowAlwaysOnTop = true;
  }
  console.log(`  [main] Startup - loaded settings: ${JSON.stringify(currentSettings.window)}, window state: ${windowAlwaysOnTop}`);
}

async function runTest(testName, scenario) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${testName}`);
  console.log('='.repeat(60));

  cleanup();
  appStartup();

  await scenario();

  console.log('\n--- App restart ---');
  windowAlwaysOnTop = false;
  currentSettings = null;
  appStartup();

  if (windowAlwaysOnTop) {
    console.log('\n✅ SUCCESS: Always on Top was restored!');
    return true;
  } else {
    console.log('\n❌ FAILURE: Always on Top was NOT restored!');
    return false;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// TEST 1: Normal timing (no race condition)
// User toggles, waits a bit, then closes settings
async function test1NormalTiming() {
  console.log('\nScenario: User toggles Always on Top, waits, then closes settings');

  console.log('\n[T=0ms] User toggles checkbox ON');
  // This would be: ipcRenderer.send('set-always-on-top', true)
  setTimeout(() => mainHandleSetAlwaysOnTop(true, 2), 2);

  console.log('[T=100ms] User closes settings');
  await sleep(100);

  // This is saveCurrentSettings() in renderer
  console.log('[T=100ms] Renderer calls getAlwaysOnTop()');
  const alwaysOnTop = await mainHandleGetAlwaysOnTop(102);

  console.log(`[T=102ms] Renderer builds settings object with alwaysOnTop: ${alwaysOnTop}`);
  const settings = {
    window: { alwaysOnTop: alwaysOnTop },
    audio: { volume: 0.7 }
  };

  console.log('[T=102ms] Renderer calls saveSettings()');
  setTimeout(() => mainHandleSaveSettings(settings, 104), 2);

  await sleep(50);
}

// TEST 2: Race condition timing
// User toggles and IMMEDIATELY closes settings
async function test2RaceCondition() {
  console.log('\nScenario: User toggles Always on Top and IMMEDIATELY closes settings');
  console.log('(This simulates the race condition)');

  console.log('\n[T=0ms] User toggles checkbox ON');
  // ipcRenderer.send is fire-and-forget, message goes to queue
  // Main process will handle it later

  console.log('[T=0ms] User IMMEDIATELY closes settings (before IPC is processed)');

  // In the real app, both of these go into the IPC queue
  // The question is: which one gets processed first?

  // Simulate: renderer sends set-always-on-top at T=0
  // Then immediately calls saveCurrentSettings which does getAlwaysOnTop

  // In Electron, ipcRenderer.send() messages and ipcRenderer.invoke() are both async
  // The invoke() waits for response, but the send() is fire-and-forget

  // The order depends on when messages arrive at main process
  // Usually invoke() returns before the send() is fully processed

  console.log('[T=1ms] Main process starts processing IPC queue...');

  // Simulate the race: getAlwaysOnTop runs BEFORE set-always-on-top completes
  console.log('[T=1ms] Processing get-always-on-top (from invoke)...');
  const alwaysOnTop = await mainHandleGetAlwaysOnTop(1);

  console.log('[T=2ms] Processing set-always-on-top (from send)...');
  await mainHandleSetAlwaysOnTop(true, 2);

  console.log(`[T=3ms] Renderer builds settings with alwaysOnTop: ${alwaysOnTop} (STALE VALUE!)`);
  const settings = {
    window: { alwaysOnTop: alwaysOnTop },
    audio: { volume: 0.7 }
  };

  console.log('[T=4ms] Processing save-settings...');
  await mainHandleSaveSettings(settings, 4);

  console.log('\n[ANALYSIS] With the FIX:');
  console.log('  - save-settings preserves currentSettings.window');
  console.log('  - set-always-on-top already updated currentSettings.window.alwaysOnTop = true');
  console.log('  - So the preserved value should be TRUE');

  await sleep(10);
}

// TEST 3: Simulating the ACTUAL bug scenario
// The send() for set-always-on-top is fired but NOT processed yet
// when saveCurrentSettings runs
async function test3ActualBugScenario() {
  console.log('\nScenario: Reproducing the actual bug with correct IPC timing');
  console.log('Key: send() messages queue up, invoke() waits for response');

  console.log('\n[T=0ms] User toggles checkbox ON');
  console.log('        ipcRenderer.send("set-always-on-top", true) - message queued');

  console.log('[T=0ms] User closes settings panel');
  console.log('        saveCurrentSettings() starts executing');

  // Here's the key insight:
  // The renderer's saveCurrentSettings does:
  // 1. await getAlwaysOnTop() - this WAITS for response
  // 2. Then sends save-settings
  //
  // In the main process, IPC messages are processed in order.
  // If set-always-on-top is queued BEFORE get-always-on-top,
  // then set-always-on-top runs first, and get-always-on-top returns the NEW value.
  //
  // BUT if they're processed in a different order...

  // Let's simulate what happens if set-always-on-top is delayed
  console.log('\n[Simulating IPC processing order where set-always-on-top is delayed]');

  // Step 1: get-always-on-top runs first (returns OLD value: false)
  console.log('[T=1ms] Main processes get-always-on-top first');
  const alwaysOnTop = await mainHandleGetAlwaysOnTop(1);

  // Step 2: set-always-on-top runs (updates to true)
  console.log('[T=2ms] Main processes set-always-on-top');
  await mainHandleSetAlwaysOnTop(true, 2);

  // Step 3: save-settings runs with STALE value
  console.log(`[T=3ms] Renderer got alwaysOnTop=${alwaysOnTop} (STALE!)`);
  const settings = {
    window: { alwaysOnTop: alwaysOnTop },
    audio: { volume: 0.7 }
  };

  console.log('[T=4ms] Main processes save-settings');
  await mainHandleSaveSettings(settings, 4);

  console.log('\n[EXPECTED RESULT with FIX]');
  console.log('  currentSettings.window should still be {alwaysOnTop: true}');
  console.log('  because save-settings PRESERVES window from currentSettings');
  console.log(`  Actual currentSettings.window: ${JSON.stringify(currentSettings.window)}`);

  await sleep(10);
}

async function main() {
  console.log('Testing Always on Top Persistence with Async IPC Simulation');
  console.log(''.repeat(60));

  const results = [];

  results.push(await runTest('Normal Timing (no race)', test1NormalTiming));
  results.push(await runTest('Race Condition Timing', test2RaceCondition));
  results.push(await runTest('Actual Bug Scenario', test3ActualBugScenario));

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Test 1 (Normal): ${results[0] ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 2 (Race):   ${results[1] ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Test 3 (Bug):    ${results[2] ? '✅ PASS' : '❌ FAIL'}`);

  if (results.every(r => r)) {
    console.log('\nAll tests passed! The fix should work.');
  } else {
    console.log('\nSome tests failed! There may still be a bug.');
  }

  cleanup();
}

main().catch(console.error);
