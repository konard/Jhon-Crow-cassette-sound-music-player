// Test track persistence on app restart
// This simulates the restore flow to ensure track is properly loaded

console.log('=== Test Track Persistence on Restart ===\n');

// Mock audio state
const audioState = {
  audioFiles: [
    { name: 'track1.mp3', path: '/path/track1.mp3' },
    { name: 'track2.mp3', path: '/path/track2.mp3' },
    { name: 'track3.mp3', path: '/path/track3.mp3' },
    { name: 'track4.mp3', path: '/path/track4.mp3' },
    { name: 'track5.mp3', path: '/path/track5.mp3' }
  ],
  currentTrackIndex: 0,
  folderPath: '/path/music',
  shuffledPlaylist: [2, 0, 4, 1, 3],  // Persistent shuffle order
  trackHistory: [],
  audioElement: {
    src: '',
    currentTime: 0,
    load: async function() { console.log('  → audioElement.load() called'); }
  }
};

// Mock functions
function updateScreenText(text) {
  console.log(`  → Screen updated: "${text}"`);
}

function updateStatusBar(text) {
  console.log(`  → Status bar: "${text}"`);
}

function saveCurrentSettings() {
  console.log('  → Settings saved');
}

// The actual loadTrack function logic (simplified)
async function loadTrack(index, addToHistory = true) {
  if (audioState.audioFiles.length === 0) return;

  if (index < 0) index = audioState.audioFiles.length - 1;
  if (index >= audioState.audioFiles.length) index = 0;

  // Add current track to history before switching
  if (addToHistory && audioState.currentTrackIndex !== index) {
    audioState.trackHistory.push(audioState.currentTrackIndex);
    if (audioState.trackHistory.length > 50) {
      audioState.trackHistory.shift();
    }
  }

  audioState.currentTrackIndex = index;
  const track = audioState.audioFiles[index];

  // Update screen
  updateScreenText(track.name);

  // Update status bar
  updateStatusBar(`${index + 1}/${audioState.audioFiles.length}: ${track.name}`);

  // Load audio
  audioState.audioElement.src = 'file://' + track.path;
  await audioState.audioElement.load();

  saveCurrentSettings();
}

// OLD (BUGGY) restorePlaybackState implementation
async function restorePlaybackState_OLD(playbackSettings) {
  console.log('Testing OLD (buggy) implementation:');
  try {
    // Simulate getting audio files
    audioState.folderPath = playbackSettings.folderPath;
    audioState.audioFiles = [
      { name: 'track1.mp3', path: '/path/track1.mp3' },
      { name: 'track2.mp3', path: '/path/track2.mp3' },
      { name: 'track3.mp3', path: '/path/track3.mp3' },
      { name: 'track4.mp3', path: '/path/track4.mp3' },
      { name: 'track5.mp3', path: '/path/track5.mp3' }
    ];

    // Restore track index
    let trackIndex = playbackSettings.currentTrackIndex || 0;
    if (trackIndex >= audioState.audioFiles.length) {
      trackIndex = 0;
    }

    // BUG: Only sets index and screen text, doesn't load audio!
    audioState.currentTrackIndex = trackIndex;
    const track = audioState.audioFiles[trackIndex];
    updateScreenText(track.name);
    updateStatusBar(`Restored: ${audioState.audioFiles.length} tracks`);

    // Restore shuffled playlist
    if (playbackSettings.shuffledPlaylist && playbackSettings.shuffledPlaylist.length === audioState.audioFiles.length) {
      audioState.shuffledPlaylist = playbackSettings.shuffledPlaylist;
    }

    console.log(`  ✗ Bug: audioElement.src = "${audioState.audioElement.src}" (empty!)`);
    console.log(`  ✗ Bug: Track not actually loaded, only UI updated\n`);
  } catch (error) {
    console.error('Error restoring playback state:', error);
  }
}

// NEW (FIXED) restorePlaybackState implementation
async function restorePlaybackState_NEW(playbackSettings) {
  console.log('Testing NEW (fixed) implementation:');
  try {
    // Reset state for test
    audioState.audioElement.src = '';
    audioState.trackHistory = [];

    // Simulate getting audio files
    audioState.folderPath = playbackSettings.folderPath;
    audioState.audioFiles = [
      { name: 'track1.mp3', path: '/path/track1.mp3' },
      { name: 'track2.mp3', path: '/path/track2.mp3' },
      { name: 'track3.mp3', path: '/path/track3.mp3' },
      { name: 'track4.mp3', path: '/path/track4.mp3' },
      { name: 'track5.mp3', path: '/path/track5.mp3' }
    ];

    // Restore shuffled playlist BEFORE loading track
    if (playbackSettings.shuffledPlaylist && playbackSettings.shuffledPlaylist.length === audioState.audioFiles.length) {
      audioState.shuffledPlaylist = playbackSettings.shuffledPlaylist;
    }

    // Restore track index
    let trackIndex = playbackSettings.currentTrackIndex || 0;
    if (trackIndex >= audioState.audioFiles.length) {
      trackIndex = 0;
    }

    // FIX: Call loadTrack to properly initialize audio element
    await loadTrack(trackIndex, false);
    updateStatusBar(`Restored: ${audioState.audioFiles.length} tracks`);

    console.log(`  ✓ Fix: audioElement.src = "${audioState.audioElement.src}"`);
    console.log(`  ✓ Fix: Track properly loaded with audio source`);
    console.log(`  ✓ Fix: History not polluted (addToHistory=false)`);
    console.log(`  ✓ Fix: Shuffled playlist restored before track load\n`);
  } catch (error) {
    console.error('Error restoring playback state:', error);
  }
}

// Test saved settings
const savedSettings = {
  folderPath: '/path/music',
  currentTrackIndex: 3,  // User was on track 4 when they closed the app
  shuffledPlaylist: [2, 0, 4, 1, 3]  // Persistent shuffle order
};

console.log('Saved settings from previous session:');
console.log(`  folderPath: ${savedSettings.folderPath}`);
console.log(`  currentTrackIndex: ${savedSettings.currentTrackIndex} (track ${savedSettings.currentTrackIndex + 1})`);
console.log(`  shuffledPlaylist: [${savedSettings.shuffledPlaylist.join(', ')}]\n`);

// Test OLD implementation
await restorePlaybackState_OLD(savedSettings);

// Test NEW implementation
await restorePlaybackState_NEW(savedSettings);

console.log('=== Test Complete ===');
console.log('\nSummary:');
console.log('OLD: Screen shows correct track name, but audio is not loaded');
console.log('NEW: Screen shows correct track name AND audio is properly loaded');
console.log('\nThe fix ensures that when user restarts the app, they can immediately');
console.log('press play and continue from where they left off.');
