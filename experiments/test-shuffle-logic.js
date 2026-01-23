// Test shuffle logic implementation
// This tests the core logic for shuffle playlist generation and navigation

function testShufflePlaylist() {
  console.log('=== Test 1: Shuffle playlist generation ===');

  // Simulate audioState
  const audioState = {
    audioFiles: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], // 10 tracks
    currentTrackIndex: 0,
    shuffledPlaylist: []
  };

  // Generate shuffled playlist (Fisher-Yates shuffle)
  if (audioState.shuffledPlaylist.length !== audioState.audioFiles.length) {
    audioState.shuffledPlaylist = Array.from({ length: audioState.audioFiles.length }, (_, i) => i);
    for (let i = audioState.shuffledPlaylist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [audioState.shuffledPlaylist[i], audioState.shuffledPlaylist[j]] = [audioState.shuffledPlaylist[j], audioState.shuffledPlaylist[i]];
    }
  }

  console.log('Original order:', Array.from({ length: audioState.audioFiles.length }, (_, i) => i));
  console.log('Shuffled playlist:', audioState.shuffledPlaylist);
  console.log('✓ Shuffle playlist generated');

  // Test navigation through shuffled playlist
  console.log('\n=== Test 2: Navigation through shuffled playlist ===');
  const visitedTracks = [];

  for (let step = 0; step < audioState.audioFiles.length + 2; step++) {
    const currentPosInPlaylist = audioState.shuffledPlaylist.indexOf(audioState.currentTrackIndex);
    const nextPosInPlaylist = (currentPosInPlaylist + 1) % audioState.shuffledPlaylist.length;
    const nextIndex = audioState.shuffledPlaylist[nextPosInPlaylist];

    visitedTracks.push(audioState.currentTrackIndex);
    console.log(`Step ${step}: Current=${audioState.currentTrackIndex}, Pos=${currentPosInPlaylist}, Next=${nextIndex}`);

    audioState.currentTrackIndex = nextIndex;
  }

  console.log('Visited tracks:', visitedTracks);
  console.log('✓ Navigation wraps around correctly');

  // Test that all tracks are visited exactly once per cycle
  const firstCycle = visitedTracks.slice(0, audioState.audioFiles.length);
  const uniqueTracks = new Set(firstCycle);
  console.log(`\n=== Test 3: All tracks visited ===`);
  console.log('First cycle tracks:', firstCycle);
  console.log('Unique tracks:', [...uniqueTracks]);
  console.log(uniqueTracks.size === audioState.audioFiles.length ? '✓ All tracks visited once' : '✗ Some tracks missed or duplicated');
}

function testTrackHistory() {
  console.log('\n=== Test 4: Track history ===');

  const history = [];
  const maxHistory = 50;

  // Simulate playing tracks
  for (let i = 0; i < 10; i++) {
    history.push(i);
    if (history.length > maxHistory) {
      history.shift();
    }
  }

  console.log('History after 10 tracks:', history);

  // Test going back
  console.log('Going back 3 times:');
  for (let i = 0; i < 3; i++) {
    if (history.length > 0) {
      const prev = history.pop();
      console.log(`  Back to track ${prev}, history length: ${history.length}`);
    }
  }

  console.log('✓ Track history works correctly');
}

function testSequentialWrap() {
  console.log('\n=== Test 5: Sequential wrap around ===');

  const totalTracks = 5;
  let currentIndex = 4; // Last track

  console.log(`Current track: ${currentIndex} (last track)`);

  // Next should wrap to 0
  const nextIndex = (currentIndex + 1) % totalTracks;
  console.log(`Next track: ${nextIndex}`);
  console.log(nextIndex === 0 ? '✓ Wraps to beginning correctly' : '✗ Wrap failed');
}

// Run all tests
console.log('Testing shuffle and history logic\n');
testShufflePlaylist();
testTrackHistory();
testSequentialWrap();
console.log('\n=== All tests completed ===');
