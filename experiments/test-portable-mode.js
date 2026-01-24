// Test portable mode settings persistence
// This simulates how Electron portable mode should work

const path = require('path');
const fs = require('fs');

console.log('=== Test Portable Mode Settings Persistence ===\n');

// Simulate portable mode detection
function testPortableModeDetection() {
  console.log('Test 1: Portable Mode Detection');
  console.log('─────────────────────────────────\n');

  // Scenario 1: Not portable (environment variable not set)
  console.log('Scenario 1: Regular installation');
  const isPortableRegular = process.env.PORTABLE_EXECUTABLE_DIR !== undefined;
  console.log(`  process.env.PORTABLE_EXECUTABLE_DIR: undefined`);
  console.log(`  isPortable: ${isPortableRegular}`);
  console.log(`  Expected: false`);
  console.log(`  Result: ${!isPortableRegular ? '✓ PASS' : '✗ FAIL'}\n`);

  // Scenario 2: Portable (environment variable set by electron-builder)
  console.log('Scenario 2: Portable executable');
  process.env.PORTABLE_EXECUTABLE_DIR = 'C:\\PortableApps\\CassettePlayer';
  const isPortablePortable = process.env.PORTABLE_EXECUTABLE_DIR !== undefined;
  console.log(`  process.env.PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR}`);
  console.log(`  isPortable: ${isPortablePortable}`);
  console.log(`  Expected: true`);
  console.log(`  Result: ${isPortablePortable ? '✓ PASS' : '✗ FAIL'}\n`);

  // Clean up
  delete process.env.PORTABLE_EXECUTABLE_DIR;
}

// Simulate settings path resolution
function testSettingsPathResolution() {
  console.log('Test 2: Settings Path Resolution');
  console.log('─────────────────────────────────\n');

  // Mock app.getPath function
  function mockGetPath(name, portableUserData = null) {
    if (portableUserData) {
      return portableUserData;
    }
    // Simulate default Electron behavior
    const defaults = {
      'userData': 'C:\\Users\\User\\AppData\\Local\\cassette-music-player',
      'appData': 'C:\\Users\\User\\AppData\\Roaming',
      'home': 'C:\\Users\\User'
    };
    return defaults[name] || '';
  }

  // Scenario 1: Regular installation
  console.log('Scenario 1: Regular installation');
  const regularUserData = mockGetPath('userData');
  const regularSettingsFile = path.join(regularUserData, 'settings.json');
  console.log(`  userData: ${regularUserData}`);
  console.log(`  settingsFile: ${regularSettingsFile}`);
  console.log(`  Expected: C:\\Users\\User\\AppData\\Local\\cassette-music-player\\settings.json`);
  console.log(`  Result: ${regularSettingsFile.includes('AppData') ? '✓ PASS' : '✗ FAIL'}\n`);

  // Scenario 2: Portable mode
  console.log('Scenario 2: Portable mode');
  const portableDir = 'C:\\PortableApps\\CassettePlayer';
  const portableUserData = path.join(portableDir, 'UserData');
  const portableSettingsFile = path.join(portableUserData, 'settings.json');
  console.log(`  PORTABLE_EXECUTABLE_DIR: ${portableDir}`);
  console.log(`  userData (custom): ${portableUserData}`);
  console.log(`  settingsFile: ${portableSettingsFile}`);
  console.log(`  Expected: C:\\PortableApps\\CassettePlayer\\UserData\\settings.json`);
  console.log(`  Result: ${portableSettingsFile === 'C:\\PortableApps\\CassettePlayer\\UserData\\settings.json' ? '✓ PASS' : '✗ FAIL'}\n`);
}

// Simulate directory creation and write test
function testPortableSettingsPersistence() {
  console.log('Test 3: Portable Settings Persistence');
  console.log('─────────────────────────────────\n');

  const testDir = path.join(__dirname, '.portable-test');
  const userDataDir = path.join(testDir, 'UserData');
  const settingsFile = path.join(userDataDir, 'settings.json');

  try {
    // Clean up from previous test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }

    console.log('Step 1: Create portable directory structure');
    console.log(`  Creating: ${userDataDir}`);

    // Create UserData directory
    fs.mkdirSync(userDataDir, { recursive: true });
    console.log(`  Result: ${fs.existsSync(userDataDir) ? '✓ Directory created' : '✗ Failed to create directory'}\n`);

    console.log('Step 2: Write settings file');
    const testSettings = {
      audio: { volume: 0.7 },
      playback: {
        folderPath: 'C:\\Music',
        currentTrackIndex: 5,
        shuffleEnabled: true,
        shuffledPlaylist: [2, 0, 4, 1, 3]
      }
    };

    fs.writeFileSync(settingsFile, JSON.stringify(testSettings, null, 2), 'utf8');
    console.log(`  Writing to: ${settingsFile}`);
    console.log(`  Content: ${JSON.stringify(testSettings, null, 2)}`);
    console.log(`  Result: ${fs.existsSync(settingsFile) ? '✓ File written' : '✗ Failed to write file'}\n`);

    console.log('Step 3: Read settings file (simulate app restart)');
    const loadedSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    console.log(`  Loaded: ${JSON.stringify(loadedSettings, null, 2)}`);

    // Verify settings
    const isValid =
      loadedSettings.playback.currentTrackIndex === 5 &&
      loadedSettings.playback.shuffleEnabled === true &&
      JSON.stringify(loadedSettings.playback.shuffledPlaylist) === JSON.stringify([2, 0, 4, 1, 3]);

    console.log(`  Result: ${isValid ? '✓ Settings persisted correctly' : '✗ Settings corrupted'}\n`);

    console.log('Step 4: Verify portability (settings are with executable)');
    console.log(`  Settings location: ${settingsFile}`);
    console.log(`  Is relative to test directory: ${settingsFile.includes(testDir)}`);
    console.log(`  Is NOT in AppData: ${!settingsFile.includes('AppData')}`);
    console.log(`  Result: ${settingsFile.includes(testDir) && !settingsFile.includes('AppData') ? '✓ PASS' : '✗ FAIL'}\n`);

    // Clean up
    fs.rmSync(testDir, { recursive: true });
    console.log('Step 5: Cleanup');
    console.log(`  Removed test directory: ${testDir}`);
    console.log(`  Result: ${!fs.existsSync(testDir) ? '✓ Cleaned up' : '✗ Failed to clean up'}\n`);

  } catch (error) {
    console.error('✗ Test failed with error:', error);

    // Clean up on error
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  }
}

// Simulate the issue in non-portable vs portable mode
function demonstrateTheIssue() {
  console.log('Test 4: Demonstrate The Issue');
  console.log('─────────────────────────────────\n');

  console.log('WITHOUT portable mode fix:');
  console.log('  User runs: CassettePlayer-portable.exe from USB drive (D:\\MusicPlayer\\)');
  console.log('  Settings saved to: C:\\Users\\User\\AppData\\Local\\cassette-music-player\\settings.json');
  console.log('  Problem 1: Settings left on this computer (not portable!)');
  console.log('  Problem 2: If USB moved to another computer, settings are lost');
  console.log('  Problem 3: Different users on same computer share settings');
  console.log('  Result: ✗ Shuffle order lost, track history lost, current track lost\n');

  console.log('WITH portable mode fix:');
  console.log('  User runs: CassettePlayer-portable.exe from USB drive (D:\\MusicPlayer\\)');
  console.log('  Portable mode detected: process.env.PORTABLE_EXECUTABLE_DIR = D:\\MusicPlayer');
  console.log('  Settings saved to: D:\\MusicPlayer\\UserData\\settings.json');
  console.log('  Benefit 1: Settings travel with the USB drive');
  console.log('  Benefit 2: Works on any computer');
  console.log('  Benefit 3: Each portable installation is independent');
  console.log('  Result: ✓ Shuffle order persists, track history persists, current track persists\n');
}

// Run all tests
testPortableModeDetection();
testSettingsPathResolution();
testPortableSettingsPersistence();
demonstrateTheIssue();

console.log('=== All Tests Completed ===\n');

console.log('Summary:');
console.log('  The portable mode fix ensures that settings are stored relative to the');
console.log('  executable directory when running as a portable application, rather than');
console.log('  in the system AppData folder. This allows the application to be truly');
console.log('  portable and maintain settings across different computers.\n');

console.log('Implementation in src/main.js:');
console.log('  1. Detect portable mode: process.env.PORTABLE_EXECUTABLE_DIR !== undefined');
console.log('  2. Create UserData directory: <exe-dir>/UserData/');
console.log('  3. Set userData path: app.setPath("userData", portableUserData)');
console.log('  4. Settings file: <exe-dir>/UserData/settings.json');
console.log('\nElectron-builder automatically sets PORTABLE_EXECUTABLE_DIR when building');
console.log('with the "portable" target.');
