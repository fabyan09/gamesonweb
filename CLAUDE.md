# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-featured 3D dungeon crawler game built with **Babylon.js** for the Games On Web 2026 competition. Features two playable character classes (Knight and Archer), procedural dungeon generation, enemy AI, combat system, inventory management, and audio design.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build
```

## Architecture

### Entry Flow

```
Welcome Screen → Main Menu → Level/Character Select → Game
```

**Code Flow**: `index.html` → `src/main.ts` → `Game.init()` → `DungeonScene.init()`

- `index.html` - Contains all UI screens with inline CSS (~1600 lines)
- `src/main.ts` - Bootstrap, menu navigation, character selection, URL-based game launch
- `src/core/Game.ts` - Babylon.js engine setup, render loop, scene delegation
- `src/scenes/DungeonScene.ts` - Main game scene (~1700 lines): level loading, player/enemy spawning, combat, UI updates, audio, victory/death handling

### Core Classes (`src/core/`)

| File | Purpose |
|------|---------|
| `Game.ts` | Engine initialization, render loop, level dispatch |
| `PlayerController.ts` | Knight class: sword/shield combat, blocking (70% reduction), multiple attack animations, crouch system |
| `ArcherController.ts` | Archer class: arrow projectiles, trajectory hit detection, aiming, dodge, reduced defense (50%) |
| `CharacterClass.ts` | Abstract interface for character controllers |
| `Enemy.ts` | Enemy AI: idle/chase/attack/dead states, pathfinding, enrage system, health bars |
| `EnemyTypes.ts` | Enemy config database (Vampire, Parasite, Mutant, SkeletonZombie, Warrok) |
| `ThirdPersonCamera.ts` | Over-the-shoulder ArcRotateCamera with pointer lock, collision |
| `GameSettings.ts` | LocalStorage settings: keybindings, volume, sensitivity, crouch mode |
| `LevelData.ts` | JSON level format definition |
| `LevelLoader.ts` | Level instantiation, mesh instancing, collision generation, light management |
| `BSPDungeonGenerator.ts` | Procedural level generation using Binary Space Partitioning |
| `PlayerInventory.ts` | Potion (4 max) and arrow (10 max) management, state persistence |
| `ChestSystem.ts` | Chest/tomb interaction, item drops with bob animation, auto-pickup |
| `AudioManager.ts` | HTML5 audio: music, SFX pools, spatial audio for braziers |
| `AssetLoader.ts` | GLB loading with mesh caching |
| `AssetPreloader.ts` | Background preloading using NullEngine |

### Utilities (`src/utils/`)

- **MeshPlacer** - Mesh instancing and grid placement for performance

## Gameplay Systems

### Character Classes

| Class | Speed | Attack | Defense | Special |
|-------|-------|--------|---------|---------|
| Knight | Walk 0.08, Run 0.15 | 2.5 range, sword/kick | 70% block | Crouching attacks |
| Archer | Walk 0.06, Run 0.12 | Arrow projectiles | 50% block | Trajectory-based hits, 5-10 arrows |

### Enemy Types

| Enemy | HP | Damage | Detection | Speed | Cooldown |
|-------|-------|--------|-----------|-------|----------|
| Vampire | 50 | 10 | 10 | 0.02 | 1200ms |
| Parasite | 75 | 15 | 12 | 0.025 | 1500ms |
| Mutant | 100 | 20 | 14 | 0.03 | 1800ms |
| SkeletonZombie | 150 | 25 | 15 | 0.025 | 2000ms |
| Warrok (Boss) | 250 | 35 | 16 | 0.035 | 2000ms |

**AI States**: idle → chasing → attacking → dead/celebrating
**Enrage**: Triggered by ranged attacks, 1.8x speed for 10 seconds

### Combat

- Player HP: 100, healed by potions (p1: 20, p2: 40, p3: 60, p4: 80 HP)
- Damage sources: Enemy attacks, spike traps (1s cooldown)
- Victory: Defeat all enemies in level

### Inventory

- 4 potion slots (keys 1-4 to use)
- Arrow count for Archer (0-10)
- State persists between level transitions

### Controls (Default - Customizable)

| Action | Key |
|--------|-----|
| Move | ZQSD / WASD |
| Run | Shift |
| Jump | Space |
| Crouch | Ctrl |
| Attack | Left Click |
| Block | Right Click |
| Interact | F |
| Potions | 1-4 |
| Pause | P |

## Key Patterns

### Animation System

Animations are loaded from **separate GLB files** and retargeted to character skeleton:
```
Character model GLB + Animation GLBs → Skeleton retargeting → Animation groups
```
Root motion filtering (full/horizontal/none) prevents character drift.

### Asset Loading

- All paths use `import.meta.env.BASE_URL` for GitHub Pages (`/gamesonweb/`)
- Mesh instancing for repeated objects (walls, props)
- Light culling: max 8 active lights, dynamically managed based on GPU capability

### State Management

- `GameSettings` - LocalStorage key: `dungeon_settings`
- `PlayerInventory` - LocalStorage key: `dungeon_game_state`
- Audio autoplay - Session storage: `audioInteracted`

### Level Format

Levels are JSON files in `public/levels/`:
```typescript
interface LevelData {
  floor: { grid, position, mesh }[];
  walls: { position, rotation, mesh }[];
  props: { position, rotation, scale?, mesh }[];
  lights: { position, intensity?, color? }[];
  enemies: { position, type, health?, damage? }[];
  player: { spawn, rotation };
  camera: { bounds };
  scene?: { fogDensity, ambientColor };
}
```

## Assets Structure

```
public/assets/
├── Dungeon_set/         # Environment (walls, floors, torches, braziers)
├── Sword and Shield Pack/  # Knight model + animations
├── Pro Longbow Pack/    # Archer model + animations
├── Creature Pack/       # 5 enemy types GLBs
├── Potions/             # Potion models
├── SFX/                 # All sound effects
└── fond.jpg             # Skybox background
```

## Audio Design

- **Music**: Ambient loop during gameplay, menu music
- **SFX Pools**: hit, sword, growl, pain, death, shield_block, chest_open, potion_pickup, potion_drink, arrow_shoot
- **Spatial**: Brazier campfire sounds attached to mesh positions
- **UX**: Win, lose, evil_laugh sounds

## UI Screens (in index.html)

1. Welcome screen (animated intro)
2. Main menu (play, level select, random, rules, settings)
3. Character select (class preview with stats)
4. Level select
5. Rules & lore panel
6. Settings panel (audio, sensitivity, bindings)
7. Controls customization
8. Pause menu
9. HUD: health bar, inventory, interaction prompt, FPS counter, crosshair
10. Victory/defeat overlays

## Performance Optimizations

- Mesh instancing vs cloning for repeated objects
- Light culling based on WebGL uniform block limits
- Lazy asset loading
- Animation pooling (4 idle variants)
- Selective collision meshes
- BSP dungeon size reduced (20-30 tiles) for performance

## Important Files by Feature

| Feature | Files |
|---------|-------|
| Combat | `PlayerController.ts`, `ArcherController.ts`, `Enemy.ts` |
| Levels | `LevelData.ts`, `LevelLoader.ts`, `BSPDungeonGenerator.ts` |
| Items | `PlayerInventory.ts`, `ChestSystem.ts` |
| Audio | `AudioManager.ts` |
| Input | `GameSettings.ts`, `ThirdPersonCamera.ts` |
| UI | `index.html`, `main.ts`, `DungeonScene.ts` |

## Common Tasks

### Adding a new enemy type

1. Add GLB to `public/assets/Creature Pack/`
2. Add config in `EnemyTypes.ts`
3. Reference in level JSON

### Adding a new level

1. Create JSON in `public/levels/`
2. Add to level select in `index.html`
3. Add case in `main.ts` menu handler

### Adding a new sound effect

1. Add audio file to `public/assets/SFX/`
2. Add to `AudioManager.ts` in appropriate pool
3. Call `audioManager.play[Sound]()` where needed

### Modifying player stats

- Knight: `PlayerController.ts` (walkSpeed, runSpeed, jumpForce, attackRange)
- Archer: `ArcherController.ts` (same properties + arrowDamage)

## Tech Stack

- **Engine**: Babylon.js 8.41.2
- **Build**: Vite + TypeScript (ES2020, strict mode)
- **Audio**: HTML5 Audio API
- **Storage**: LocalStorage for persistence
- **Deployment**: GitHub Pages at `/gamesonweb/`
