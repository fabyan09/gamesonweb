# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A 3D dungeon game built with Babylon.js for the Games On Web 2026 competition. Features a third-person character controller with sword and shield combat animations in a dungeon environment.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build
```

## Architecture

**Entry Flow**: `index.html` → `src/main.ts` → `Game.init()` → `DungeonScene.init()`

### Core Classes (`src/core/`)

- **Game** - Engine initialization and render loop management
- **PlayerController** - Character movement, input handling (ZQSD/WASD), animation state machine with retargeting from separate GLB files. Handles root motion filtering for walk/run animations
- **ThirdPersonCamera** - ArcRotateCamera wrapper with smooth follow, pointer lock
- **FPSCamera** - Alternative UniversalCamera for first-person mode (not currently used)
- **AssetLoader** - GLB loading with mesh caching by name

### Scene (`src/scenes/`)

- **DungeonScene** - Scene setup (lighting, fog), level building with MeshPlacer, player/camera initialization

### Utilities (`src/utils/`)

- **MeshPlacer** - Clones and positions meshes from loaded assets using grid or individual placement

## Key Patterns

**Animation Loading**: Animations are loaded from separate GLB files and retargeted to the character skeleton. Root motion is filtered (full/horizontal/none) to prevent character drift.

**Asset Path**: Assets use `import.meta.env.BASE_URL` for GitHub Pages compatibility (base path: `/gamesonweb/`).

**Input**: Supports both AZERTY (ZQSD) and QWERTY (WASD) layouts.

## Assets

Located in `public/assets/`:
- `Dungeon_set/` - Environment meshes (walls, floors, props)
- `Sword and Shield Pack/` - Character model and animation GLBs
