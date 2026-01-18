# Case Study: Issue #28 - Button Click Detection in Small Windows

## Issue Summary

**Issue**: [fix кнопки (#28)](https://github.com/Jhon-Crow/cassette-sound-music-player/issues/28)

**Description** (translated from Russian):
> "Currently it's almost impossible to hit the buttons in a small window or mobile version. Make it so that when clicking on a small area slightly above and below the button, the needed action still triggers."

## Timeline of Events

| Date/Time | Event | Details |
|-----------|-------|---------|
| 2026-01-17 | Issue created | User reported buttons are nearly impossible to click in small windows/mobile |
| 2026-01-18 01:27 | Initial PR created | PR #30 opened with first fix attempt |
| 2026-01-18 01:31 | Fix #1: Collision boxes | Added invisible collision boxes 3x larger than visual buttons |
| 2026-01-18 01:41 | User feedback #1 | Owner: "в маленьком окне всё равно не получается нажать на кнопку" (still can't click in small window) |
| 2026-01-18 01:50 | Fix #2: pointer-events | Added `pointer-events: none` to `#drag-region` |
| 2026-01-18 02:08 | User feedback #2 | Owner: "кнопки всё ещё не нажимаются... да, происходит блокирование драг-н-дропом" (buttons still don't work, yes it's blocked by drag-n-drop) |
| 2026-01-18 03:14 | Fix #3: Remove drag-region | **FINAL FIX**: Removed `#drag-region` div entirely |

## Investigation Process

### Fix Attempt #1: Larger Collision Boxes

The first solution assumed the problem was that the 3D button geometries were too small for accurate raycasting.

```javascript
// Original visual button size: 0.010 x 0.004 x 0.007 units
const sliderButtonGeometry = new THREE.BoxGeometry(0.010, 0.004, 0.007);

// Added collision box size: 0.014 x 0.012 x 0.012 units (3x larger)
const collisionBoxGeometry = new THREE.BoxGeometry(0.014, 0.012, 0.012);
```

**Result**: Did not solve the problem. User reported buttons still don't work in small windows.

### Fix Attempt #2: pointer-events CSS

Based on the discovery that `#drag-region` overlays the buttons, we tried making it pass through clicks:

```css
#drag-region {
  pointer-events: none;  /* Allow clicks to pass through */
}

#window-controls {
  pointer-events: auto;  /* Keep window buttons clickable */
}
```

**Result**: Did not solve the problem. User confirmed buttons still blocked by drag-n-drop.

### Root Cause Discovery: Electron's `-webkit-app-region`

Through research into the Electron documentation and GitHub issues, we discovered the **actual root cause**:

> **The `-webkit-app-region: drag` CSS property operates at the native OS level, NOT the DOM/CSS level.**

This means:
- `pointer-events: none` has **NO EFFECT** on `-webkit-app-region: drag`
- The operating system intercepts ALL mouse events in draggable areas
- This is by design - the area behaves like a native window titlebar

### Evidence from Electron GitHub Issues

1. **[Issue #1354](https://github.com/electron/electron/issues/1354)** (2015, closed as wontfix):
   > "When setting `-webkit-app-region: drag` to make the window draggable all click/mousedown/mouseup can no longer be captured."

   > "The operating system will hijack all mouse events of the area to make it behave like titlebar."

2. **[Issue #27149](https://github.com/electron/electron/issues/27149)**:
   > "Clicks on elements are ignored, `-webkit-app-region: no-drag;` is ignored"

3. **[Issue #741](https://github.com/electron/electron/issues/741)**:
   > "If you have a div with the style of `-webkit-app-region:drag;` and then position any elements on top of it (even using a higher z-index), the elements are no longer usable."

## Root Cause Summary

```
Window (300x150 pixels)
┌─────────────────────────────────────────────────────────────┐
│  #drag-region overlay (-webkit-app-region: drag)           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                    Y=0 to Y=40                          ││
│  │        ← Buttons are HERE at Y=23.6 →                   ││
│  │              ▼ OS INTERCEPTS ALL EVENTS ▼               ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│  Canvas (#three-canvas) - clicks work here                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              [Cassette Player 3D View]                   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

The problem cascades:
1. **Button location**: 3D buttons render at screen Y ≈ 23.6 pixels in small windows
2. **Drag region**: `#drag-region` covers Y=0 to Y=40 pixels with `-webkit-app-region: drag`
3. **OS interception**: Operating system intercepts ALL mouse events at the native level
4. **No CSS workaround**: `pointer-events: none`, `z-index`, etc. have NO effect

## Final Solution: Remove `#drag-region` Entirely

The app already had JavaScript-based window dragging implemented:
- `onCanvasMouseDown/Move/Up` functions in `renderer.js` track mouse movements
- `startWindowDrag()` and `moveWindow()` IPC calls move the window via Electron main process
- This works because it operates on the canvas, not a native drag region

**Solution**: Remove the redundant `#drag-region` div entirely, since JavaScript-based dragging already works.

### Code Changes

**Before** (blocking clicks):
```html
<div id="drag-region"></div>
```
```css
#drag-region {
  position: absolute;
  top: 0;
  width: 100%;
  height: 40px;
  -webkit-app-region: drag;
  z-index: 999;
}
```

**After** (clicks work):
```html
<!-- #drag-region removed - was blocking button clicks in small windows.
     Window dragging is now handled via JavaScript (see renderer.js) -->
```

## Why Previous Fixes Didn't Work

| Fix Attempt | Why It Failed |
|-------------|---------------|
| Larger collision boxes | The issue wasn't raycasting precision - clicks never reached the canvas at all |
| `pointer-events: none` | CSS pointer-events doesn't affect `-webkit-app-region: drag` which operates at OS level |
| `z-index` manipulation | Native drag regions intercept events before they reach the DOM |

## Why This Only Affects Small Windows

| Window Size | Button Y Position | Inside 40px Drag Region? |
|-------------|-------------------|--------------------------|
| 500x400 (normal) | ~80px | No - buttons clickable |
| 300x150 (small) | ~23.6px | **Yes - buttons blocked** |

In larger windows, the cassette player scales up and buttons move below the 40px drag region.
In smaller windows, everything scales down and buttons fall within the drag region.

## Lessons Learned

1. **CSS doesn't always control everything**: `-webkit-app-region` operates at the native OS level, outside CSS's reach.

2. **Redundant systems cause conflicts**: The app had TWO window dragging mechanisms (native + JavaScript). The native one blocked clicks while the JavaScript one worked fine.

3. **Research platform-specific behaviors**: Electron has unique behaviors that differ from standard web development. Always check Electron's GitHub issues for known limitations.

4. **Don't trust z-index with native features**: Native OS features like window dragging bypass normal DOM event flow.

5. **Test in all conditions**: The issue only manifests in small windows. Testing only in large windows would miss it.

## Files Modified

| File | Change | Commit |
|------|--------|--------|
| `src/renderer.js` | Added collision boxes | 07acdd3 |
| `src/index.html` | Added `pointer-events: none` | 6bce906 |
| `src/index.html` | **Removed `#drag-region` entirely** | d73d3a6 |

## References

### Electron Issues
- [Issue #1354: -webkit-app-region: drag eats all click events](https://github.com/electron/electron/issues/1354) - Closed as wontfix (by design)
- [Issue #27149: -webkit-app-region "drag" vs "non-drag" problem](https://github.com/electron/electron/issues/27149)
- [Issue #741: -webkit-app-region drag disables parts of UI](https://github.com/electron/electron/issues/741)
- [Issue #33462: webkit-app-region: drag prevent click](https://github.com/electron/electron/issues/33462)

### Solution Logs
- `logs/solution-draft-log-1.txt` - First solution attempt (collision boxes)
- `logs/solution-draft-log-2.txt` - Second solution attempt (pointer-events CSS)
- This document - Final solution (remove drag-region)

## Test Data

- `data/small-window-screenshot.png` - Screenshot of small window
- `data/pr-30-details.json` - PR details
- `data/pr-30-comments.json` - PR comments with user feedback
- `data/git-log.txt` - Git commit history
