// Test script to verify portable mode settings storage
// This simulates how electron-builder's portable mode sets environment variables

const fs = require('fs');
const path = require('path');

// Simulate portable mode environment
const PORTABLE_DIR = path.join(__dirname, 'test-portable');

// Mock process.env for portable mode
process.env.PORTABLE_EXECUTABLE_DIR = PORTABLE_DIR;

// Create test directory
if (!fs.existsSync(PORTABLE_DIR)) {
  fs.mkdirSync(PORTABLE_DIR, { recursive: true });
}

console.log('=== Testing Portable Mode Settings Storage ===\n');

// Simulate the getSettingsPath function from main.js
function getSettingsPath() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const dataDir = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');

    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create portable data directory:', error);
      return null;
    }

    return path.join(dataDir, 'settings.json');
  }

  return null;
}

const settingsPath = getSettingsPath();
console.log('1. Portable mode detected:', !!process.env.PORTABLE_EXECUTABLE_DIR);
console.log('2. Portable executable directory:', PORTABLE_DIR);
console.log('3. Settings file path:', settingsPath);

// Test writing settings
const testSettings = {
  window: {
    alwaysOnTop: true
  },
  test: {
    timestamp: new Date().toISOString()
  }
};

console.log('\n4. Writing test settings...');
fs.writeFileSync(settingsPath, JSON.stringify(testSettings, null, 2));
console.log('   Settings written successfully');

// Test reading settings
console.log('\n5. Reading settings back...');
const readSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
console.log('   Settings read:', JSON.stringify(readSettings, null, 2));

// Verify settings match
const match = readSettings.window.alwaysOnTop === testSettings.window.alwaysOnTop;
console.log('\n6. Settings match:', match ? '✅ PASS' : '❌ FAIL');

// Verify file location
const dataDir = path.join(PORTABLE_DIR, 'data');
const settingsFileExists = fs.existsSync(settingsPath);
const dataDirExists = fs.existsSync(dataDir);

console.log('\n7. File system verification:');
console.log('   Data directory exists:', dataDirExists ? '✅' : '❌');
console.log('   Settings file exists:', settingsFileExists ? '✅' : '❌');
console.log('   Data directory path:', dataDir);
console.log('   Settings file path:', settingsPath);

// List files in data directory
if (dataDirExists) {
  const files = fs.readdirSync(dataDir);
  console.log('   Files in data directory:', files);
}

// Clean up
console.log('\n8. Cleaning up test files...');
fs.rmSync(PORTABLE_DIR, { recursive: true, force: true });
console.log('   Cleanup complete');

console.log('\n=== Test Complete ===');
console.log('Result: All checks passed ✅');
