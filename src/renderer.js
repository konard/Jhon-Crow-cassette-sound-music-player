// Cassette Music Player - Renderer
// Sony-style portable cassette player with 3D visuals and tape effects

// ============================================================================
// PLATFORM DETECTION
// ============================================================================
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
const isElectron = !!(window.electronAPI);
const isCapacitor = typeof window.Capacitor !== 'undefined';

// Screen Orientation API (Capacitor plugin will be loaded if available)
let ScreenOrientation = null;

// Apply mobile class to body if on mobile platform
if (isMobile || isCapacitor) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('mobile-platform');
  });

  // Try to load Capacitor Screen Orientation plugin
  if (isCapacitor && window.Capacitor.Plugins) {
    ScreenOrientation = window.Capacitor.Plugins.ScreenOrientation;
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  camera: {
    fov: 45,
    near: 0.1,
    far: 1000,
    position: { x: 0, y: 0.05, z: 0.15 },  // Centered x, starting at max zoom without going inside
    lookAt: { x: 0, y: 0.04, z: 0 }
  },
  colors: {
    background: 0x1a1a2e,
    ambient: 0x404060,
    directional: 0xffffff
  },
  player: {
    // Sony Walkman WM-10 inspired colors
    mainColor: '#d4d0c8',    // Cream/silver body
    accentColor: '#c41e3a',  // Red accent
    metalColor: '#b0b0b0',   // Metal parts
    screenColor: '#2d4a3e',  // LCD green background
    textColor: '#7cfc7c'     // LCD green text
  },
  audio: {
    tapeHissLevel: 0.3,
    wowFlutterLevel: 0.5,
    saturationLevel: 0.4,
    lowCutoff: 80,
    highCutoff: 12000,
    volume: 0.7,
    effectsEnabled: true
  },
  appearance: {
    gradientEnabled: false,
    gradientStartColor: '#1a1a2e',
    gradientEndColor: '#2a2a4e',
    gradientAngle: 180,
    backgroundOpacity: 80
  },
  mobile: {
    autoRotate: false  // Default: locked to landscape
  }
};

// ============================================================================
// GLOBAL STATE
// ============================================================================
let scene, camera, renderer;
let cassettePlayer;
let raycaster, mouse;
let animationId;

// Audio state
let audioState = {
  audioContext: null,
  audioElement: null,
  sourceNode: null,
  effectNodes: null,
  isPlaying: false,
  currentTrackIndex: 0,
  audioFiles: [],
  folderPath: null
};

// Animation state
let reelRotation = 0;

// Drag state for window movement via cassette
let isDragging = false;
let dragStartMouse = { x: 0, y: 0 };

// UI references
let screenCanvas, screenCtx, screenTexture;

// ============================================================================
// INITIALIZATION
// ============================================================================
async function init() {
  // Hide loading
  document.getElementById('loading').classList.add('hidden');

  // Load saved settings
  await loadSavedSettings();

  // Setup Three.js
  setupThreeJS();

  // Create cassette player (side view)
  cassettePlayer = createCassettePlayer();
  scene.add(cassettePlayer);

  // Setup event listeners
  setupEventListeners();

  // Apply loaded appearance settings
  updateBackgroundGradient();

  // Set initial visibility for bottom captions based on window size
  updateBottomCaptionsVisibility();

  // Initialize mobile orientation (lock to landscape by default)
  await initMobileOrientation();

  // Start animation loop
  animate();
}

// Load settings from persistent storage (Electron only)
async function loadSavedSettings() {
  if (!isElectron) return;

  try {
    if (window.electronAPI.getSettings) {
      const settings = await window.electronAPI.getSettings();
      if (settings) {
        // Apply audio settings
        if (settings.audio) {
          CONFIG.audio.volume = settings.audio.volume ?? CONFIG.audio.volume;
          CONFIG.audio.tapeHissLevel = settings.audio.tapeHissLevel ?? CONFIG.audio.tapeHissLevel;
          CONFIG.audio.wowFlutterLevel = settings.audio.wowFlutterLevel ?? CONFIG.audio.wowFlutterLevel;
          CONFIG.audio.saturationLevel = settings.audio.saturationLevel ?? CONFIG.audio.saturationLevel;
          CONFIG.audio.lowCutoff = settings.audio.lowCutoff ?? CONFIG.audio.lowCutoff;
          CONFIG.audio.highCutoff = settings.audio.highCutoff ?? CONFIG.audio.highCutoff;
          CONFIG.audio.effectsEnabled = settings.audio.effectsEnabled ?? CONFIG.audio.effectsEnabled;
        }
        // Apply appearance settings
        if (settings.appearance) {
          CONFIG.appearance.gradientEnabled = settings.appearance.gradientEnabled ?? CONFIG.appearance.gradientEnabled;
          CONFIG.appearance.gradientStartColor = settings.appearance.gradientStartColor ?? CONFIG.appearance.gradientStartColor;
          CONFIG.appearance.gradientEndColor = settings.appearance.gradientEndColor ?? CONFIG.appearance.gradientEndColor;
          CONFIG.appearance.gradientAngle = settings.appearance.gradientAngle ?? CONFIG.appearance.gradientAngle;
          CONFIG.appearance.backgroundOpacity = settings.appearance.backgroundOpacity ?? CONFIG.appearance.backgroundOpacity;
        }
        // Restore playback state (folder and track)
        if (settings.playback && settings.playback.folderPath) {
          await restorePlaybackState(settings.playback);
        }
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Restore playback state from saved settings
async function restorePlaybackState(playbackSettings) {
  try {
    if (!playbackSettings.folderPath) return;

    // Get audio files from the saved folder
    const result = await window.electronAPI.getAudioFilesFromPath(playbackSettings.folderPath);
    if (result && result.audioFiles && result.audioFiles.length > 0) {
      audioState.folderPath = playbackSettings.folderPath;
      audioState.audioFiles = result.audioFiles;

      // Restore track index, clamping to valid range
      let trackIndex = playbackSettings.currentTrackIndex || 0;
      if (trackIndex >= audioState.audioFiles.length) {
        trackIndex = 0;
      }

      audioState.currentTrackIndex = trackIndex;
      const track = audioState.audioFiles[trackIndex];
      updateScreenText(track.name);
      updateStatusBar(`Restored: ${audioState.audioFiles.length} tracks`);
    }
  } catch (error) {
    console.error('Error restoring playback state:', error);
  }
}

// Save current settings to persistent storage (Electron only)
function saveCurrentSettings() {
  if (!isElectron) return;

  try {
    if (window.electronAPI.saveSettings) {
      const settings = {
        audio: {
          volume: CONFIG.audio.volume,
          tapeHissLevel: CONFIG.audio.tapeHissLevel,
          wowFlutterLevel: CONFIG.audio.wowFlutterLevel,
          saturationLevel: CONFIG.audio.saturationLevel,
          lowCutoff: CONFIG.audio.lowCutoff,
          highCutoff: CONFIG.audio.highCutoff,
          effectsEnabled: CONFIG.audio.effectsEnabled
        },
        appearance: {
          gradientEnabled: CONFIG.appearance.gradientEnabled,
          gradientStartColor: CONFIG.appearance.gradientStartColor,
          gradientEndColor: CONFIG.appearance.gradientEndColor,
          gradientAngle: CONFIG.appearance.gradientAngle,
          backgroundOpacity: CONFIG.appearance.backgroundOpacity
        },
        playback: {
          folderPath: audioState.folderPath,
          currentTrackIndex: audioState.currentTrackIndex
        }
      };
      window.electronAPI.saveSettings(settings);
    }
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

function setupThreeJS() {
  const canvas = document.getElementById('three-canvas');
  const container = document.getElementById('canvas-container');

  // Create scene with transparent background
  scene = new THREE.Scene();
  // No scene.background set - allows transparent window

  // Create camera
  camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    container.clientWidth / container.clientHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
  camera.position.set(
    CONFIG.camera.position.x,
    CONFIG.camera.position.y,
    CONFIG.camera.position.z
  );
  camera.lookAt(
    CONFIG.camera.lookAt.x,
    CONFIG.camera.lookAt.y,
    CONFIG.camera.lookAt.z
  );

  // Create renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting
  const ambientLight = new THREE.AmbientLight(CONFIG.colors.ambient, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(CONFIG.colors.directional, 0.8);
  directionalLight.position.set(5, 10, 7);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Add rim light for 3D depth
  const rimLight = new THREE.DirectionalLight(0x6699ff, 0.3);
  rimLight.position.set(-5, 5, -5);
  scene.add(rimLight);

  // Raycaster for mouse interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Handle window resize
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);

  // Hide bottom captions when window is small
  updateBottomCaptionsVisibility();
}

// Show/hide UI elements based on window size
function updateBottomCaptionsVisibility() {
  const controlsHint = document.getElementById('controls-hint');
  const statusBar = document.getElementById('status-bar');
  const windowControls = document.getElementById('window-controls');

  // Hide captions when window height is less than 200px
  const captionThreshold = 200;
  const isSmallHeight = window.innerHeight < captionThreshold;

  if (controlsHint) {
    controlsHint.style.display = isSmallHeight ? 'none' : 'block';
  }
  if (statusBar) {
    statusBar.style.display = isSmallHeight ? 'none' : 'block';
  }

  // Hide window controls when window is very small (height or width < 120px)
  const controlsThreshold = 120;
  const isVerySmall = window.innerHeight < controlsThreshold || window.innerWidth < controlsThreshold;

  if (windowControls) {
    windowControls.style.display = isVerySmall ? 'none' : 'flex';
  }
}

// ============================================================================
// CASSETTE PLAYER MODEL (Side View - Sony WM-10 Style)
// ============================================================================
function createCassettePlayer() {
  const group = new THREE.Group();

  // Materials
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CONFIG.player.mainColor),
    roughness: 0.35,
    metalness: 0.15
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CONFIG.player.accentColor),
    roughness: 0.3,
    metalness: 0.4
  });

  const metalMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CONFIG.player.metalColor),
    roughness: 0.2,
    metalness: 0.8
  });

  const blackMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.8,
    metalness: 0.1
  });

  const darkPanelMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    roughness: 0.6,
    metalness: 0.1
  });

  // Main body dimensions (side view orientation - we see the narrow side)
  const bodyWidth = 0.11;   // Width (cassette width)
  const bodyHeight = 0.08;  // Height (cassette height + controls)
  const bodyDepth = 0.022;  // Depth (player thickness - what we see from side)

  // Main body - cream/silver colored with rounded edges effect
  const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = bodyHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Body edge bevels (chamfered corners for 3D look)
  const chamferSize = 0.002;
  const chamferGeometry = new THREE.BoxGeometry(bodyWidth + 0.001, chamferSize, bodyDepth + 0.001);

  // Top chamfer
  const topChamfer = new THREE.Mesh(chamferGeometry, bodyMaterial);
  topChamfer.position.set(0, bodyHeight - chamferSize/2, 0);
  group.add(topChamfer);

  // Red accent stripes at top and bottom (Sony Walkman signature)
  const topStripe = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth + 0.002, 0.003, bodyDepth + 0.002),
    accentMaterial
  );
  topStripe.position.set(0, bodyHeight - 0.0015, 0);
  group.add(topStripe);

  const bottomStripe = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth + 0.002, 0.003, bodyDepth + 0.002),
    accentMaterial
  );
  bottomStripe.position.set(0, 0.0015, 0);
  group.add(bottomStripe);

  // Cassette window area (front face - visible from side angle)
  const windowWidth = bodyWidth * 0.75;
  const windowHeight = bodyHeight * 0.55;

  // Dark cassette area background
  const cassetteArea = new THREE.Mesh(
    new THREE.BoxGeometry(windowWidth + 0.008, windowHeight + 0.008, 0.003),
    darkPanelMaterial
  );
  cassetteArea.position.set(-bodyWidth * 0.05, bodyHeight * 0.58, bodyDepth / 2 + 0.001);
  group.add(cassetteArea);

  // Cassette window (transparent, shows reels)
  const cassetteWindow = new THREE.Mesh(
    new THREE.BoxGeometry(windowWidth, windowHeight, 0.002),
    new THREE.MeshStandardMaterial({
      color: 0x4a4a5a,
      roughness: 0.1,
      metalness: 0.0,
      transparent: true,
      opacity: 0.4
    })
  );
  cassetteWindow.position.set(-bodyWidth * 0.05, bodyHeight * 0.58, bodyDepth / 2 + 0.003);
  group.add(cassetteWindow);

  // Cassette reels group
  const reelGroup = new THREE.Group();
  reelGroup.name = 'reels';
  reelGroup.position.set(-bodyWidth * 0.05, bodyHeight * 0.58, bodyDepth / 2 + 0.005);

  const reelRadius = 0.018;
  const reelSpacing = 0.028;
  const reelGeometry = new THREE.CylinderGeometry(reelRadius, reelRadius, 0.004, 24);
  const reelMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d2d3d,
    roughness: 0.4,
    metalness: 0.3
  });

  // Left reel (supply)
  const leftReelGroup = new THREE.Group();
  leftReelGroup.name = 'leftReel';
  leftReelGroup.position.set(-reelSpacing, 0, 0);
  const leftReelMesh = new THREE.Mesh(reelGeometry, reelMaterial);
  leftReelMesh.rotation.x = Math.PI / 2;
  leftReelGroup.add(leftReelMesh);
  reelGroup.add(leftReelGroup);

  // Right reel (take-up)
  const rightReelGroup = new THREE.Group();
  rightReelGroup.name = 'rightReel';
  rightReelGroup.position.set(reelSpacing, 0, 0);
  const rightReelMesh = new THREE.Mesh(reelGeometry, reelMaterial);
  rightReelMesh.rotation.x = Math.PI / 2;
  rightReelGroup.add(rightReelMesh);
  reelGroup.add(rightReelGroup);

  // Reel center hubs (white with hexagonal shape)
  const hubGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.006, 6);
  const hubMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    roughness: 0.3
  });

  const leftHub = new THREE.Mesh(hubGeometry, hubMaterial);
  leftHub.rotation.x = Math.PI / 2;
  leftHub.position.set(-reelSpacing, 0, 0.002);
  reelGroup.add(leftHub);

  const rightHub = new THREE.Mesh(hubGeometry, hubMaterial);
  rightHub.rotation.x = Math.PI / 2;
  rightHub.position.set(reelSpacing, 0, 0.002);
  reelGroup.add(rightHub);

  // Tape path between reels
  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(reelSpacing * 1.6, 0.003, 0.001),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 })
  );
  tape.position.set(0, -reelRadius * 0.7, 0.002);
  reelGroup.add(tape);

  group.add(reelGroup);
  group.userData.reelGroup = reelGroup;

  // "SONY" label at top left
  const sonyLabel = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.005, 0.001),
    new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 })
  );
  sonyLabel.position.set(-bodyWidth * 0.32, bodyHeight * 0.88, bodyDepth / 2 + 0.002);
  group.add(sonyLabel);

  // "WALKMAN" vertical text area (red label)
  const walkmanLabel = new THREE.Mesh(
    new THREE.BoxGeometry(0.005, 0.028, 0.001),
    accentMaterial
  );
  walkmanLabel.position.set(bodyWidth * 0.42, bodyHeight * 0.55, bodyDepth / 2 + 0.002);
  group.add(walkmanLabel);

  // LCD Screen for track name
  const screenWidth = bodyWidth * 0.7;
  const screenHeight = 0.012;

  const screenBack = new THREE.Mesh(
    new THREE.PlaneGeometry(screenWidth, screenHeight),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(CONFIG.player.screenColor),
      roughness: 0.8,
      metalness: 0.0
    })
  );
  screenBack.position.set(-bodyWidth * 0.05, bodyHeight * 0.15, bodyDepth / 2 + 0.002);
  screenBack.name = 'screen';
  group.add(screenBack);

  // Screen text canvas texture
  screenCanvas = document.createElement('canvas');
  screenCanvas.width = 256;
  screenCanvas.height = 32;
  screenCtx = screenCanvas.getContext('2d');

  // Initial screen display
  updateScreenText('NO FOLDER');

  screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.needsUpdate = true;

  const screenDisplay = new THREE.Mesh(
    new THREE.PlaneGeometry(screenWidth * 0.95, screenHeight * 0.85),
    new THREE.MeshBasicMaterial({ map: screenTexture, transparent: true })
  );
  screenDisplay.position.set(-bodyWidth * 0.05, bodyHeight * 0.15, bodyDepth / 2 + 0.003);
  screenDisplay.name = 'screenDisplay';
  group.add(screenDisplay);

  // Control buttons on TOP EDGE (slider style like WM-10)
  const buttonY = bodyHeight;
  const buttonZ = 0;
  const buttonSpacing = 0.015;

  const buttonsGroup = new THREE.Group();
  buttonsGroup.name = 'buttons';

  const buttonMaterial = new THREE.MeshStandardMaterial({
    color: 0xa0a0a0,
    roughness: 0.3,
    metalness: 0.5
  });

  const sliderButtonGeometry = new THREE.BoxGeometry(0.010, 0.004, 0.007);
  const symbolMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 });

  // Button configurations: [name, type, xOffset, symbol]
  const buttons = [
    { name: 'prevButton', type: 'prev', x: -buttonSpacing * 1.5 },
    { name: 'playButton', type: 'play', x: -buttonSpacing * 0.5 },
    { name: 'stopButton', type: 'stop', x: buttonSpacing * 0.5 },
    { name: 'nextButton', type: 'next', x: buttonSpacing * 1.5 }
  ];

  buttons.forEach(btn => {
    const button = new THREE.Mesh(sliderButtonGeometry, buttonMaterial.clone());
    button.position.set(btn.x, buttonY + 0.002, buttonZ);
    button.name = btn.name;
    button.userData.buttonType = btn.type;
    button.userData.isButton = true;
    buttonsGroup.add(button);
  });

  // Play button has red dot
  const playDot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0015, 0.0015, 0.001, 8),
    accentMaterial
  );
  playDot.rotation.x = Math.PI / 2;
  playDot.position.set(-buttonSpacing * 0.5, buttonY + 0.005, buttonZ);
  playDot.userData.buttonType = 'play';
  playDot.userData.isButton = true;
  buttonsGroup.add(playDot);

  group.add(buttonsGroup);
  group.userData.buttonsGroup = buttonsGroup;

  // Volume wheel on side (visible in side view)
  const volumeWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.006, 12),
    metalMaterial
  );
  volumeWheel.rotation.z = Math.PI / 2;
  volumeWheel.position.set(bodyWidth / 2 + 0.003, bodyHeight * 0.5, 0);
  volumeWheel.name = 'volumeWheel';
  group.add(volumeWheel);

  // Volume wheel ridges
  for (let i = 0; i < 8; i++) {
    const ridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.0006, 0.0004, 0.004),
      blackMaterial
    );
    const angle = (i / 8) * Math.PI * 2;
    ridge.position.set(
      bodyWidth / 2 + 0.003 + Math.cos(angle) * 0.004,
      bodyHeight * 0.5 + Math.sin(angle) * 0.004,
      0
    );
    ridge.rotation.z = angle;
    group.add(ridge);
  }

  // Headphone jack on bottom
  const jack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.002, 0.002, 0.005, 8),
    blackMaterial
  );
  jack.position.set(-bodyWidth * 0.2, 0, 0);
  group.add(jack);

  // Belt clip on back (visible from side)
  const clip = new THREE.Mesh(
    new THREE.BoxGeometry(0.020, 0.005, 0.010),
    metalMaterial
  );
  clip.position.set(0, bodyHeight * 0.7, -bodyDepth / 2 - 0.005);
  group.add(clip);

  // SIDE DETAILS (what makes it look 3D from side view)

  // Side panel with depth indication
  const sidePanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.002, bodyHeight * 0.9, bodyDepth * 0.8),
    new THREE.MeshStandardMaterial({
      color: 0xc8c4bc,
      roughness: 0.4,
      metalness: 0.1
    })
  );
  sidePanel.position.set(-bodyWidth / 2 - 0.001, bodyHeight / 2, 0);
  group.add(sidePanel);

  // Cassette door hinge indication on side
  const hingeLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.001, bodyHeight * 0.5, 0.001),
    blackMaterial
  );
  hingeLine.position.set(-bodyWidth / 2 + 0.002, bodyHeight * 0.6, bodyDepth / 2 - 0.002);
  group.add(hingeLine);

  // Battery compartment on back (visible edge)
  const batteryCompartment = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.6, bodyHeight * 0.4, 0.003),
    new THREE.MeshStandardMaterial({
      color: 0x3d3d4d,
      roughness: 0.7,
      metalness: 0.1
    })
  );
  batteryCompartment.position.set(0, bodyHeight * 0.4, -bodyDepth / 2 - 0.0015);
  group.add(batteryCompartment);

  // Battery door latch
  const batteryLatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.003, 0.002),
    metalMaterial
  );
  batteryLatch.position.set(0, bodyHeight * 0.25, -bodyDepth / 2 - 0.003);
  group.add(batteryLatch);

  return group;
}

// ============================================================================
// SCREEN UPDATE
// ============================================================================
function updateScreenText(text) {
  if (!screenCtx) return;

  screenCtx.fillStyle = CONFIG.player.screenColor;
  screenCtx.fillRect(0, 0, 256, 32);
  screenCtx.fillStyle = CONFIG.player.textColor;
  screenCtx.font = '300 14px "Segoe UI", Arial, sans-serif';
  screenCtx.textAlign = 'center';
  screenCtx.textBaseline = 'middle';

  // Truncate long text
  let displayText = text;
  if (screenCtx.measureText(text).width > 240) {
    while (screenCtx.measureText(displayText + '...').width > 240 && displayText.length > 0) {
      displayText = displayText.slice(0, -1);
    }
    displayText += '...';
  }

  screenCtx.fillText(displayText, 128, 16);

  if (screenTexture) {
    screenTexture.needsUpdate = true;
  }
}

// ============================================================================
// AUDIO SYSTEM
// ============================================================================
function initAudioContext() {
  if (audioState.audioContext) return;

  audioState.audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Create audio element
  audioState.audioElement = new Audio();
  audioState.audioElement.crossOrigin = 'anonymous';

  // Create source node from audio element
  audioState.sourceNode = audioState.audioContext.createMediaElementSource(audioState.audioElement);

  // Create cassette effect nodes
  audioState.effectNodes = createCassetteAudioNodes(audioState.audioContext);

  // Connect audio chain
  connectAudioChain();

  // Audio element events
  audioState.audioElement.addEventListener('ended', onTrackEnded);
  audioState.audioElement.addEventListener('error', onAudioError);
}

function createCassetteAudioNodes(audioContext) {
  const nodes = {};

  // Tape hiss generator (white noise)
  const bufferSize = 2 * audioContext.sampleRate;
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  nodes.noiseSource = audioContext.createBufferSource();
  nodes.noiseSource.buffer = noiseBuffer;
  nodes.noiseSource.loop = true;

  // Noise gain (for tape hiss level)
  nodes.noiseGain = audioContext.createGain();
  nodes.noiseGain.gain.value = 0.015 * CONFIG.audio.tapeHissLevel;

  // High-pass filter for noise (makes it sound like tape hiss)
  nodes.noiseHighpass = audioContext.createBiquadFilter();
  nodes.noiseHighpass.type = 'highpass';
  nodes.noiseHighpass.frequency.value = 2000;

  // Connect noise chain
  nodes.noiseSource.connect(nodes.noiseHighpass);
  nodes.noiseHighpass.connect(nodes.noiseGain);

  // Low-pass filter (tape frequency limitation)
  nodes.lowpass = audioContext.createBiquadFilter();
  nodes.lowpass.type = 'lowpass';
  nodes.lowpass.frequency.value = CONFIG.audio.highCutoff;
  nodes.lowpass.Q.value = 0.7;

  // High-pass filter (remove very low frequencies)
  nodes.highpass = audioContext.createBiquadFilter();
  nodes.highpass.type = 'highpass';
  nodes.highpass.frequency.value = CONFIG.audio.lowCutoff;
  nodes.highpass.Q.value = 0.7;

  // Mid-range boost (tape warmth)
  nodes.midBoost = audioContext.createBiquadFilter();
  nodes.midBoost.type = 'peaking';
  nodes.midBoost.frequency.value = 1000;
  nodes.midBoost.Q.value = 0.8;
  nodes.midBoost.gain.value = 2;

  // Wow and Flutter (pitch modulation using delay)
  nodes.wowFlutterDelay = audioContext.createDelay(0.1);
  nodes.wowFlutterDelay.delayTime.value = 0.005;

  // LFO for wow effect (slow pitch variation)
  nodes.wowLFO = audioContext.createOscillator();
  nodes.wowLFO.type = 'sine';
  nodes.wowLFO.frequency.value = 0.5;

  nodes.wowLFOGain = audioContext.createGain();
  nodes.wowLFOGain.gain.value = 0.001 * CONFIG.audio.wowFlutterLevel;

  // LFO for flutter effect (faster pitch variation)
  nodes.flutterLFO = audioContext.createOscillator();
  nodes.flutterLFO.type = 'sine';
  nodes.flutterLFO.frequency.value = 6;

  nodes.flutterLFOGain = audioContext.createGain();
  nodes.flutterLFOGain.gain.value = 0.0005 * CONFIG.audio.wowFlutterLevel;

  // Connect LFOs to delay time
  nodes.wowLFO.connect(nodes.wowLFOGain);
  nodes.wowLFOGain.connect(nodes.wowFlutterDelay.delayTime);

  nodes.flutterLFO.connect(nodes.flutterLFOGain);
  nodes.flutterLFOGain.connect(nodes.wowFlutterDelay.delayTime);

  // Soft saturation using waveshaper (tape saturation)
  nodes.saturation = audioContext.createWaveShaper();
  nodes.saturation.curve = createSaturationCurve(CONFIG.audio.saturationLevel);
  nodes.saturation.oversample = '2x';

  // Main gain
  nodes.mainGain = audioContext.createGain();
  nodes.mainGain.gain.value = CONFIG.audio.volume;

  // Output merger (combine music with noise)
  nodes.merger = audioContext.createGain();

  return nodes;
}

function createSaturationCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;

  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }

  return curve;
}

function connectAudioChain() {
  const nodes = audioState.effectNodes;
  const ctx = audioState.audioContext;

  // Create a bypass gain node for direct connection
  nodes.bypassGain = ctx.createGain();
  nodes.bypassGain.gain.value = CONFIG.audio.effectsEnabled ? 0 : 1;

  // Create an effects gain node
  nodes.effectsGain = ctx.createGain();
  nodes.effectsGain.gain.value = CONFIG.audio.effectsEnabled ? 1 : 0;

  // Source -> bypass (direct to mainGain, no effects)
  audioState.sourceNode.connect(nodes.bypassGain);
  nodes.bypassGain.connect(nodes.mainGain);

  // Source -> effects chain -> effectsGain -> mainGain
  audioState.sourceNode.connect(nodes.highpass);
  nodes.highpass.connect(nodes.lowpass);
  nodes.lowpass.connect(nodes.midBoost);
  nodes.midBoost.connect(nodes.wowFlutterDelay);
  nodes.wowFlutterDelay.connect(nodes.saturation);
  nodes.saturation.connect(nodes.effectsGain);
  nodes.effectsGain.connect(nodes.mainGain);

  // Noise (tape hiss) -> merger -> destination (only when effects enabled)
  nodes.noiseGain.connect(nodes.mainGain);
  if (!CONFIG.audio.effectsEnabled) {
    nodes.noiseGain.gain.value = 0;
  }

  // Final output
  nodes.mainGain.connect(ctx.destination);

  // Start oscillators
  nodes.wowLFO.start();
  nodes.flutterLFO.start();
  nodes.noiseSource.start();
}

// Toggle all audio effects on/off
function toggleAudioEffects(enabled) {
  CONFIG.audio.effectsEnabled = enabled;

  if (audioState.effectNodes) {
    const nodes = audioState.effectNodes;

    if (enabled) {
      // Enable effects: effectsGain = 1, bypassGain = 0, restore noise
      nodes.effectsGain.gain.value = 1;
      nodes.bypassGain.gain.value = 0;
      if (audioState.isPlaying) {
        nodes.noiseGain.gain.value = 0.015 * CONFIG.audio.tapeHissLevel;
      }
    } else {
      // Disable effects: effectsGain = 0, bypassGain = 1, mute noise
      nodes.effectsGain.gain.value = 0;
      nodes.bypassGain.gain.value = 1;
      nodes.noiseGain.gain.value = 0;
    }
  }
}

// ============================================================================
// PLAYBACK CONTROLS
// ============================================================================
async function loadTrack(index) {
  if (audioState.audioFiles.length === 0) return;

  if (index < 0) index = audioState.audioFiles.length - 1;
  if (index >= audioState.audioFiles.length) index = 0;

  audioState.currentTrackIndex = index;
  const track = audioState.audioFiles[index];

  // Reset retry flag for new track
  track._retried = false;

  // Update screen
  updateScreenText(track.name);
  // Note: showTrackOverlay is called when track starts playing, not on load

  // Update status bar
  updateStatusBar(`${index + 1}/${audioState.audioFiles.length}: ${track.name}`);

  // Load audio - use appropriate source based on platform
  try {
    if (track.url) {
      // Web/Mobile: use blob URL
      if (isMobile || isCapacitor) {
        console.log(`[Mobile] Loading track: ${track.name}, URL: ${track.url.substring(0, 50)}...`);
      }
      audioState.audioElement.src = track.url;
    } else if (track.path) {
      // Electron: use file:// URL
      audioState.audioElement.src = 'file://' + track.path;
    } else if (track.file) {
      // Fallback: create blob URL from File object if URL is missing
      console.log(`[Mobile] Creating blob URL from File object for: ${track.name}`);
      track.url = URL.createObjectURL(track.file);
      audioState.audioElement.src = track.url;
    }

    await audioState.audioElement.load();

    if (isMobile || isCapacitor) {
      console.log(`[Mobile] Track loaded successfully: ${track.name}`);
    }
  } catch (error) {
    console.error(`Error loading track ${track.name}:`, error);
    updateStatusBar(`Error: ${error.message}`);

    // On mobile, try ArrayBuffer method if direct loading fails
    if ((isMobile || isCapacitor) && track.file && !track._retried) {
      await loadTrackWithArrayBuffer(track);
    }
  }

  // Save current track index for restoration on restart (Electron only)
  if (isElectron) {
    saveCurrentSettings();
  }
}

async function play() {
  if (!audioState.audioContext) {
    initAudioContext();
  }

  // Resume context if suspended
  if (audioState.audioContext.state === 'suspended') {
    await audioState.audioContext.resume();
  }

  if (audioState.audioFiles.length === 0) {
    await openFolder();
    if (audioState.audioFiles.length === 0) return;
  }

  if (!audioState.audioElement.src) {
    await loadTrack(0);
  }

  await audioState.audioElement.play();
  audioState.isPlaying = true;

  // Show track overlay when track starts playing
  const currentTrack = audioState.audioFiles[audioState.currentTrackIndex];
  if (currentTrack) {
    showTrackOverlay(currentTrack.name);
  }

  // Resume tape hiss noise (only if effects are enabled)
  if (audioState.effectNodes && audioState.effectNodes.noiseGain && CONFIG.audio.effectsEnabled) {
    audioState.effectNodes.noiseGain.gain.value = 0.015 * CONFIG.audio.tapeHissLevel;
  }

  // Update tray icon (Electron only)
  if (isElectron && window.electronAPI.updatePlayState) {
    window.electronAPI.updatePlayState(true);
  }
}

function stop() {
  if (audioState.audioElement) {
    audioState.audioElement.pause();
    audioState.audioElement.currentTime = 0;
  }
  audioState.isPlaying = false;

  // Stop tape hiss noise
  if (audioState.effectNodes && audioState.effectNodes.noiseGain) {
    audioState.effectNodes.noiseGain.gain.value = 0;
  }

  // Update tray icon (Electron only)
  if (isElectron && window.electronAPI.updatePlayState) {
    window.electronAPI.updatePlayState(false);
  }
}

function pause() {
  if (audioState.audioElement) {
    audioState.audioElement.pause();
  }
  audioState.isPlaying = false;

  // Stop tape hiss noise
  if (audioState.effectNodes && audioState.effectNodes.noiseGain) {
    audioState.effectNodes.noiseGain.gain.value = 0;
  }

  // Update tray icon (Electron only)
  if (isElectron && window.electronAPI.updatePlayState) {
    window.electronAPI.updatePlayState(false);
  }
}

async function nextTrack() {
  await loadTrack(audioState.currentTrackIndex + 1);
  if (audioState.isPlaying) {
    await audioState.audioElement.play();
  }
}

async function prevTrack() {
  // If more than 3 seconds into track, restart it; otherwise go to previous
  if (audioState.audioElement.currentTime > 3) {
    audioState.audioElement.currentTime = 0;
  } else {
    await loadTrack(audioState.currentTrackIndex - 1);
    if (audioState.isPlaying) {
      await audioState.audioElement.play();
    }
  }
}

async function togglePlayPause() {
  if (audioState.isPlaying) {
    pause();
  } else {
    await play();
  }
}

function onTrackEnded() {
  nextTrack();
}

function onAudioError(e) {
  const audio = audioState.audioElement;
  const error = audio?.error;
  let errorMessage = 'Error loading track';

  // Provide detailed error information based on MediaError code
  if (error) {
    switch (error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        errorMessage = 'Playback aborted';
        break;
      case MediaError.MEDIA_ERR_NETWORK:
        errorMessage = 'Network error loading track';
        break;
      case MediaError.MEDIA_ERR_DECODE:
        errorMessage = 'Audio format not supported';
        break;
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        errorMessage = 'Audio source not supported';
        break;
      default:
        errorMessage = `Audio error (code ${error.code})`;
    }
    console.error('Audio error details:', {
      code: error.code,
      message: error.message,
      src: audio.src?.substring(0, 100) + '...'
    });
  } else {
    console.error('Audio error (no details):', e);
  }

  updateStatusBar(errorMessage);

  // On mobile, try alternative loading method if blob URL failed
  if ((isMobile || isCapacitor) && audioState.audioFiles.length > 0) {
    const track = audioState.audioFiles[audioState.currentTrackIndex];
    if (track && track.file && !track._retried) {
      track._retried = true;
      console.log('Retrying with ArrayBuffer method...');
      loadTrackWithArrayBuffer(track);
    }
  }
}

// Alternative loading method using ArrayBuffer for problematic cases
async function loadTrackWithArrayBuffer(track) {
  if (!track.file) {
    console.error('No File object available for ArrayBuffer loading');
    return;
  }

  try {
    updateStatusBar('Retrying with alternative method...');

    // Read file as ArrayBuffer
    const arrayBuffer = await track.file.arrayBuffer();

    // Create a new Blob with explicit MIME type
    const mimeType = getMimeType(track.fullName || track.file.name);
    const blob = new Blob([arrayBuffer], { type: mimeType });

    // Revoke old URL if exists
    if (track.url) {
      URL.revokeObjectURL(track.url);
    }

    // Create new blob URL
    track.url = URL.createObjectURL(blob);
    track._retried = true;

    // Load with new URL
    audioState.audioElement.src = track.url;
    await audioState.audioElement.load();

    updateStatusBar(`Loaded: ${track.name}`);

    // Auto-play if was playing before
    if (audioState.isPlaying) {
      await audioState.audioElement.play();
    }
  } catch (error) {
    console.error('ArrayBuffer loading also failed:', error);
    updateStatusBar(`Cannot play: ${track.name}`);
  }
}

// Get MIME type from filename
function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'm4a': 'audio/mp4',
    'webm': 'audio/webm',
    'opus': 'audio/opus',
    'wma': 'audio/x-ms-wma'
  };
  return mimeTypes[ext] || 'audio/*';
}

// ============================================================================
// FILE HANDLING
// ============================================================================
async function openFolder() {
  if (isElectron) {
    try {
      const result = await window.electronAPI.openFolderDialog();
      if (result && result.audioFiles.length > 0) {
        audioState.folderPath = result.folderPath;
        audioState.audioFiles = result.audioFiles;
        audioState.currentTrackIndex = 0;
        await loadTrack(0);
        updateStatusBar(`Loaded ${result.audioFiles.length} tracks`);
        // Save playback state for restoration on restart
        saveCurrentSettings();
      }
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  } else {
    // Mobile/Web: use file input to select files
    await openFilesWeb();
  }
}

async function openFiles() {
  if (isElectron) {
    try {
      const result = await window.electronAPI.openFileDialog();
      if (result && result.audioFiles.length > 0) {
        audioState.folderPath = result.folderPath;
        audioState.audioFiles = result.audioFiles;
        audioState.currentTrackIndex = 0;
        await loadTrack(0);
        updateStatusBar(`Loaded ${result.audioFiles.length} tracks`);
        // Save playback state for restoration on restart
        saveCurrentSettings();
      }
    } catch (error) {
      console.error('Error opening files:', error);
    }
  } else {
    // Mobile/Web: use file input to select files
    await openFilesWeb();
  }
}

// Web/Mobile file picker using file input element
async function openFilesWeb() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.style.display = 'none';

    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        // Clean up old blob URLs to prevent memory leaks
        cleanupBlobUrls();

        const audioFiles = files.map((file, index) => {
          // Create blob URL with explicit MIME type for better compatibility
          const mimeType = getMimeType(file.name);
          const blob = new Blob([file], { type: mimeType });
          const url = URL.createObjectURL(blob);

          console.log(`[Mobile] Loaded file: ${file.name}, size: ${file.size}, type: ${mimeType}, url: ${url.substring(0, 50)}...`);

          return {
            name: file.name.replace(/\.[^/.]+$/, ''),
            fullName: file.name,
            file: file,  // Store the File object for fallback loading
            url: url,    // Blob URL for audio element
            _retried: false  // Track if we've tried alternative loading
          };
        });

        audioState.folderPath = null;
        audioState.audioFiles = audioFiles;
        audioState.currentTrackIndex = 0;

        try {
          await loadTrack(0);
          updateStatusBar(`Loaded ${audioFiles.length} tracks`);
        } catch (error) {
          console.error('Error loading first track:', error);
          updateStatusBar(`Error loading track: ${error.message}`);
        }
      }
      document.body.removeChild(input);
      resolve();
    });

    input.addEventListener('cancel', () => {
      document.body.removeChild(input);
      resolve();
    });

    document.body.appendChild(input);
    input.click();
  });
}

// Clean up old blob URLs to prevent memory leaks
function cleanupBlobUrls() {
  if (audioState.audioFiles && audioState.audioFiles.length > 0) {
    audioState.audioFiles.forEach(track => {
      if (track.url && track.url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(track.url);
          console.log(`[Mobile] Revoked blob URL for: ${track.name}`);
        } catch (e) {
          // Ignore errors when revoking
        }
      }
    });
  }
}

// ============================================================================
// UI HELPERS
// ============================================================================
function showTrackOverlay(text) {
  const overlay = document.getElementById('track-overlay');
  overlay.textContent = text;
  overlay.classList.add('visible');

  setTimeout(() => {
    overlay.classList.remove('visible');
  }, 3000);
}

function updateStatusBar(text) {
  document.getElementById('status-bar').textContent = text;
}

// Update background gradient based on current appearance settings
function updateBackgroundGradient() {
  const gradientEl = document.getElementById('background-gradient');
  if (!gradientEl) return;

  if (CONFIG.appearance.gradientEnabled) {
    // Convert hex color to rgba with opacity
    const startColor = hexToRgba(CONFIG.appearance.gradientStartColor, CONFIG.appearance.backgroundOpacity / 100);
    const endColor = hexToRgba(CONFIG.appearance.gradientEndColor, CONFIG.appearance.backgroundOpacity / 100);

    gradientEl.style.background = `linear-gradient(${CONFIG.appearance.gradientAngle}deg, ${startColor}, ${endColor})`;
  } else {
    gradientEl.style.background = 'transparent';
  }
}

// Convert hex color to rgba string
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================
function setupEventListeners() {
  const canvas = document.getElementById('three-canvas');

  // Window controls (only for Electron)
  if (isElectron) {
    document.getElementById('btn-minimize').addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });
    document.getElementById('btn-maximize').addEventListener('click', () => {
      window.electronAPI.maximizeWindow();
    });
    document.getElementById('btn-close').addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });
  }

  // Mouse click for button interaction
  canvas.addEventListener('click', onCanvasClick);

  // Touch support for mobile
  if (isMobile || isCapacitor) {
    canvas.addEventListener('touchend', onCanvasTouchEnd, { passive: false });
    // Long press for settings on mobile (instead of right-click)
    setupLongPressHandler(canvas);
  }

  // Right-click to open settings panel (desktop)
  canvas.addEventListener('contextmenu', onContextMenu);

  // Double-click to open folder (desktop)
  canvas.addEventListener('dblclick', async () => {
    await openFolder();
  });

  // Double-tap to open folder (mobile)
  if (isMobile || isCapacitor) {
    setupDoubleTapHandler(canvas);
  }

  // Mouse drag for window movement via cassette (only for Electron)
  if (isElectron) {
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    document.addEventListener('mousemove', onCanvasMouseMove);
    document.addEventListener('mouseup', onCanvasMouseUp);
  }

  // Mouse wheel for zoom (desktop)
  canvas.addEventListener('wheel', onMouseWheel);

  // Pinch to zoom (mobile)
  if (isMobile || isCapacitor) {
    setupPinchZoomHandler(canvas);
  }

  // Keyboard controls
  document.addEventListener('keydown', onKeyDown);

  // Drag and drop (desktop only - mobile uses file input)
  if (!isMobile && !isCapacitor) {
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', onFileDrop);
  }

  // Setup settings panel event listeners
  setupSettingsEventListeners();

  // Listen for tray toggle play event (Electron only)
  if (isElectron && window.electronAPI.onTrayTogglePlay) {
    window.electronAPI.onTrayTogglePlay(async () => {
      await togglePlayPause();
    });
  }
}

function onContextMenu(event) {
  event.preventDefault();
  openSettings();
}

// Check if click is on a button
function isClickOnButton(event) {
  const canvas = document.getElementById('three-canvas');
  const rect = canvas.getBoundingClientRect();

  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const buttonsGroup = cassettePlayer.userData.buttonsGroup;
  if (buttonsGroup) {
    const buttonMeshes = buttonsGroup.children.filter(c => c.userData.isButton);
    const intersects = raycaster.intersectObjects(buttonMeshes);
    return intersects.length > 0;
  }
  return false;
}

// Check if click is on the cassette body
function isClickOnCassette(event) {
  const canvas = document.getElementById('three-canvas');
  const rect = canvas.getBoundingClientRect();

  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check intersection with all cassette player meshes
  const intersects = raycaster.intersectObjects(cassettePlayer.children, true);
  return intersects.length > 0;
}

function onCanvasMouseDown(event) {
  // Only start drag on left mouse button
  if (event.button !== 0) return;

  // Don't drag if clicking on buttons
  if (isClickOnButton(event)) return;

  // Only drag if clicking on the cassette
  if (!isClickOnCassette(event)) return;

  isDragging = true;
  dragStartMouse = { x: event.screenX, y: event.screenY };

  // Signal main process to prepare for dragging
  if (window.electronAPI && window.electronAPI.startWindowDrag) {
    window.electronAPI.startWindowDrag();
  }
}

function onCanvasMouseMove(event) {
  if (!isDragging) return;

  const deltaX = event.screenX - dragStartMouse.x;
  const deltaY = event.screenY - dragStartMouse.y;

  // Update start position for next move calculation
  dragStartMouse = { x: event.screenX, y: event.screenY };

  // Move the window
  if (window.electronAPI && window.electronAPI.moveWindow) {
    window.electronAPI.moveWindow(deltaX, deltaY);
  }
}

function onCanvasMouseUp(event) {
  isDragging = false;
}

function onCanvasClick(event) {
  const canvas = document.getElementById('three-canvas');
  const rect = canvas.getBoundingClientRect();

  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check button intersections
  const buttonsGroup = cassettePlayer.userData.buttonsGroup;
  if (buttonsGroup) {
    const buttonMeshes = buttonsGroup.children.filter(c => c.userData.isButton);
    const intersects = raycaster.intersectObjects(buttonMeshes);

    if (intersects.length > 0) {
      const buttonType = intersects[0].object.userData.buttonType;
      handleButtonPress(buttonType);
    }
  }
}

// Touch event handler for mobile
function onCanvasTouchEnd(event) {
  if (event.changedTouches.length !== 1) return;

  const touch = event.changedTouches[0];
  const canvas = document.getElementById('three-canvas');
  const rect = canvas.getBoundingClientRect();

  mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check button intersections
  const buttonsGroup = cassettePlayer.userData.buttonsGroup;
  if (buttonsGroup) {
    const buttonMeshes = buttonsGroup.children.filter(c => c.userData.isButton);
    const intersects = raycaster.intersectObjects(buttonMeshes);

    if (intersects.length > 0) {
      event.preventDefault();
      const buttonType = intersects[0].object.userData.buttonType;
      handleButtonPress(buttonType);
    }
  }
}

// Long press handler for mobile (opens settings)
let longPressTimer = null;
function setupLongPressHandler(element) {
  element.addEventListener('touchstart', (e) => {
    longPressTimer = setTimeout(() => {
      openSettings();
    }, 600);
  }, { passive: true });

  element.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  }, { passive: true });

  element.addEventListener('touchmove', () => {
    clearTimeout(longPressTimer);
  }, { passive: true });
}

// Double tap handler for mobile (opens folder)
let lastTapTime = 0;
function setupDoubleTapHandler(element) {
  element.addEventListener('touchend', async (e) => {
    const currentTime = Date.now();
    const tapLength = currentTime - lastTapTime;
    if (tapLength < 300 && tapLength > 0) {
      e.preventDefault();
      await openFolder();
    }
    lastTapTime = currentTime;
  }, { passive: false });
}

// Pinch to zoom handler for mobile
let initialPinchDistance = 0;
function setupPinchZoomHandler(element) {
  element.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      initialPinchDistance = getPinchDistance(e.touches);
    }
  }, { passive: true });

  element.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance > 0) {
      e.preventDefault();
      const currentDistance = getPinchDistance(e.touches);
      const delta = currentDistance - initialPinchDistance;
      const zoomSpeed = 0.0002;

      // Pinch out = zoom in (camera moves closer)
      camera.position.z -= delta * zoomSpeed;
      camera.position.z = Math.max(0.12, Math.min(0.6, camera.position.z));

      initialPinchDistance = currentDistance;
    }
  }, { passive: false });

  element.addEventListener('touchend', () => {
    initialPinchDistance = 0;
  }, { passive: true });
}

function getPinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

async function handleButtonPress(buttonType) {
  switch (buttonType) {
    case 'play':
      await togglePlayPause();
      break;
    case 'stop':
      stop();
      break;
    case 'prev':
      await prevTrack();
      break;
    case 'next':
      await nextTrack();
      break;
  }
}

function onMouseWheel(event) {
  event.preventDefault();

  // Zoom in/out (centered on player)
  const zoomSpeed = 0.01;
  const direction = event.deltaY > 0 ? 1 : -1;

  // Zoom range: 0.12 (max zoom, close but not inside) to 0.6 (min zoom, far)
  camera.position.z += direction * zoomSpeed;
  camera.position.z = Math.max(0.12, Math.min(0.6, camera.position.z));
}

async function onKeyDown(event) {
  switch (event.code) {
    case 'Space':
      event.preventDefault();
      await togglePlayPause();
      break;
    case 'ArrowRight':
      await nextTrack();
      break;
    case 'ArrowLeft':
      await prevTrack();
      break;
    case 'ArrowUp':
      if (audioState.effectNodes) {
        CONFIG.audio.volume = Math.min(1, CONFIG.audio.volume + 0.1);
        audioState.effectNodes.mainGain.gain.value = CONFIG.audio.volume;
        saveCurrentSettings();
      }
      break;
    case 'ArrowDown':
      if (audioState.effectNodes) {
        CONFIG.audio.volume = Math.max(0, CONFIG.audio.volume - 0.1);
        audioState.effectNodes.mainGain.gain.value = CONFIG.audio.volume;
        saveCurrentSettings();
      }
      break;
    case 'KeyO':
      if (event.ctrlKey) {
        event.preventDefault();
        await openFolder();
      }
      break;
    case 'Escape':
      if (settingsOpen) {
        closeSettings();
      }
      break;
  }
}

async function onFileDrop(event) {
  event.preventDefault();

  const files = Array.from(event.dataTransfer.files);
  const audioFiles = files
    .filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm', 'opus'].includes(ext);
    })
    .map(file => ({
      name: file.name.replace(/\.[^/.]+$/, ''),
      fullName: file.name,
      path: file.path
    }));

  if (audioFiles.length > 0) {
    audioState.audioFiles = audioFiles;
    audioState.currentTrackIndex = 0;
    await loadTrack(0);
    updateStatusBar(`Loaded ${audioFiles.length} tracks via drag & drop`);
  }
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================
function animate() {
  animationId = requestAnimationFrame(animate);

  // Animate reels when playing
  if (audioState.isPlaying && cassettePlayer.userData.reelGroup) {
    reelRotation += 0.02;
    const reelGroup = cassettePlayer.userData.reelGroup;
    const leftReel = reelGroup.getObjectByName('leftReel');
    const rightReel = reelGroup.getObjectByName('rightReel');

    if (leftReel) leftReel.rotation.z = reelRotation;
    if (rightReel) rightReel.rotation.z = reelRotation * 1.1; // Slightly faster
  }

  renderer.render(scene, camera);
}

// ============================================================================
// SCREEN ORIENTATION CONTROL (Mobile)
// ============================================================================

// Lock screen to landscape orientation
async function lockToLandscape() {
  // Try Capacitor plugin first
  if (ScreenOrientation && ScreenOrientation.lock) {
    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
      return true;
    } catch (e) {
      console.log('Capacitor ScreenOrientation.lock failed:', e);
    }
  }

  // Fallback to Web Screen Orientation API
  if (screen.orientation && screen.orientation.lock) {
    try {
      await screen.orientation.lock('landscape');
      return true;
    } catch (e) {
      console.log('Web screen.orientation.lock failed:', e);
    }
  }

  return false;
}

// Unlock screen orientation (allow auto-rotate)
async function unlockOrientation() {
  // Try Capacitor plugin first
  if (ScreenOrientation && ScreenOrientation.unlock) {
    try {
      await ScreenOrientation.unlock();
      return true;
    } catch (e) {
      console.log('Capacitor ScreenOrientation.unlock failed:', e);
    }
  }

  // Fallback to Web Screen Orientation API
  if (screen.orientation && screen.orientation.unlock) {
    try {
      screen.orientation.unlock();
      return true;
    } catch (e) {
      console.log('Web screen.orientation.unlock failed:', e);
    }
  }

  return false;
}

// Apply orientation based on settings
async function applyOrientationSetting() {
  if (!isMobile && !isCapacitor) return;

  if (CONFIG.mobile.autoRotate) {
    await unlockOrientation();
  } else {
    await lockToLandscape();
  }
}

// Initialize orientation on mobile
async function initMobileOrientation() {
  if (!isMobile && !isCapacitor) return;

  // Apply initial orientation setting (default: locked to landscape)
  await applyOrientationSetting();
}

// ============================================================================
// SETTINGS PANEL
// ============================================================================
let settingsOpen = false;

function openSettings() {
  const overlay = document.getElementById('settings-overlay');
  overlay.classList.add('visible');
  settingsOpen = true;
  syncSettingsUI();

  // Check which tab is currently active and set overlay background accordingly
  const activeTab = document.querySelector('.settings-tab.active');
  if (activeTab && activeTab.getAttribute('data-tab') === 'appearance') {
    overlay.style.background = 'transparent';
  } else {
    overlay.style.background = 'rgba(0, 0, 0, 0.7)';
  }
}

function closeSettings() {
  const overlay = document.getElementById('settings-overlay');
  overlay.classList.remove('visible');
  // Reset background dimming when closing settings
  overlay.style.background = 'rgba(0, 0, 0, 0.7)';
  settingsOpen = false;

  // Save settings when closing the settings panel
  saveCurrentSettings();
}

function toggleSettings() {
  if (settingsOpen) {
    closeSettings();
  } else {
    openSettings();
  }
}

function syncSettingsUI() {
  // Sync slider values with current CONFIG
  document.getElementById('slider-volume').value = CONFIG.audio.volume * 100;
  document.getElementById('volume-value').textContent = Math.round(CONFIG.audio.volume * 100) + '%';

  document.getElementById('slider-hiss').value = CONFIG.audio.tapeHissLevel * 100;
  document.getElementById('hiss-value').textContent = Math.round(CONFIG.audio.tapeHissLevel * 100) + '%';

  document.getElementById('slider-flutter').value = CONFIG.audio.wowFlutterLevel * 100;
  document.getElementById('flutter-value').textContent = Math.round(CONFIG.audio.wowFlutterLevel * 100) + '%';

  document.getElementById('slider-saturation').value = CONFIG.audio.saturationLevel * 100;
  document.getElementById('saturation-value').textContent = Math.round(CONFIG.audio.saturationLevel * 100) + '%';

  document.getElementById('slider-lowcut').value = CONFIG.audio.lowCutoff;
  document.getElementById('lowcut-value').textContent = CONFIG.audio.lowCutoff + ' Hz';

  document.getElementById('slider-highcut').value = CONFIG.audio.highCutoff;
  document.getElementById('highcut-value').textContent = CONFIG.audio.highCutoff + ' Hz';

  // Sync effects enabled checkbox
  document.getElementById('checkbox-effects-enabled').checked = CONFIG.audio.effectsEnabled;

  // Sync always-on-top checkbox (Electron only)
  if (isElectron && window.electronAPI.getAlwaysOnTop) {
    window.electronAPI.getAlwaysOnTop().then(value => {
      document.getElementById('checkbox-always-on-top').checked = value;
    });
  }

  // Sync appearance settings
  document.getElementById('checkbox-gradient-enabled').checked = CONFIG.appearance.gradientEnabled;
  document.getElementById('color-gradient-start').value = CONFIG.appearance.gradientStartColor;
  document.getElementById('color-gradient-end').value = CONFIG.appearance.gradientEndColor;
  document.getElementById('slider-gradient-angle').value = CONFIG.appearance.gradientAngle;
  document.getElementById('angle-value').textContent = CONFIG.appearance.gradientAngle + '°';
  document.getElementById('slider-bg-opacity').value = CONFIG.appearance.backgroundOpacity;
  document.getElementById('opacity-value').textContent = CONFIG.appearance.backgroundOpacity + '%';

  // Sync mobile settings (auto-rotate)
  if (isMobile || isCapacitor) {
    document.getElementById('checkbox-auto-rotate').checked = CONFIG.mobile.autoRotate;
  }
}

function setupSettingsEventListeners() {
  // Close button
  document.getElementById('settings-close').addEventListener('click', closeSettings);

  // Click outside to close
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'settings-overlay') {
      closeSettings();
    }
  });

  // Tab switching
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs and panes
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      // Add active to clicked tab and corresponding pane
      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      document.getElementById('tab-' + tabId).classList.add('active');

      // Remove background dimming when on Appearance tab to see visual changes
      const overlay = document.getElementById('settings-overlay');
      if (tabId === 'appearance') {
        overlay.style.background = 'transparent';
      } else {
        overlay.style.background = 'rgba(0, 0, 0, 0.7)';
      }
    });
  });

  // Volume slider
  document.getElementById('slider-volume').addEventListener('input', (e) => {
    const value = e.target.value / 100;
    CONFIG.audio.volume = value;
    document.getElementById('volume-value').textContent = e.target.value + '%';
    if (audioState.effectNodes) {
      audioState.effectNodes.mainGain.gain.value = value;
    }
  });

  // Tape Hiss slider
  document.getElementById('slider-hiss').addEventListener('input', (e) => {
    const value = e.target.value / 100;
    CONFIG.audio.tapeHissLevel = value;
    document.getElementById('hiss-value').textContent = e.target.value + '%';
    if (audioState.effectNodes) {
      audioState.effectNodes.noiseGain.gain.value = 0.015 * value;
    }
  });

  // Wow & Flutter slider
  document.getElementById('slider-flutter').addEventListener('input', (e) => {
    const value = e.target.value / 100;
    CONFIG.audio.wowFlutterLevel = value;
    document.getElementById('flutter-value').textContent = e.target.value + '%';
    if (audioState.effectNodes) {
      audioState.effectNodes.wowLFOGain.gain.value = 0.001 * value;
      audioState.effectNodes.flutterLFOGain.gain.value = 0.0005 * value;
    }
  });

  // Saturation slider
  document.getElementById('slider-saturation').addEventListener('input', (e) => {
    const value = e.target.value / 100;
    CONFIG.audio.saturationLevel = value;
    document.getElementById('saturation-value').textContent = e.target.value + '%';
    if (audioState.effectNodes) {
      audioState.effectNodes.saturation.curve = createSaturationCurve(value);
    }
  });

  // Low Cut slider
  document.getElementById('slider-lowcut').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    CONFIG.audio.lowCutoff = value;
    document.getElementById('lowcut-value').textContent = value + ' Hz';
    if (audioState.effectNodes) {
      audioState.effectNodes.highpass.frequency.value = value;
    }
  });

  // High Cut slider
  document.getElementById('slider-highcut').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    CONFIG.audio.highCutoff = value;
    document.getElementById('highcut-value').textContent = value + ' Hz';
    if (audioState.effectNodes) {
      audioState.effectNodes.lowpass.frequency.value = value;
    }
  });

  // Reset effects button
  document.getElementById('btn-reset-effects').addEventListener('click', () => {
    // Reset to default values
    CONFIG.audio.tapeHissLevel = 0.3;
    CONFIG.audio.wowFlutterLevel = 0.5;
    CONFIG.audio.saturationLevel = 0.4;

    // Update sliders
    document.getElementById('slider-hiss').value = 30;
    document.getElementById('hiss-value').textContent = '30%';
    document.getElementById('slider-flutter').value = 50;
    document.getElementById('flutter-value').textContent = '50%';
    document.getElementById('slider-saturation').value = 40;
    document.getElementById('saturation-value').textContent = '40%';

    // Apply to audio nodes
    if (audioState.effectNodes) {
      audioState.effectNodes.noiseGain.gain.value = 0.015 * 0.3;
      audioState.effectNodes.wowLFOGain.gain.value = 0.001 * 0.5;
      audioState.effectNodes.flutterLFOGain.gain.value = 0.0005 * 0.5;
      audioState.effectNodes.saturation.curve = createSaturationCurve(0.4);
    }

    // Save settings immediately after reset
    saveCurrentSettings();
  });

  // Open folder button
  document.getElementById('btn-open-folder').addEventListener('click', async () => {
    await openFolder();
    closeSettings();
  });

  // Open files button
  document.getElementById('btn-open-files').addEventListener('click', async () => {
    await openFiles();
    closeSettings();
  });

  // Effects enabled checkbox
  document.getElementById('checkbox-effects-enabled').addEventListener('change', (e) => {
    toggleAudioEffects(e.target.checked);
    saveCurrentSettings();
  });

  // Always on top checkbox (Electron only)
  document.getElementById('checkbox-always-on-top').addEventListener('change', (e) => {
    if (isElectron && window.electronAPI.setAlwaysOnTop) {
      window.electronAPI.setAlwaysOnTop(e.target.checked);
    }
  });

  // Auto-rotate checkbox (Mobile only)
  document.getElementById('checkbox-auto-rotate').addEventListener('change', async (e) => {
    CONFIG.mobile.autoRotate = e.target.checked;
    await applyOrientationSetting();
  });

  // Appearance settings - Gradient enabled checkbox
  document.getElementById('checkbox-gradient-enabled').addEventListener('change', (e) => {
    CONFIG.appearance.gradientEnabled = e.target.checked;
    updateBackgroundGradient();
  });

  // Gradient start color
  document.getElementById('color-gradient-start').addEventListener('input', (e) => {
    CONFIG.appearance.gradientStartColor = e.target.value;
    updateBackgroundGradient();
  });

  // Gradient end color
  document.getElementById('color-gradient-end').addEventListener('input', (e) => {
    CONFIG.appearance.gradientEndColor = e.target.value;
    updateBackgroundGradient();
  });

  // Gradient angle slider
  document.getElementById('slider-gradient-angle').addEventListener('input', (e) => {
    CONFIG.appearance.gradientAngle = parseInt(e.target.value);
    document.getElementById('angle-value').textContent = e.target.value + '°';
    updateBackgroundGradient();
  });

  // Background opacity slider
  document.getElementById('slider-bg-opacity').addEventListener('input', (e) => {
    CONFIG.appearance.backgroundOpacity = parseInt(e.target.value);
    document.getElementById('opacity-value').textContent = e.target.value + '%';
    updateBackgroundGradient();
  });

  // Reset appearance button
  document.getElementById('btn-reset-appearance').addEventListener('click', () => {
    // Reset to default values
    CONFIG.appearance.gradientEnabled = false;
    CONFIG.appearance.gradientStartColor = '#1a1a2e';
    CONFIG.appearance.gradientEndColor = '#2a2a4e';
    CONFIG.appearance.gradientAngle = 180;
    CONFIG.appearance.backgroundOpacity = 80;

    // Update UI
    document.getElementById('checkbox-gradient-enabled').checked = false;
    document.getElementById('color-gradient-start').value = '#1a1a2e';
    document.getElementById('color-gradient-end').value = '#2a2a4e';
    document.getElementById('slider-gradient-angle').value = 180;
    document.getElementById('angle-value').textContent = '180°';
    document.getElementById('slider-bg-opacity').value = 80;
    document.getElementById('opacity-value').textContent = '80%';

    // Apply changes
    updateBackgroundGradient();

    // Save settings immediately after reset
    saveCurrentSettings();
  });

  // Add scroll wheel support for all sliders
  setupSliderScrollSupport();
}

// Add scroll wheel support for sliders
function setupSliderScrollSupport() {
  const sliders = document.querySelectorAll('.control-slider');

  sliders.forEach(slider => {
    slider.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const currentValue = parseFloat(slider.value);

      // Use fixed step of 1 for precise control (e.g., 1%)
      const step = 1;

      // Scroll up increases value, scroll down decreases
      const direction = e.deltaY > 0 ? -1 : 1;
      let newValue = currentValue + (direction * step);

      // Clamp value within range
      newValue = Math.max(min, Math.min(max, newValue));

      // Update slider value
      slider.value = newValue;

      // Trigger input event to update the associated setting
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }, { passive: false });
  });
}

// ============================================================================
// START
// ============================================================================
window.addEventListener('DOMContentLoaded', init);
