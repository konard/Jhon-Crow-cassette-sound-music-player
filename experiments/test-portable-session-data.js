/**
 * Experiment: Test portable mode session data storage
 *
 * This script demonstrates why BOTH userData and sessionData paths must be set
 * for proper portable mode operation in Electron.
 *
 * Background:
 * - First fix: Only userData was set → settings.json stored correctly, but
 *   Electron created additional folders next to the executable
 * - Second fix: Both userData AND sessionData are set → all data contained
 *   within a single UserData folder
 *
 * The Problem:
 * When only userData is set, Electron still creates session-related folders
 * next to the executable:
 *   - Local Storage/
 *   - Session Storage/
 *   - GPUCache/
 *   - Cache/
 *   - Code Cache/
 *
 * The Solution:
 * Set both paths to the same location:
 *   app.setPath('userData', portableUserData);
 *   app.setPath('sessionData', portableUserData);
 */

const path = require('path');

console.log('=== Portable Mode Session Data Storage Test ===\n');

// Test: Path configuration comparison
function testPathConfiguration() {
  console.log('Test: Portable Mode Path Configuration');
  console.log('──────────────────────────────────────\n');

  const portableDir = 'C:\\PortableApps\\CassettePlayer';
  const portableUserData = path.join(portableDir, 'UserData');

  console.log('Scenario 1: INCORRECT - Only userData set');
  console.log('─────────────────────────────────────────────');
  console.log('Code:');
  console.log('  app.setPath(\'userData\', portableUserData);');
  console.log('  // sessionData NOT set - uses default\n');
  console.log('Result:');
  console.log('  userData: ' + portableUserData);
  console.log('  sessionData: (defaults to system path or near executable)\n');
  console.log('Folder structure:');
  console.log('  C:\\PortableApps\\CassettePlayer\\');
  console.log('    cassette-music-player.exe');
  console.log('    UserData\\');
  console.log('      settings.json           ✓ (correct location)');
  console.log('    Local Storage\\           ✗ (should be in UserData)');
  console.log('    Session Storage\\         ✗ (should be in UserData)');
  console.log('    GPUCache\\                ✗ (should be in UserData)');
  console.log('    Code Cache\\              ✗ (should be in UserData)\n');
  console.log('Status: ✗ FAIL - Pollutes portable directory\n');

  console.log('Scenario 2: CORRECT - Both userData and sessionData set');
  console.log('──────────────────────────────────────────────────────────');
  console.log('Code:');
  console.log('  app.setPath(\'userData\', portableUserData);');
  console.log('  app.setPath(\'sessionData\', portableUserData);\n');
  console.log('Result:');
  console.log('  userData: ' + portableUserData);
  console.log('  sessionData: ' + portableUserData + '\n');
  console.log('Folder structure:');
  console.log('  C:\\PortableApps\\CassettePlayer\\');
  console.log('    cassette-music-player.exe');
  console.log('    UserData\\');
  console.log('      settings.json           ✓ (correct location)');
  console.log('      Local Storage\\         ✓ (correct location)');
  console.log('      Session Storage\\       ✓ (correct location)');
  console.log('      GPUCache\\              ✓ (correct location)');
  console.log('      Code Cache\\            ✓ (correct location)\n');
  console.log('Status: ✓ PASS - All data contained in UserData folder\n');
}

// Test: What sessionData stores
function explainSessionData() {
  console.log('What is stored in sessionData?');
  console.log('──────────────────────────────\n');
  console.log('According to Electron documentation, sessionData stores:');
  console.log('  • localStorage data');
  console.log('  • Cookies');
  console.log('  • Disk cache (HTTP cache)');
  console.log('  • Downloaded dictionaries (spell check)');
  console.log('  • Network state');
  console.log('  • DevTools files');
  console.log('  • GPU cache');
  console.log('  • Code cache (V8 compiled code)\n');
  console.log('IMPORTANT: Chromium may write very large disk cache here!\n');
}

// Test: Timing requirements
function explainTimingRequirements() {
  console.log('Timing Requirements');
  console.log('──────────────────────\n');
  console.log('⚠️  CRITICAL: Both paths must be set BEFORE the \'ready\' event\n');
  console.log('CORRECT:');
  console.log('  const { app } = require(\'electron\');');
  console.log('  ');
  console.log('  // Set paths BEFORE app.whenReady()');
  console.log('  if (isPortable) {');
  console.log('    app.setPath(\'userData\', portableUserData);');
  console.log('    app.setPath(\'sessionData\', portableUserData);');
  console.log('  }');
  console.log('  ');
  console.log('  app.whenReady().then(() => {');
  console.log('    createWindow();');
  console.log('  });\n');
  console.log('INCORRECT:');
  console.log('  app.whenReady().then(() => {');
  console.log('    // TOO LATE - paths already initialized');
  console.log('    app.setPath(\'userData\', portableUserData);');
  console.log('    app.setPath(\'sessionData\', portableUserData);');
  console.log('    createWindow();');
  console.log('  });\n');
}

// Run all tests
testPathConfiguration();
explainSessionData();
explainTimingRequirements();

console.log('User Testing Checklist');
console.log('─────────────────────');
console.log('After applying the fix, verify:');
console.log('  1. Build portable executable: npm run build:portable');
console.log('  2. Extract to clean directory');
console.log('  3. Run the portable EXE');
console.log('  4. Load music, enable shuffle, play tracks');
console.log('  5. Close and reopen the app');
console.log('  6. Check directory structure:');
console.log('     ✓ Only UserData/ folder should exist next to EXE');
console.log('     ✓ All session data inside UserData/');
console.log('     ✓ No Local Storage/, GPUCache/ folders next to EXE');
console.log('  7. Settings should persist across restarts\n');

console.log('=== Test Complete ===\n');
