# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Oblivion's Crypt** - A full-featured 3D dungeon crawler game built with **Babylon.js** for the Games On Web 2026 competition (theme: AI). Features three playable character classes (Knight, Archer, Wizard), procedural dungeon generation, enemy AI, combat system, inventory management, audio design, and a **companion AI system** — the Spirit of the Dungeon, a conscious entity that observes and speaks to the player in real time.

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

### Source Structure

```
src/
├── main.ts                  # Bootstrap, menu navigation
├── core/                    # Engine, game loop, settings, camera, input
│   ├── Game.ts
│   ├── GameSettings.ts
│   ├── ThirdPersonCamera.ts
│   ├── FPSCamera.ts
│   └── GamepadManager.ts
├── scenes/                  # Game scenes
│   └── DungeonScene.ts
├── entities/                # Game entities (players + enemies)
│   ├── CharacterClass.ts
│   ├── PlayerController.ts
│   ├── ArcherController.ts
│   ├── WizardController.ts
│   ├── CharacterPreview.ts
│   ├── Enemy.ts
│   └── EnemyTypes.ts
├── level/                   # Level data, loading, and generation
│   ├── LevelData.ts
│   ├── LevelLoader.ts
│   └── BSPDungeonGenerator.ts
├── systems/                 # Game mechanics
│   ├── AudioManager.ts
│   ├── ChestSystem.ts
│   ├── DoorSystem.ts
│   └── PlayerInventory.ts
├── effects/                 # Visual effects and post-processing
│   ├── HealingEffect.ts
│   ├── HealthVignette.ts
│   └── PixelFilter.ts
├── assets/                  # Asset loading and preloading
│   ├── AssetLoader.ts
│   └── AssetPreloader.ts
├── services/                # Firebase and external services
│   ├── FirebaseConfig.ts
│   ├── AuthService.ts
│   └── StatsService.ts
├── companion/               # AI companion system (Spirit of the Dungeon)
│   ├── CompanionDialogues.ts
│   ├── CompanionAI.ts
│   ├── CompanionEntity.ts
│   ├── CompanionUI.ts
│   └── DungeonCompanion.ts
├── ui/                      # UI components
│   └── ASCIIText.ts
└── utils/                   # Utilities
    └── MeshPlacer.ts
```

### Core (`src/core/`)

| File | Purpose |
|------|---------|
| `Game.ts` | Engine initialization, render loop, level dispatch |
| `GameSettings.ts` | LocalStorage settings: keybindings, volume, sensitivity, crouch mode |
| `ThirdPersonCamera.ts` | Over-the-shoulder ArcRotateCamera with pointer lock, collision |
| `FPSCamera.ts` | First-person camera mode |
| `GamepadManager.ts` | Gamepad input handling |

### Entities (`src/entities/`)

| File | Purpose |
|------|---------|
| `CharacterClass.ts` | Abstract interface for character controllers |
| `PlayerController.ts` | Knight class: sword/shield combat, blocking (70% reduction), multiple attack animations, crouch system |
| `ArcherController.ts` | Archer class: arrow projectiles, trajectory hit detection, aiming, dodge, reduced defense (50%) |
| `WizardController.ts` | Wizard class: fireball projectiles, magical attacks |
| `CharacterPreview.ts` | Character preview rendering for selection screen |
| `Enemy.ts` | Enemy AI: idle/chase/attack/dead states, pathfinding, enrage system, health bars |
| `EnemyTypes.ts` | Enemy config database (Vampire, Parasite, Mutant, SkeletonZombie, Warrok) |

### Level (`src/level/`)

| File | Purpose |
|------|---------|
| `LevelData.ts` | JSON level format definition |
| `LevelLoader.ts` | Level instantiation, mesh instancing, collision generation, light management |
| `BSPDungeonGenerator.ts` | Procedural level generation using Binary Space Partitioning |

### Systems (`src/systems/`)

| File | Purpose |
|------|---------|
| `AudioManager.ts` | HTML5 audio: music, SFX pools, spatial audio for braziers |
| `ChestSystem.ts` | Chest/tomb interaction, item drops with bob animation, auto-pickup |
| `DoorSystem.ts` | Door mechanics, exit door unlocking |
| `PlayerInventory.ts` | Potion (4 max) and arrow (10 max) management, state persistence |

### Effects (`src/effects/`)

| File | Purpose |
|------|---------|
| `HealingEffect.ts` | Healing visual effect |
| `HealthVignette.ts` | Low-health screen vignette |
| `PixelFilter.ts` | Pixel art post-processing filter |

### Companion (`src/companion/`)

| File | Purpose |
|------|---------|
| `CompanionDialogues.ts` | 600+ dialogue lines across 30 trigger types (20+ per trigger). Personality: ambiguous, sarcastic, fascinated |
| `CompanionAI.ts` | Brain logic: cooldowns per trigger, message queue with priority, idle detection, multi-kill tracking, HP/inventory monitoring |
| `CompanionEntity.ts` | 3D spectral orb: dual particle systems (core + aura) with additive blending, orbits player with lerp + bobbing. NO PointLight (would break light culling) |
| `CompanionUI.ts` | Fixed 2D HTML overlay at top of screen (subtitle-style). Typing effect with cursor, auto-dismiss, CSS fade animations |
| `DungeonCompanion.ts` | Facade class connecting Entity + UI + AI. Single interface used by DungeonScene |

**Trigger types**: level_start, room_enter, enemy_spotted, combat_start, enemy_killed, boss_spotted, boss_killed, player_hit, player_low_hp, player_critical_hp, player_block, player_death, chest_open, item_pickup_potion, item_pickup_arrows, potion_used, door_open, exit_unsealed, victory, idle, trap_damage, enemy_enraged, player_crouch, arrow_shot, spell_cast, all_enemies_near, player_full_hp, no_potions, no_arrows, multiple_kills

**Lore integration**: Welcome screen, main menu whisper, loading screen, loading tips, rules panel backstory, pause menu random quotes

### Assets (`src/assets/`)

| File | Purpose |
|------|---------|
| `AssetLoader.ts` | GLB loading with mesh caching |
| `AssetPreloader.ts` | Background preloading using NullEngine |

### Services (`src/services/`)

| File | Purpose |
|------|---------|
| `FirebaseConfig.ts` | Firebase project configuration |
| `AuthService.ts` | Firebase authentication |
| `StatsService.ts` | Player stats tracking |

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

### Stamina (nouveau)

- Système de stamina ajouté pour limiter actions physiques (course, blocage, attaques, tirs, sorts).
- Valeurs par défaut: `max = 100`, `regen = 8/s`, `run drain = 15/s`, `block drain = 10/s`.
- Coûts par action (par défaut): Knight attack = 20, Archer shot = 12, Wizard cast = 25.
- Comportement: si la stamina est insuffisante, l'action (attaque/tir/sort) est bloquée; la course et le blocage drainent la stamina en continu; la stamina se régénère automatiquement lorsque le joueur n'effectue pas d'actions consommatrices.
- UI: une barre de stamina a été ajoutée au-dessus de la barre de vie (DOM simple mise à jour par frame dans `DungeonScene`).

Fichiers modifiés pour la feature:
- `src/entities/PlayerController.ts` — implémentation principale pour le `knight` (drain/run/block/attaque, getters).
- `src/entities/ArcherController.ts` — consommation sur tir, drain/regen.
- `src/entities/WizardController.ts` — consommation sur cast, drain/regen.
- `src/entities/CharacterClass.ts` — ajout d'accesseurs optionnels `getStamina()` / `getMaxStamina()` pour l'interface.
- `src/scenes/DungeonScene.ts` — création et mise à jour de la barre de stamina (`updateStaminaUI()` + hook `onBeforeRenderObservable`).

Notes:
- Valeurs et coûts sont actuellement codés en dur; je peux les exposer dans `GameSettings` si tu veux permettre du tuning via l'UI.
- UX possible à ajouter: son d'alerte quand épuisé, clignotement/texte "Épuisé", changements de couleurs, et animations pour l'épuisement.

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
- Light culling: max 8 active lights, dynamically managed based on GPU capability. NEVER add new PointLights/SpotLights without accounting for this — it breaks the culling system and makes meshes disappear

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
8. Pause menu (with Spirit of the Dungeon random quote)
9. HUD: health bar, inventory, interaction prompt, FPS counter, crosshair
10. Victory/defeat overlays
11. Companion dialogue overlay (fixed 2D subtitle at top of screen)

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
| Combat | `entities/PlayerController.ts`, `entities/ArcherController.ts`, `entities/WizardController.ts`, `entities/Enemy.ts` |
| Levels | `level/LevelData.ts`, `level/LevelLoader.ts`, `level/BSPDungeonGenerator.ts` |
| Items | `systems/PlayerInventory.ts`, `systems/ChestSystem.ts` |
| Audio | `systems/AudioManager.ts` |
| Input | `core/GameSettings.ts`, `core/ThirdPersonCamera.ts`, `core/GamepadManager.ts` |
| Effects | `effects/HealingEffect.ts`, `effects/HealthVignette.ts`, `effects/PixelFilter.ts` |
| Companion AI | `companion/DungeonCompanion.ts`, `companion/CompanionAI.ts`, `companion/CompanionDialogues.ts`, `companion/CompanionEntity.ts`, `companion/CompanionUI.ts` |
| Services | `services/FirebaseConfig.ts`, `services/AuthService.ts`, `services/StatsService.ts` |
| UI | `index.html`, `main.ts`, `scenes/DungeonScene.ts` |

## Common Tasks

### Adding a new enemy type

1. Add GLB to `public/assets/Creature Pack/`
2. Add config in `src/entities/EnemyTypes.ts`
3. Reference in level JSON

### Adding a new level

1. Create JSON in `public/levels/`
2. Add to level select in `index.html`
3. Add case in `main.ts` menu handler

### Adding a new sound effect

1. Add audio file to `public/assets/SFX/`
2. Add to `src/systems/AudioManager.ts` in appropriate pool
3. Call `audioManager.play[Sound]()` where needed

### Modifying companion dialogues

1. Add/edit lines in `src/companion/CompanionDialogues.ts` under the relevant trigger type
2. Each trigger must have at least 20 dialogue variations
3. Use `priority: 1` for important messages that should interrupt the queue
4. Cooldowns per trigger are configured in `src/companion/CompanionAI.ts` → `setupCooldowns()`
5. To add a new trigger type: add to `TriggerType` union, add dialogues array, add cooldown, add priority, hook in `DungeonScene.ts`

### Adding companion lore to UI

- Welcome screen lore: `index.html` → `#welcome-screen .welcome-lore`
- Rules panel lore: `index.html` → `#rules-panel .lore-section`
- Loading tips: `src/main.ts` → `LOADING_TIPS` array
- Pause quotes: `src/scenes/DungeonScene.ts` → `pauseGame()` → `spiritQuotes` array
- Main menu whisper: `index.html` → `.menu-spirit-whisper`
- Loading screen subtitle: `index.html` → `.loading-spirit-text`

### Modifying player stats

- Knight: `src/entities/PlayerController.ts` (walkSpeed, runSpeed, jumpForce, attackRange)
- Archer: `src/entities/ArcherController.ts` (same properties + arrowDamage)
- Wizard: `src/entities/WizardController.ts` (same properties + fireballDamage)

## Tech Stack

- **Engine**: Babylon.js 8.41.2
- **Build**: Vite + TypeScript (ES2020, strict mode)
- **Audio**: HTML5 Audio API
- **Storage**: LocalStorage for persistence
- **Deployment**: GitHub Pages at `/gamesonweb/`
