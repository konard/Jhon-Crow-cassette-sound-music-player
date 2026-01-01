# Cassette Sound Music Player

A high-performance Windows music player with authentic cassette tape sound effects and 3D Sony Walkman-style visuals.

## Features

- **3D Cassette Player Visual**: Sony Walkman WM-10 inspired design with side view perspective, rotating reels, and LCD display
- **Authentic Tape Sound Effects**:
  - Tape hiss (background noise simulation)
  - Wow & Flutter (pitch modulation from tape speed variation)
  - Tape saturation (warm analog distortion)
  - Frequency limiting (tape frequency response)
- **On-Body Controls**: Play, Stop, Previous, Next buttons directly on the 3D player model
- **AIMP-style Functionality**: Playlist management, keyboard shortcuts, drag & drop support
- **Supported Audio Formats**: MP3, WAV, OGG, FLAC, AAC, M4A, WebM, Opus

## Installation

### Prerequisites
- Node.js 18+ (for development)
- npm or yarn

### Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run normally
npm start
```

### Building for Windows

```bash
# Build installer and portable version
npm run build

# Build portable version only
npm run build:portable
```

The built application will be in the `dist` folder.

## Usage

### Controls

**Mouse**:
- Click buttons on the player body to control playback
- Double-click anywhere to open folder dialog
- Scroll wheel to zoom in/out
- Drag window by the top area

**Keyboard**:
- `Space`: Play/Pause
- `Arrow Right`: Next track
- `Arrow Left`: Previous track (or restart if >3s into track)
- `Arrow Up`: Volume up
- `Arrow Down`: Volume down
- `Ctrl+O`: Open folder dialog

**Drag & Drop**:
- Drag audio files onto the player to load them

### Window Controls
- Minimize, maximize, and close buttons in the top-right corner
- Frameless window with transparent background

## Architecture

The application is built with:
- **Electron**: Cross-platform desktop framework
- **Three.js**: 3D rendering for the cassette player model
- **Web Audio API**: Real-time audio processing for tape effects

### Tape Effects Processing Chain

```
Audio Source
    |
    v
High-pass Filter (80Hz) - Remove rumble
    |
    v
Low-pass Filter (12kHz) - Tape frequency limit
    |
    v
Mid-range Boost (1kHz) - Tape warmth
    |
    v
Wow & Flutter Delay - Pitch modulation
    |
    v
Saturation (Waveshaper) - Tape distortion
    |
    v
Main Gain + Noise (Hiss)
    |
    v
Output
```

## License

This project is released into the public domain under the Unlicense.

## Credits

Inspired by the cassette player implementation in [focus-desktop-simulator](https://github.com/Jhon-Crow/focus-desktop-simulator).

Design reference: Sony Walkman WM-10 portable cassette player.
