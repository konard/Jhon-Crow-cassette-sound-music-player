// Cassette Music Player - Renderer
// Sony-style portable cassette player with 3D visuals and tape effects

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
    volume: 0.7
  },
  appearance: {
    gradientEnabled: false,
    gradientStartColor: '#1a1a2e',
    gradientEndColor: '#2a2a4e',
    gradientAngle: 180,
    backgroundOpacity: 80
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

  // Start animation loop
  animate();
}

// Load settings from persistent storage
async function loadSavedSettings() {
  try {
    if (window.electronAPI && window.electronAPI.getSettings) {
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
        }
        // Apply appearance settings
        if (settings.appearance) {
          CONFIG.appearance.gradientEnabled = settings.appearance.gradientEnabled ?? CONFIG.appearance.gradientEnabled;
          CONFIG.appearance.gradientStartColor = settings.appearance.gradientStartColor ?? CONFIG.appearance.gradientStartColor;
          CONFIG.appearance.gradientEndColor = settings.appearance.gradientEndColor ?? CONFIG.appearance.gradientEndColor;
          CONFIG.appearance.gradientAngle = settings.appearance.gradientAngle ?? CONFIG.appearance.gradientAngle;
          CONFIG.appearance.backgroundOpacity = settings.appearance.backgroundOpacity ?? CONFIG.appearance.backgroundOpacity;
        }
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Save current settings to persistent storage
function saveCurrentSettings() {
  try {
    if (window.electronAPI && window.electronAPI.saveSettings) {
      const settings = {
        audio: {
          volume: CONFIG.audio.volume,
          tapeHissLevel: CONFIG.audio.tapeHissLevel,
          wowFlutterLevel: CONFIG.audio.wowFlutterLevel,
          saturationLevel: CONFIG.audio.saturationLevel,
          lowCutoff: CONFIG.audio.lowCutoff,
          highCutoff: CONFIG.audio.highCutoff
        },
        appearance: {
          gradientEnabled: CONFIG.appearance.gradientEnabled,
          gradientStartColor: CONFIG.appearance.gradientStartColor,
          gradientEndColor: CONFIG.appearance.gradientEndColor,
          gradientAngle: CONFIG.appearance.gradientAngle,
          backgroundOpacity: CONFIG.appearance.backgroundOpacity
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

  // Source -> highpass -> lowpass -> midBoost -> wowFlutter -> saturation -> mainGain -> destination
  audioState.sourceNode.connect(nodes.highpass);
  nodes.highpass.connect(nodes.lowpass);
  nodes.lowpass.connect(nodes.midBoost);
  nodes.midBoost.connect(nodes.wowFlutterDelay);
  nodes.wowFlutterDelay.connect(nodes.saturation);
  nodes.saturation.connect(nodes.mainGain);

  // Noise (tape hiss) -> merger -> destination
  nodes.noiseGain.connect(nodes.mainGain);

  // Final output
  nodes.mainGain.connect(ctx.destination);

  // Start oscillators
  nodes.wowLFO.start();
  nodes.flutterLFO.start();
  nodes.noiseSource.start();
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

  // Update screen
  updateScreenText(track.name);
  // Note: showTrackOverlay is called when track starts playing, not on load

  // Update status bar
  updateStatusBar(`${index + 1}/${audioState.audioFiles.length}: ${track.name}`);

  // Load audio
  audioState.audioElement.src = 'file://' + track.path;
  await audioState.audioElement.load();
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

  // Resume tape hiss noise
  if (audioState.effectNodes && audioState.effectNodes.noiseGain) {
    audioState.effectNodes.noiseGain.gain.value = 0.015 * CONFIG.audio.tapeHissLevel;
  }

  // Update tray icon
  if (window.electronAPI && window.electronAPI.updatePlayState) {
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

  // Update tray icon
  if (window.electronAPI && window.electronAPI.updatePlayState) {
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

  // Update tray icon
  if (window.electronAPI && window.electronAPI.updatePlayState) {
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
  console.error('Audio error:', e);
  updateStatusBar('Error loading track');
}

// ============================================================================
// FILE HANDLING
// ============================================================================
async function openFolder() {
  try {
    const result = await window.electronAPI.openFolderDialog();
    if (result && result.audioFiles.length > 0) {
      audioState.folderPath = result.folderPath;
      audioState.audioFiles = result.audioFiles;
      audioState.currentTrackIndex = 0;
      await loadTrack(0);
      updateStatusBar(`Loaded ${result.audioFiles.length} tracks`);
    }
  } catch (error) {
    console.error('Error opening folder:', error);
  }
}

async function openFiles() {
  try {
    const result = await window.electronAPI.openFileDialog();
    if (result && result.audioFiles.length > 0) {
      audioState.folderPath = result.folderPath;
      audioState.audioFiles = result.audioFiles;
      audioState.currentTrackIndex = 0;
      await loadTrack(0);
      updateStatusBar(`Loaded ${result.audioFiles.length} tracks`);
    }
  } catch (error) {
    console.error('Error opening files:', error);
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

  // Window controls
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.electronAPI.minimizeWindow();
  });
  document.getElementById('btn-maximize').addEventListener('click', () => {
    window.electronAPI.maximizeWindow();
  });
  document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI.closeWindow();
  });

  // Mouse click for button interaction
  canvas.addEventListener('click', onCanvasClick);

  // Right-click to open settings panel
  canvas.addEventListener('contextmenu', onContextMenu);

  // Double-click to open folder
  canvas.addEventListener('dblclick', async () => {
    await openFolder();
  });

  // Mouse drag for window movement via cassette
  canvas.addEventListener('mousedown', onCanvasMouseDown);
  document.addEventListener('mousemove', onCanvasMouseMove);
  document.addEventListener('mouseup', onCanvasMouseUp);

  // Mouse wheel for zoom
  canvas.addEventListener('wheel', onMouseWheel);

  // Keyboard controls
  document.addEventListener('keydown', onKeyDown);

  // Drag and drop
  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  canvas.addEventListener('drop', onFileDrop);

  // Setup settings panel event listeners
  setupSettingsEventListeners();

  // Listen for tray toggle play event
  if (window.electronAPI && window.electronAPI.onTrayTogglePlay) {
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
// SETTINGS PANEL
// ============================================================================
let settingsOpen = false;

function openSettings() {
  const overlay = document.getElementById('settings-overlay');
  overlay.classList.add('visible');
  settingsOpen = true;
  syncSettingsUI();
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

  // Sync always-on-top checkbox
  if (window.electronAPI && window.electronAPI.getAlwaysOnTop) {
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

  // Always on top checkbox
  document.getElementById('checkbox-always-on-top').addEventListener('change', (e) => {
    if (window.electronAPI && window.electronAPI.setAlwaysOnTop) {
      window.electronAPI.setAlwaysOnTop(e.target.checked);
    }
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
