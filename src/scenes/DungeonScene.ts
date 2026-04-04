import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Ray } from '@babylonjs/core/Culling/ray';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

// Side-effect imports for collisions
import '@babylonjs/core/Collisions/collisionCoordinator';
import '@babylonjs/core/Culling/ray';

import { AssetLoader } from '../assets/AssetLoader';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera';
import { PlayerController } from '../entities/PlayerController';
import { ArcherController } from '../entities/ArcherController';
import { WizardController } from '../entities/WizardController';
import { CharacterClassName, CharacterController } from '../entities/CharacterClass';
import { LevelLoader, TrapData } from '../level/LevelLoader';
import { LevelData } from '../level/LevelData';
import { Enemy } from '../entities/Enemy';
import { GameSettings, KeyBindings } from '../core/GameSettings';
import { BSPDungeonGenerator } from '../level/BSPDungeonGenerator';
import { AudioManager } from '../systems/AudioManager';
import { PlayerInventory, PotionType } from '../systems/PlayerInventory';
import { ChestSystem } from '../systems/ChestSystem';
import { DoorSystem, InteractiveDoor } from '../systems/DoorSystem';
import { GamepadManager, GamepadButton } from '../core/GamepadManager';
import { PixelFilter } from '../effects/PixelFilter';
import { HealingEffect } from '../effects/HealingEffect';
import { HealthVignette } from '../effects/HealthVignette';
import { StatsService } from '../services/StatsService';
import { DungeonCompanion } from '../companion/DungeonCompanion';

// List of available levels
const LEVELS = [
    'level1.json',
    'level2.json'
];

export class DungeonScene {
    private canvas: HTMLCanvasElement;
    private scene: Scene;
    private assetLoader: AssetLoader;
    private levelLoader: LevelLoader;
    private camera: ThirdPersonCamera | null = null;
    private player: CharacterController | null = null;
    private currentLevel: LevelData | null = null;
    private currentLevelIndex: number = 0;
    private enemies: Enemy[] = [];
    private playerHealth: number = 100;
    private isLevelComplete: boolean = false;
    private isPlayerDead: boolean = false;
    private isPaused: boolean = false;
    private settings: GameSettings;
    private lastFpsUpdate: number = 0;
    private frameCount: number = 0;
    private engine: Engine;
    private pausedAnimations: Map<AnimationGroup, boolean> = new Map();
    private spikeTraps: TrapData[] = [];
    private lastTrapDamageTime: number = 0;
    private trapDamageCooldown: number = 1000; // 1 second between trap damage ticks
    private characterClass: CharacterClassName;
    private audioManager: AudioManager;
    private playerInventory: PlayerInventory | null = null;
    private chestSystem: ChestSystem | null = null;
    private nearbyChest: boolean = false;
    private nearbyItem: boolean = false;
    private doorSystem: DoorSystem | null = null;
    private nearbyDoor: InteractiveDoor | null = null;
    private nearbyExitDoor: boolean = false;
    private exitDoorSealed: boolean = true;
    private gamepadManager: GamepadManager;
    private pauseMenuIndex: number = 0;
    private pixelFilter: PixelFilter | null = null;
    private healingEffect: HealingEffect | null = null;
    private healthVignette: HealthVignette | null = null;
    private statsService: StatsService;
    private companion: DungeonCompanion | null = null;

    constructor(engine: Engine, canvas: HTMLCanvasElement, characterClass: CharacterClassName = 'knight') {
        this.canvas = canvas;
        this.engine = engine;
        this.characterClass = characterClass;
        this.scene = new Scene(engine);
        this.assetLoader = new AssetLoader(this.scene);
        this.levelLoader = new LevelLoader(this.scene);
        this.settings = GameSettings.getInstance();
        this.audioManager = AudioManager.getInstance();
        this.gamepadManager = GamepadManager.getInstance();
        this.statsService = StatsService.getInstance();

        this.setupScene();
        this.setupPauseMenu();
        this.setupGamepadCallbacks();
    }

    private setupScene(): void {
        this.scene.clearColor = new Color4(0.02, 0.02, 0.04, 1);
        this.scene.ambientColor = new Color3(0.1, 0.1, 0.15);

        // Fog
        this.scene.fogMode = Scene.FOGMODE_EXP2;
        this.scene.fogDensity = 0.015;
        this.scene.fogColor = new Color3(0.02, 0.02, 0.04);

        // Create atmospheric skybox
        this.createSkybox();

        // Enable collisions on the scene
        this.scene.collisionsEnabled = true;
        this.scene.gravity = new Vector3(0, -0.5, 0);

        // Augmenter la limite de lumières simultanées (par défaut 4)
        this.scene.onNewMeshAddedObservable.add((mesh) => {
            if (mesh.material) {
                (mesh.material as any).maxSimultaneousLights = 16;
            }
        });
    }

    private createSkybox(): void {
        // Create a large box as skybox (6 faces)
        const skybox = MeshBuilder.CreateBox('skybox', {
            size: 1000,
            sideOrientation: 1 // Inside facing
        }, this.scene);

        const skyMaterial = new StandardMaterial('skyMaterial', this.scene);
        skyMaterial.backFaceCulling = false;
        skyMaterial.disableLighting = true;
        skyMaterial.fogEnabled = false;
        skyMaterial.specularColor = new Color3(0, 0, 0); // No specular

        // Load skybox texture image
        const texturePath = `${import.meta.env.BASE_URL}assets/fond.jpg`;
        console.log('[DungeonScene] Loading skybox texture from:', texturePath);

        const skyTexture = new Texture(texturePath, this.scene, false, false);

        skyTexture.onLoadObservable.add(() => {
            console.log('[DungeonScene] Skybox texture loaded successfully');
        });

        // Use both diffuse and emissive for visibility
        skyMaterial.diffuseTexture = skyTexture;
        skyMaterial.emissiveTexture = skyTexture;
        skyMaterial.emissiveColor = new Color3(0.5, 0.5, 0.5);

        skybox.material = skyMaterial;
        skybox.infiniteDistance = true;
        skybox.renderingGroupId = 0;
        skybox.isPickable = false;

        console.log('[DungeonScene] Skybox created');
    }

    private setupLighting(): void {
        // Ambient - provides base illumination
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.4;
        ambient.diffuse = new Color3(0.6, 0.6, 0.8);
        ambient.groundColor = new Color3(0.3, 0.2, 0.15);

        // Directional - provides shadows and depth
        const dir = new DirectionalLight('dirLight', new Vector3(-1, -2, 1), this.scene);
        dir.intensity = 0.3;
        dir.specular = Color3.Black(); // Disable specular for perf
    }

    async init(levelIndex: number = 0): Promise<void> {
        // Reset audio state for new level (fixes sounds not playing after level transitions)
        this.audioManager.resetForNewLevel();

        // Store the raw level index (0-indexed)
        this.currentLevelIndex = levelIndex;

        // Start stats session
        this.statsService.startSession(this.characterClass, this.currentLevelIndex);

        // Lighting
        this.setupLighting();

        // Load dungeon assets
        const assets = await this.assetLoader.loadGLB(
            'dungeon',
            `${import.meta.env.BASE_URL}assets/Dungeon_set/`,
            'Dungeon_set.glb'
        );

        console.log('[DungeonScene] Available meshes:', Array.from(assets.meshes.keys()));

        if (levelIndex < LEVELS.length) {
            // ===== Handmade level =====
            const levelPath = `${import.meta.env.BASE_URL}levels/${LEVELS[levelIndex]}`;
            console.log(`[DungeonScene] Loading level ${levelIndex + 1}/${LEVELS.length}: ${LEVELS[levelIndex]}`);

            this.currentLevel = await this.levelLoader.loadFromUrl(levelPath);
            this.levelLoader.buildLevel(this.currentLevel, assets);
        } else {
            // ===== Procedural level (BSP) =====
            console.log(`[DungeonScene] Generating procedural level ${levelIndex + 1}...`);

            const tier = levelIndex - LEVELS.length; // 0, 1, 2, 3+

            // Progressive difficulty
            let enemyTypes: string[];
            let enemyMin: number;
            let enemyMax: number;
            let sizeBase: number;
            let sizeRange: number;

            if (tier === 0) {
                enemyTypes = ['vampire', 'parasite'];
                enemyMin = 3; enemyMax = 5;
                sizeBase = 20; sizeRange = 10;
            } else if (tier === 1) {
                enemyTypes = ['vampire', 'parasite', 'mutant'];
                enemyMin = 4; enemyMax = 6;
                sizeBase = 22; sizeRange = 10;
            } else if (tier === 2) {
                enemyTypes = ['parasite', 'mutant', 'skeletonzombie'];
                enemyMin = 5; enemyMax = 7;
                sizeBase = 24; sizeRange = 10;
            } else {
                enemyTypes = ['mutant', 'skeletonzombie', 'warrok'];
                enemyMin = Math.min(6 + Math.floor((tier - 3) / 2), 10);
                enemyMax = Math.min(8 + Math.floor((tier - 3) / 2), 12);
                sizeBase = Math.min(26 + (tier - 3) * 2, 40);
                sizeRange = 10;
            }

            const generator = new BSPDungeonGenerator({
                width: sizeBase + Math.floor(Math.random() * sizeRange),
                height: sizeBase + Math.floor(Math.random() * sizeRange),
                minRoomSize: 4,
                maxRoomSize: 8,
                tileSpacing: 2,
                enemyCount: enemyMin + Math.floor(Math.random() * (enemyMax - enemyMin + 1)),
                enemyTypes: enemyTypes
            });

            this.currentLevel = generator.generate();
            console.log(`[DungeonScene] Generated: ${this.currentLevel.name}`);
            console.log(`[DungeonScene] Rooms: ${generator.getRooms().length}, Enemies: ${this.currentLevel.enemies?.length}`);

            this.levelLoader.buildLevelOptimized(this.currentLevel, assets);
        }

        // Get spike traps for damage detection
        this.spikeTraps = this.levelLoader.getSpikeTraps();
        console.log(`[DungeonScene] Loaded ${this.spikeTraps.length} spike traps`);

        // Get player spawn from level data
        const spawn = this.levelLoader.getPlayerSpawn(this.currentLevel);

        // Initialize player inventory
        this.playerInventory = new PlayerInventory(this.characterClass === 'archer');
        this.playerInventory.onUpdate((state) => {
            this.updateInventoryUI(state);
        });

        // Restore saved state if available (for level transitions)
        // Always restore if we have a saved state with matching class - the save is only created when transitioning
        const savedState = PlayerInventory.loadGameState();
        console.log(`[DungeonScene] Checking saved state: exists=${!!savedState}, currentClass="${this.characterClass}"`);
        if (savedState) {
            console.log(`[DungeonScene] Saved state details: class="${savedState.characterClass}", health=${savedState.health}, potions=${savedState.potions.length}, arrows=${savedState.arrows}`);
            console.log(`[DungeonScene] Class match: "${savedState.characterClass}" === "${this.characterClass}" = ${savedState.characterClass === this.characterClass}`);
        }
        if (savedState && savedState.characterClass === this.characterClass) {
            // Restore health FIRST before any UI updates
            this.playerHealth = savedState.health;
            console.log(`[DungeonScene] Set playerHealth to ${this.playerHealth}`);

            // Then restore inventory
            this.playerInventory.restoreFromSave(savedState);
            console.log(`[DungeonScene] Restored inventory: potions=${this.playerInventory.getPotionCount()}, arrows=${this.playerInventory.getArrowCount()}`);

            // Clear the saved state after restoring to avoid restoring again on manual reload
            PlayerInventory.clearGameState();
            console.log(`[DungeonScene] Cleared saved state after restoration`);
        } else if (savedState) {
            console.log(`[DungeonScene] Saved state exists but class mismatch or null - not restoring`);
        }

        // Load player based on selected class
        if (this.characterClass === 'archer') {
            this.player = new ArcherController(this.scene, {
                position: spawn.position,
                scale: 1,
                walkSpeed: 0.06,
                runSpeed: 0.12,
                meshYOffset: 0
            });

            const playerBasePath = `${import.meta.env.BASE_URL}assets/Pro Longbow Pack/`;
            await this.player.load(playerBasePath);

            // Connect inventory to archer for arrow management
            (this.player as ArcherController).setInventory(this.playerInventory);
        } else if (this.characterClass === 'wizard') {
            this.player = new WizardController(this.scene, {
                position: spawn.position,
                scale: 1,
                walkSpeed: 0.045,
                runSpeed: 0.09,
                meshYOffset: 0
            });

            const playerBasePath = `${import.meta.env.BASE_URL}assets/Wizard Pack/`;
            await this.player.load(playerBasePath);
        } else {
            // Default: Knight
            this.player = new PlayerController(this.scene, {
                position: spawn.position,
                scale: 1,
                walkSpeed: 0.08,
                runSpeed: 0.15,
                meshYOffset: 0
            });

            const playerBasePath = `${import.meta.env.BASE_URL}assets/Sword and Shield Pack/`;
            await this.player.load(playerBasePath);
        }

        // Apply spawn rotation to player mesh
        if (this.player.rootMesh) {
            this.player.rootMesh.rotation.y = (spawn.rotation * Math.PI) / 180;
        }

        // Initialize chest system
        this.chestSystem = new ChestSystem(this.scene, this.playerInventory, this.characterClass === 'archer');
        await this.chestSystem.loadAssets(`${import.meta.env.BASE_URL}assets/`);
        this.chestSystem.registerChests();

        // Initialize door system
        this.doorSystem = new DoorSystem(this.scene);
        this.doorSystem.setAssets(assets);
        if (this.currentLevel?.interactiveDoors) {
            this.doorSystem.registerDoorsFromLevelData(this.currentLevel.interactiveDoors);
        }
        // Register exit door if present
        if (this.currentLevel?.exitDoor) {
            this.doorSystem.registerExitDoorFromLevelData(this.currentLevel.exitDoor);
        }

        // Load enemies
        await this.loadEnemies();

        // Setup camera to follow player with bounds from level data
        // Convert spawn rotation (degrees) to camera alpha (radians)
        // Camera should be behind the player (opposite direction)
        const spawnRotationRad = (spawn.rotation * Math.PI) / 180;
        const cameraAlpha = Math.PI / 2 - spawnRotationRad;

        this.camera = new ThirdPersonCamera(this.scene, this.canvas, {
            distance: 5,
            heightOffset: 1.5,
            bounds: this.currentLevel.cameraBounds,
            initialAlpha: cameraAlpha
        });

        if (this.player.rootMesh) {
            this.camera.setTarget(this.player.rootMesh);
            // Apply saved camera mode
            this.camera.setCameraMode(this.settings.cameraMode, this.player.rootMesh);
            // Setup dynamic light culling based on player position
            this.levelLoader.setPlayerTarget(this.player.rootMesh);
            // Setup chest system player target
            this.chestSystem.setPlayerTarget(this.player.rootMesh);
            // Setup door system player target
            if (this.doorSystem) {
                this.doorSystem.setPlayerTarget(this.player.rootMesh);
            }
        }
        this.player.setCamera(this.camera);

        // Apply pixel filter for retro look
        if (this.pixelFilter) {
            this.pixelFilter.dispose();
        }
        this.pixelFilter = new PixelFilter(this.scene);
        this.pixelFilter.applyToCamera(this.camera.getCamera());
        this.pixelFilter.setPixelSize(3); // Adjust for more/less pixelation (2-6)

        // Initialize healing effect
        this.healingEffect = new HealingEffect(this.scene);
        if (this.player.rootMesh) {
            this.healingEffect.setPlayerTarget(this.player.rootMesh);
        }

        // Initialize health vignette effect
        this.healthVignette = new HealthVignette(this.scene);
        this.healthVignette.applyToCamera(this.camera.getCamera());
        this.healthVignette.updateHealth(this.playerHealth);

        // Initialize companion (Spirit of the Dungeon)
        this.companion = new DungeonCompanion(this.scene);
        if (this.player.rootMesh) {
            this.companion.setPlayerTarget(this.player.rootMesh);
        }
        this.companion.updateContext({
            playerHealth: this.playerHealth,
            maxHealth: 100,
            enemiesAlive: this.enemies.filter(e => !e.isDead).length,
            enemiesTotal: this.enemies.length,
            potionCount: this.playerInventory?.getPotionCount() ?? 0,
            arrowCount: this.playerInventory?.getArrowCount() ?? 0,
            isArcher: this.characterClass === 'archer',
            isWizard: this.characterClass === 'wizard',
            characterClass: this.characterClass,
            levelIndex: this.currentLevelIndex,
            isPaused: false,
            isPlayerDead: false,
            isLevelComplete: false,
        });
        this.companion.trigger('level_start');

        // Setup player attack callback
        this.player.onAttackHit((position, range) => {
            this.handlePlayerAttack(position, range);
        });

        // Setup mouse events for attack/block
        this.setupMouseEvents();

        // Setup chest and item nearby callbacks
        this.chestSystem.onChestNearby((nearby) => {
            this.nearbyChest = nearby;
            // Update prompt based on all nearby states
            this.updateInteractPrompt(nearby, this.nearbyItem, !!this.nearbyDoor);
        });

        this.chestSystem.onItemNearby((nearby) => {
            this.nearbyItem = nearby;
            // Update prompt based on all nearby states
            this.updateInteractPrompt(this.nearbyChest, nearby, !!this.nearbyDoor);
        });

        // Setup item pickup notification callback
        this.chestSystem.onItemPickup((type, potionType, arrowCount) => {
            if (type === 'potion' && potionType) {
                const healAmounts: Record<string, number> = { 'p1': 20, 'p2': 35, 'p3': 50, 'p4': 100 };
                const tierNames: Record<string, string> = { 'p1': 'I', 'p2': 'II', 'p3': 'III', 'p4': 'IV' };
                const colors: Record<string, string> = { 'p1': '#ff8c00', 'p2': '#0080ff', 'p3': '#00cc00', 'p4': '#ff1a4d' };
                this.showPickupNotification(
                    `+Potion ${tierNames[potionType]} (+${healAmounts[potionType]} HP)`,
                    colors[potionType]
                );
                this.companion?.trigger('item_pickup_potion');
            } else if (type === 'arrows' && arrowCount) {
                this.showPickupNotification(`+${arrowCount} Flèches`, '#ffd700');
                this.companion?.trigger('item_pickup_arrows');
            }
            // Check inventory triggers after pickup
            if (this.playerInventory) {
                this.companion?.checkInventoryTriggers(
                    this.playerInventory.getPotionCount(),
                    this.playerInventory.getArrowCount()
                );
            }
        });

        // Setup door nearby callback
        if (this.doorSystem) {
            this.doorSystem.onDoorNearby((nearby, door) => {
                this.nearbyDoor = door;
                // Update prompt based on all nearby states
                this.updateInteractPrompt(this.nearbyChest, this.nearbyItem, nearby);
            });

            // Setup exit door callbacks
            this.doorSystem.onExitDoorNearby((nearby, isSealed) => {
                this.nearbyExitDoor = nearby;
                this.exitDoorSealed = isSealed;
                this.updateExitDoorPrompt(nearby, isSealed);
            });

            this.doorSystem.onExitDoorPassed(() => {
                // Player passed through exit door - trigger victory
                if (!this.isLevelComplete) {
                    this.isLevelComplete = true;
                    this.showVictoryMessage();
                }
            });
        }

        // Update camera in render loop (only when not paused)
        this.scene.onBeforeRenderObservable.add(() => {
            if (!this.scene.metadata?.isPaused) {
                this.camera?.update();
                this.checkTrapDamage();
                this.chestSystem?.update();
                this.doorSystem?.update();
                this.updateCompanionChecks();
            }
        });

        // Show health bar
        this.updateHealthUI();

        // Update controls display with current keybindings
        this.updateControlsDisplay();

        // Initialize audio and start ambient music
        await this.audioManager.init(this.scene);
        this.audioManager.playAmbientMusic();

        // Setup brazier sounds
        this.setupBrazierSounds();

        // Setup interaction keyboard listener
        this.setupInteractionListener();

        // Hide loading and show inventory
        document.getElementById('loading')?.classList.add('hidden');
        const invUI = document.getElementById('inventory-ui');
        if (invUI) invUI.style.visibility = 'visible';
    }

    // Companion proximity checks (called each frame from render loop)
    private lastCompanionCheck: number = 0;
    private companionCheckInterval: number = 2000; // Check every 2s
    private lastEnemySpottedCount: number = 0;

    private updateCompanionChecks(): void {
        if (!this.companion || !this.player?.rootMesh || this.isPlayerDead || this.isLevelComplete) return;

        const now = Date.now();
        if (now - this.lastCompanionCheck < this.companionCheckInterval) return;
        this.lastCompanionCheck = now;

        const playerPos = this.player.rootMesh.position;

        // Check for nearby enemies (enemy_spotted, all_enemies_near)
        let nearbyCount = 0;
        let chasingCount = 0;
        for (const enemy of this.enemies) {
            if (enemy.isDead) continue;
            const dist = Vector3.Distance(playerPos, enemy.position);
            if (dist < 12) {
                nearbyCount++;
                if (enemy.currentState === 'chasing' || enemy.currentState === 'attacking') {
                    chasingCount++;
                }
            }
        }

        // Trigger enemy_spotted when new enemies enter range
        if (nearbyCount > this.lastEnemySpottedCount && nearbyCount > 0) {
            // Check for boss
            const nearbyBoss = this.enemies.find(e =>
                !e.isDead && e.enemyType === 'warrok' &&
                Vector3.Distance(playerPos, e.position) < 14
            );
            if (nearbyBoss) {
                this.companion.trigger('boss_spotted');
            } else if (chasingCount > 0) {
                this.companion.trigger('enemy_spotted');
            }
        }
        this.lastEnemySpottedCount = nearbyCount;

        // All enemies near (3+ enemies within 8 units)
        if (chasingCount >= 3) {
            this.companion.trigger('all_enemies_near');
        }

        // Update companion context
        this.companion.updateContext({
            playerHealth: this.playerHealth,
            enemiesAlive: this.enemies.filter(e => !e.isDead).length,
            isPaused: this.isPaused,
        });

        // Crouch detection
        if (this.player.crouching) {
            this.companion.trigger('player_crouch');
        }
    }

    private checkTrapDamage(): void {
        if (!this.player?.rootMesh || this.isPlayerDead || this.isLevelComplete || this.spikeTraps.length === 0) return;

        const now = performance.now();
        if (now - this.lastTrapDamageTime < this.trapDamageCooldown) return;

        const playerPos = this.player.rootMesh.position;

        for (const trap of this.spikeTraps) {
            const dx = playerPos.x - trap.position.x;
            const dz = playerPos.z - trap.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < trap.radius) {
                // Player is on a spike trap!
                this.lastTrapDamageTime = now;
                this.playerHealth -= trap.damage;
                this.statsService.recordDamageTaken(trap.damage);
                console.log(`[DungeonScene] Player stepped on spike trap! -${trap.damage} HP (${this.playerHealth} remaining)`);
                this.updateHealthUI();
                this.camera?.shake(0.1, 150);
                this.companion?.trigger('trap_damage');
                this.companion?.checkHealthTriggers(this.playerHealth);

                // Play pain sound (female voice for archer, male for knight/wizard)
                if (this.characterClass === 'archer') {
                    this.audioManager.playArcherPainSound();
                } else {
                    this.audioManager.playPainSound();
                }

                if (this.playerHealth <= 0) {
                    this.handlePlayerDeath();
                }
                break; // Only take damage from one trap at a time
            }
        }
    }

    /**
     * Find all braziers in the scene and attach spatial campfire sounds
     */
    private setupBrazierSounds(): void {
        // Find all meshes that are braziers (brazier_A or brazier_B)
        const brazierMeshes = this.scene.meshes.filter(mesh =>
            mesh.name.toLowerCase().includes('brazier')
        );

        console.log(`[DungeonScene] Found ${brazierMeshes.length} braziers for audio`);

        for (const mesh of brazierMeshes) {
            // Create spatial sound for each brazier
            this.audioManager.createBrazierSound(mesh);
        }
    }

    private async loadEnemies(): Promise<void> {
        if (!this.currentLevel?.enemies || !this.player?.rootMesh) return;

        const enemyBasePath = `${import.meta.env.BASE_URL}assets/Creature Pack/`;

        for (const enemySpawn of this.currentLevel.enemies) {
            const enemy = new Enemy(this.scene, {
                position: new Vector3(
                    enemySpawn.position.x,
                    enemySpawn.position.y,
                    enemySpawn.position.z
                ),
                type: enemySpawn.type,
                health: enemySpawn.health,
                damage: enemySpawn.damage
            });

            await enemy.load(enemyBasePath);

            // Set player as target
            enemy.setTarget(this.player.rootMesh);

            // Set wall colliders for line-of-sight checks
            enemy.setColliders(this.levelLoader.getColliders());

            // Handle enemy death
            enemy.onDeath(() => {
                this.statsService.recordKill(enemy.typeName);
                // Companion: track kill and trigger appropriate dialogue
                const isBoss = enemy.enemyType === 'warrok';
                if (isBoss) {
                    this.companion?.trigger('boss_killed');
                } else {
                    this.companion?.trigger('enemy_killed');
                }
                this.companion?.recordKill();
                this.companion?.updateContext({
                    enemiesAlive: this.enemies.filter(e => !e.isDead).length
                });
                this.checkLevelComplete();
            });

            // Handle player getting hit
            enemy.onPlayerHit((damage) => {
                // Don't process damage if player is already dead
                if (this.isPlayerDead) return;

                // Check if player is blocking - reduce damage based on class
                if (this.player?.isCurrentlyBlocking) {
                    // Knight blocks 70% damage, Archer blocks 50%, Wizard blocks 40%
                    let blockReduction = 0.7; // Knight default
                    if (this.characterClass === 'archer') blockReduction = 0.5;
                    else if (this.characterClass === 'wizard') blockReduction = 0.4;
                    const reducedDamage = Math.ceil(damage * (1 - blockReduction));
                    console.log(`[DungeonScene] Player blocked! Reduced ${damage} to ${reducedDamage} damage (${blockReduction * 100}% reduction)`);
                    // Play shield block sound
                    this.audioManager.playShieldBlockSound();
                    this.companion?.trigger('player_block');

                    if (reducedDamage > 0) {
                        this.playerHealth -= reducedDamage;
                        this.statsService.recordDamageTaken(reducedDamage);
                        this.updateHealthUI();
                        this.camera?.shake(0.08, 120);
                        this.showDamageIndicator(enemy.position);
                        this.companion?.checkHealthTriggers(this.playerHealth);

                        if (this.playerHealth <= 0) {
                            this.handlePlayerDeath();
                        }
                    }
                    return;
                }

                this.playerHealth -= damage;
                this.statsService.recordDamageTaken(damage);
                console.log(`[DungeonScene] Player took ${damage} damage, health: ${this.playerHealth}`);
                this.updateHealthUI();
                this.camera?.shake(0.15, 200);
                this.showDamageIndicator(enemy.position);
                this.companion?.trigger('player_hit');
                this.companion?.checkHealthTriggers(this.playerHealth);

                // Play pain sound (female voice for archer, male for knight/wizard)
                if (this.characterClass === 'archer') {
                    this.audioManager.playArcherPainSound();
                } else {
                    this.audioManager.playPainSound();
                }

                if (this.playerHealth <= 0) {
                    this.handlePlayerDeath();
                }
            });

            this.enemies.push(enemy);
        }

        console.log(`[DungeonScene] Loaded ${this.enemies.length} enemies`);
    }

    /**
     * Check if there's a clear line of sight between two points (no walls blocking)
     */
    private hasLineOfSight(from: Vector3, to: Vector3): boolean {
        const colliders = this.levelLoader.getColliders();
        if (colliders.length === 0) return true;

        const direction = to.subtract(from);
        const distance = direction.length();
        direction.normalize();

        const ray = new Ray(from, direction, distance);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            return colliders.includes(mesh as Mesh);
        });

        // If we hit a wall before reaching the target, no line of sight
        return !hit?.hit;
    }

    private handlePlayerAttack(position: Vector3, range: number): void {
        this.companion?.notifyPlayerAction();

        // For archer, use trajectory-based hit detection with wall collision
        if (this.characterClass === 'archer' && this.player) {
            this.statsService.recordArrowShot();
            this.companion?.trigger('arrow_shot');
            const archer = this.player as ArcherController;
            const trajectory = archer.getArrowTrajectory();

            if (!trajectory) return;

            // First check if arrow hits a wall
            const wallHitDistance = this.checkArrowWallCollision(trajectory.origin, trajectory.direction, trajectory.maxDistance);

            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;

                // Check if enemy is on the arrow trajectory (with 1.2m tolerance for body width)
                const enemyCenter = enemy.position.clone();
                enemyCenter.y += 1.0; // Aim at chest height

                if (archer.isPointOnArrowTrajectory(enemyCenter, 1.2)) {
                    // Check if wall is hit before the enemy
                    const enemyDistance = Vector3.Distance(trajectory.origin, enemyCenter);
                    if (wallHitDistance !== null && wallHitDistance < enemyDistance) {
                        // Arrow hits wall before reaching enemy
                        archer.markProjectileHit();
                        console.log(`[DungeonScene] Arrow blocked by wall!`);
                        return;
                    }

                    // isRanged = true for arrows - triggers enraged state
                    enemy.takeDamage(25, true);
                    this.companion?.trigger('enemy_enraged');
                    this.statsService.recordDamageDealt(25);
                    archer.markProjectileHit(); // Stop the arrow projectile
                    console.log(`[DungeonScene] Arrow hit ${enemy.typeName}!`);
                    break; // Arrow only hits first enemy in path
                }
            }
        } else if (this.characterClass === 'wizard' && this.player) {
            this.statsService.recordSpellCast();
            this.companion?.trigger('spell_cast');
            // For wizard, use trajectory-based hit detection similar to archer
            const wizard = this.player as WizardController;
            const trajectory = wizard.getMagicTrajectory();

            if (!trajectory) return;

            // First check if magic hits a wall
            const wallHitDistance = this.checkArrowWallCollision(trajectory.origin, trajectory.direction, trajectory.maxDistance);

            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;

                // Check if enemy is on the magic trajectory (with 1.5m tolerance for magic area)
                const enemyCenter = enemy.position.clone();
                enemyCenter.y += 1.0; // Aim at chest height

                if (wizard.isPointOnMagicTrajectory(enemyCenter, 1.5)) {
                    // Check if wall is hit before the enemy
                    const enemyDistance = Vector3.Distance(trajectory.origin, enemyCenter);
                    if (wallHitDistance !== null && wallHitDistance < enemyDistance) {
                        // Magic hits wall before reaching enemy
                        wizard.markProjectileHit();
                        console.log(`[DungeonScene] Magic blocked by wall!`);
                        return;
                    }

                    // isRanged = true for magic - triggers enraged state
                    enemy.takeDamage(20, true); // Wizard deals 20 damage
                    this.companion?.trigger('enemy_enraged');
                    this.statsService.recordDamageDealt(20);
                    wizard.markProjectileHit(); // Stop the magic projectile
                    console.log(`[DungeonScene] Magic hit ${enemy.typeName}!`);
                    break; // Magic only hits first enemy in path
                }
            }
        } else {
            // For knight, use distance-based hit detection with line-of-sight check
            const playerPos = this.player?.rootMesh?.position;
            if (!playerPos) return;

            for (const enemy of this.enemies) {
                if (enemy.isDead) continue;

                const distance = Vector3.Distance(position, enemy.position);
                if (distance <= range) {
                    // Check line of sight from player to enemy
                    const enemyCenter = enemy.position.clone();
                    enemyCenter.y += 1.0; // Chest height
                    const playerCenter = playerPos.clone();
                    playerCenter.y += 1.0;

                    if (this.hasLineOfSight(playerCenter, enemyCenter)) {
                        // isRanged = false for melee - no enraged state
                        enemy.takeDamage(25, false);
                        this.statsService.recordDamageDealt(25);
                    }
                }
            }
        }
    }

    /**
     * Check if an arrow trajectory hits a wall, returns distance to wall or null
     */
    private checkArrowWallCollision(origin: Vector3, direction: Vector3, maxDistance: number): number | null {
        const colliders = this.levelLoader.getColliders();
        if (colliders.length === 0) return null;

        const ray = new Ray(origin, direction, maxDistance);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            return colliders.includes(mesh as Mesh);
        });

        if (hit?.hit && hit.distance !== undefined) {
            return hit.distance;
        }
        return null;
    }

    private checkLevelComplete(): void {
        const allDead = this.enemies.every(e => e.isDead);
        if (allDead && !this.isLevelComplete) {
            // If there's an exit door, unseal it instead of immediately showing victory
            if (this.doorSystem?.hasExitDoor()) {
                this.doorSystem.unsealExitDoor();
                this.companion?.trigger('exit_unsealed');
                console.log('[DungeonScene] All enemies defeated - exit door unsealed!');
            } else {
                // No exit door - show victory immediately (original behavior)
                this.isLevelComplete = true;
                this.showVictoryMessage();
            }
        }
    }

    private showVictoryMessage(): void {
        console.log('[DungeonScene] Level Complete!');
        this.statsService.flushOnLevelComplete();
        // Hide companion UI - victory overlay covers it anyway
        this.companion?.setVisible(false);
        this.companion?.updateContext({ isLevelComplete: true });

        // Play win sound
        this.audioManager.playWinSound();

        // Release pointer lock so user can click buttons
        document.exitPointerLock();

        // Convert to 1-indexed for user-friendly URLs
        const nextLevelNumber = this.currentLevelIndex + 2;
        const isLastHandmade = this.currentLevelIndex === LEVELS.length - 1;

        // Transition message when moving from handmade to procedural levels
        let transitionHtml = '';
        if (isLastHandmade) {
            transitionHtml = `<p class="transition-msg">Attention, les prochaines cryptes sont de véritables labyrinthes générés par la malédiction... Chaque crypte sera unique et plus dangereuse.</p>`;
        }

        const buttonsHtml = `
            ${transitionHtml}
            <button id="next-level-btn">Niveau Suivant</button>
            <button id="menu-btn" class="secondary">Menu Principal</button>
        `;

        const overlay = document.createElement('div');
        overlay.id = 'victory-overlay';
        overlay.innerHTML = `
            <div class="victory-particles"></div>
            <div class="victory-content">
                <h1>VICTOIRE</h1>
                <div class="victory-divider"></div>
                <p class="level-name">${this.currentLevel?.name || 'Unknown'}</p>
                <p class="sub">Tous les ennemis ont été vaincus</p>
                ${buttonsHtml}
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #victory-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(ellipse at center, rgba(20, 15, 0, 0.95) 0%, rgba(0, 0, 0, 0.98) 100%);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                animation: victoryFadeIn 0.8s ease-out forwards;
            }
            @keyframes victoryFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .victory-particles {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-image:
                    radial-gradient(2px 2px at 20% 30%, #ffd700, transparent),
                    radial-gradient(2px 2px at 40% 70%, #ffaa00, transparent),
                    radial-gradient(2px 2px at 60% 20%, #ffd700, transparent),
                    radial-gradient(2px 2px at 80% 60%, #ffaa00, transparent),
                    radial-gradient(3px 3px at 10% 80%, #ffd700, transparent),
                    radial-gradient(3px 3px at 90% 40%, #ffaa00, transparent);
                animation: sparkle 3s ease-in-out infinite;
            }
            @keyframes sparkle {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 0.8; transform: scale(1.1); }
            }
            .victory-content {
                text-align: center;
                color: #ffd700;
                font-family: 'Montaga', 'Georgia', serif;
                position: relative;
                z-index: 1;
            }
            .victory-content h1 {
                font-size: 5rem;
                margin: 0;
                letter-spacing: 0.3em;
                text-shadow: 0 0 30px #ffd700, 0 0 60px #ff8c00, 0 0 90px #ff6600;
                opacity: 0;
                animation: victoryTitle 1s ease-out 0.3s forwards;
            }
            @keyframes victoryTitle {
                from { transform: translateY(-30px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .victory-divider {
                width: 0;
                height: 2px;
                background: linear-gradient(90deg, transparent, #ffd700, transparent);
                margin: 1.5rem auto;
                animation: victoryDivider 1s ease-out 0.5s forwards;
            }
            @keyframes victoryDivider {
                from { width: 0; opacity: 0; }
                to { width: 200px; opacity: 1; }
            }
            .victory-content .level-name {
                font-size: 1.8rem;
                color: #fff;
                margin: 0.5rem 0;
                font-style: italic;
                opacity: 0;
                animation: victoryText 0.8s ease-out 0.6s forwards;
            }
            .victory-content .sub {
                font-size: 1rem;
                color: #888;
                margin-top: 0.5rem;
                opacity: 0;
                animation: victoryText 0.8s ease-out 0.7s forwards;
            }
            @keyframes victoryText {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .victory-content .transition-msg {
                font-size: 1rem;
                color: #ff8c00;
                margin: 1.5rem auto 0;
                max-width: 400px;
                line-height: 1.6;
                font-style: italic;
                text-align: center;
                opacity: 0;
                animation: victoryText 0.8s ease-out 0.8s forwards;
            }
            .victory-content button {
                margin-top: 2.5rem;
                padding: 1rem 2.5rem;
                font-size: 1.2rem;
                font-family: 'Montaga', 'Georgia', serif;
                background: linear-gradient(180deg, #ffd700 0%, #cc9900 50%, #aa7700 100%);
                color: #1a1000;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3);
                opacity: 0;
                animation: victoryBtn 0.8s ease-out 0.9s forwards;
            }
            @keyframes victoryBtn {
                from { transform: translateY(30px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .victory-content button:hover {
                transform: translateY(-3px);
                box-shadow: 0 8px 25px rgba(255, 215, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.3);
                background: linear-gradient(180deg, #ffe44d 0%, #ddaa00 50%, #bb8800 100%);
            }
            .victory-content button.secondary {
                background: linear-gradient(180deg, rgba(40, 30, 20, 0.9) 0%, rgba(20, 15, 10, 0.95) 100%);
                color: #d4c4a0;
                border: 2px solid #4a3a25;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 200, 100, 0.1);
                margin-left: 1rem;
            }
            .victory-content button.secondary:hover {
                border-color: #ffd700;
                color: #ffd700;
                background: linear-gradient(180deg, rgba(60, 45, 30, 0.9) 0%, rgba(30, 22, 15, 0.95) 100%);
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);

        // Add event listeners
        document.getElementById('next-level-btn')?.addEventListener('click', () => {
            // Save game state before transitioning to next level
            if (this.playerInventory) {
                PlayerInventory.saveGameState(this.playerInventory, this.playerHealth, this.characterClass);
                console.log(`[DungeonScene] Saved state before level ${nextLevelNumber}: health=${this.playerHealth}, potions=${this.playerInventory.getPotionCount()}`);
            }
            window.location.href = `${window.location.pathname}?level=${nextLevelNumber}&class=${this.characterClass}`;
        });
        document.getElementById('menu-btn')?.addEventListener('click', () => {
            PlayerInventory.clearGameState();
            window.location.href = window.location.pathname;
        });
    }

    private updateHealthUI(): void {
        let healthBar = document.getElementById('health-bar');
        if (!healthBar) {
            healthBar = document.createElement('div');
            healthBar.id = 'health-bar';
            healthBar.innerHTML = `
                <div class="health-fill"></div>
                <span class="health-text"></span>
            `;
            healthBar.style.cssText = `
                position: fixed;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%);
                width: 350px;
                height: 16px;
                background: #1a0a0a;
                border: 2px solid #4a3a25;
                border-radius: 4px;
                overflow: visible;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.5), inset 0 2px 4px rgba(0, 0, 0, 0.5);
            `;

            const style = document.createElement('style');
            style.textContent = `
                #health-bar .health-fill {
                    height: 100%;
                    background: linear-gradient(to right, #4a0000, #8b0000);
                    transition: width 0.3s ease;
                    border-radius: 2px;
                    position: relative;
                }
                #health-bar .health-fill::after {
                    content: '';
                    position: absolute;
                    right: -1px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 3px;
                    height: 20px;
                    background: #ffd700;
                    border-radius: 2px;
                    box-shadow: 0 0 8px #ffd700, 0 0 16px #ffaa00, 0 0 24px #ff8800;
                }
                #health-bar.full .health-fill::after {
                    display: none;
                }
                #health-bar .health-text {
                    display: none;
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(healthBar);
        }

        const fill = healthBar.querySelector('.health-fill') as HTMLElement;
        const percent = Math.max(0, this.playerHealth);
        fill.style.width = `${percent}%`;

        // Hide glow when at full health
        if (percent >= 100) {
            healthBar.classList.add('full');
        } else {
            healthBar.classList.remove('full');
        }

        // Update health vignette effect
        this.healthVignette?.updateHealth(this.playerHealth);
    }

    private async handlePlayerDeath(): Promise<void> {
        if (this.isPlayerDead) return;
        this.isPlayerDead = true;

        console.log('[DungeonScene] Player died!');
        this.statsService.flushOnDeath();
        // Hide companion UI - death overlay covers it anyway
        this.companion?.setVisible(false);
        this.companion?.updateContext({ isPlayerDead: true });

        // Play death sound
        this.audioManager.playDeathSound();

        // Play UX lose and evil laugh sounds
        this.audioManager.playLoseSound();
        this.audioManager.playEvilLaughSound();

        // Make all living enemies celebrate
        for (const enemy of this.enemies) {
            if (!enemy.isDead) {
                enemy.celebrate();
            }
        }

        // Play player death animation and wait for it to complete
        if (this.player) {
            await this.player.playDeath();
        }

        // Dispose all enemies and player to free resources
        for (const enemy of this.enemies) {
            enemy.dispose();
        }
        this.enemies = [];

        if (this.player) {
            this.player.dispose();
            this.player = null;
        }

        // Hide companion on death (keep it for the death message display)
        this.companion?.setVisible(false);

        // Release pointer lock so user can click buttons
        document.exitPointerLock();

        const overlay = document.createElement('div');
        overlay.id = 'death-overlay';
        overlay.innerHTML = `
            <div class="death-vignette"></div>
            <div class="death-content">
                <h1>MORT</h1>
                <div class="death-divider"></div>
                <p>Vous avez été vaincu...</p>
                <button id="retry-btn">
                    <span>Réessayer</span>
                </button>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #death-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(ellipse at center, rgba(40, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.98) 100%);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                animation: deathFadeIn 1.5s ease-out forwards;
            }
            @keyframes deathFadeIn {
                0% { opacity: 0; }
                30% { opacity: 0; }
                100% { opacity: 1; }
            }
            .death-vignette {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                box-shadow: inset 0 0 200px rgba(100, 0, 0, 0.8);
                pointer-events: none;
            }
            .death-content {
                text-align: center;
                color: #aa0000;
                font-family: 'Montaga', 'Georgia', serif;
                position: relative;
                z-index: 1;
            }
            .death-content h1 {
                font-size: 6rem;
                margin: 0;
                letter-spacing: 0.5em;
                color: #8b0000;
                text-shadow: 0 0 20px #ff0000, 0 0 40px #aa0000, 0 4px 0 #330000;
                animation: deathTitle 1.2s ease-out 0.3s forwards;
                opacity: 0;
            }
            @keyframes deathTitle {
                0% { transform: scale(2); opacity: 0; letter-spacing: 1em; }
                100% { transform: scale(1); opacity: 1; letter-spacing: 0.5em; }
            }
            .death-divider {
                width: 0;
                height: 2px;
                background: linear-gradient(90deg, transparent, #8b0000, transparent);
                margin: 1.5rem auto;
                animation: deathDivider 1s ease-out 0.8s forwards;
            }
            @keyframes deathDivider {
                from { width: 0; opacity: 0; }
                to { width: 150px; opacity: 1; }
            }
            .death-content p {
                font-size: 1.4rem;
                color: #666;
                margin: 0;
                font-style: italic;
                opacity: 0;
                animation: deathText 0.8s ease-out 1s forwards;
            }
            @keyframes deathText {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .death-content button {
                margin-top: 2.5rem;
                padding: 1rem 2.5rem;
                font-size: 1.2rem;
                font-family: 'Montaga', 'Georgia', serif;
                background: linear-gradient(180deg, #4a0000 0%, #2a0000 50%, #1a0000 100%);
                color: #cc4444;
                border: 2px solid #660000;
                border-radius: 4px;
                cursor: pointer;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(100, 0, 0, 0.5), inset 0 1px 0 rgba(255, 100, 100, 0.1);
                opacity: 0;
                animation: deathBtn 0.8s ease-out 1.2s forwards;
            }
            @keyframes deathBtn {
                from { transform: translateY(30px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .death-content button:hover {
                transform: translateY(-3px);
                background: linear-gradient(180deg, #5a0000 0%, #3a0000 50%, #2a0000 100%);
                border-color: #880000;
                color: #ff6666;
                box-shadow: 0 8px 25px rgba(150, 0, 0, 0.6), inset 0 1px 0 rgba(255, 100, 100, 0.2);
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);

        document.getElementById('retry-btn')?.addEventListener('click', () => {
            location.reload();
        });
    }

    private setupMouseEvents(): void {
        // Handler for mouse/pointer down
        const handleDown = (button: number, eventType: string) => {
            console.log(`[Mouse] ${eventType} - button: ${button}, pointerLock: ${document.pointerLockElement === this.canvas}`);
            if (document.pointerLockElement === this.canvas) {
                console.log(`[Mouse] -> Processing button ${button}`);
                this.player?.onMouseDown(button);
            }
        };

        // Handler for mouse/pointer up
        const handleUp = (button: number, eventType: string) => {
            console.log(`[Mouse] ${eventType} - button: ${button}`);
            if (document.pointerLockElement === this.canvas) {
                this.player?.onMouseUp(button);
            }
        };

        // Try multiple event types for maximum compatibility
        // 1. Standard mouse events
        document.addEventListener('mousedown', (e) => handleDown(e.button, 'mousedown'));
        document.addEventListener('mouseup', (e) => handleUp(e.button, 'mouseup'));

        // 2. Pointer events (better for some gaming mice)
        document.addEventListener('pointerdown', (e) => handleDown(e.button, 'pointerdown'));
        document.addEventListener('pointerup', (e) => handleUp(e.button, 'pointerup'));

        // 3. Also try on window with capture phase
        window.addEventListener('mousedown', (e) => {
            console.log(`[Window] mousedown captured - button: ${e.button}`);
        }, true);

        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        document.addEventListener('contextmenu', (e) => {
            if (document.pointerLockElement === this.canvas) {
                e.preventDefault();
            }
        });

        console.log('[Mouse] Event listeners setup complete');
    }

    get levelData(): LevelData | null {
        return this.currentLevel;
    }

    private setupPauseMenu(): void {
        // P key to toggle pause (configurable), V key to toggle camera mode
        window.addEventListener('keydown', (e) => {
            // V key to toggle camera mode
            if (e.code === 'KeyV') {
                // Don't toggle if game is over or paused
                if (this.isPlayerDead || this.isLevelComplete || this.isPaused) return;

                if (this.camera && this.player?.rootMesh) {
                    const newMode = this.camera.isFirstPerson ? 'thirdPerson' : 'firstPerson';
                    this.camera.setCameraMode(newMode, this.player.rootMesh);
                    this.settings.cameraMode = newMode;
                    this.settings.save();
                }
                return;
            }

            // Check if pause key is pressed
            if (this.settings.isKeyBound('pause', e.code)) {
                // Don't pause if game is over
                if (this.isPlayerDead || this.isLevelComplete) return;

                // If settings or controls panel is open, close it
                const settingsPanel = document.getElementById('settings-panel');
                const controlsPanel = document.getElementById('controls-panel');
                if (settingsPanel?.classList.contains('visible')) {
                    settingsPanel.classList.remove('visible');
                    return;
                }
                if (controlsPanel?.classList.contains('visible')) {
                    controlsPanel.classList.remove('visible');
                    return;
                }

                this.togglePause();
            }
        });

        // Resume button
        document.getElementById('pause-resume')?.addEventListener('click', () => {
            this.resumeGame();
        });

        // Settings button in pause menu
        document.getElementById('pause-settings')?.addEventListener('click', () => {
            document.getElementById('pause-menu')?.classList.remove('visible');
            this.loadSettingsToUI();
            document.getElementById('settings-panel')?.classList.add('visible');
        });

        // Controls button in settings
        document.getElementById('btn-controls')?.addEventListener('click', () => {
            document.getElementById('settings-panel')?.classList.remove('visible');
            this.loadControlsToUI();
            document.getElementById('controls-panel')?.classList.add('visible');
        });

        // Controls panel buttons
        document.getElementById('controls-back')?.addEventListener('click', () => {
            document.getElementById('controls-panel')?.classList.remove('visible');
            document.getElementById('settings-panel')?.classList.add('visible');
        });

        document.getElementById('controls-reset')?.addEventListener('click', () => {
            this.settings.resetKeyBindings();
            this.loadControlsToUI();
        });

        // Quit to main menu
        document.getElementById('pause-quit')?.addEventListener('click', () => {
            PlayerInventory.clearGameState();
            window.location.href = window.location.pathname;
        });

        // Settings save from pause menu
        document.getElementById('settings-save')?.addEventListener('click', () => {
            this.saveSettingsFromUI();
            document.getElementById('settings-panel')?.classList.remove('visible');
            // Re-show pause menu if game is paused
            if (this.isPaused) {
                document.getElementById('pause-menu')?.classList.add('visible');
            }
        });

        // Settings cancel from pause menu
        document.getElementById('settings-cancel')?.addEventListener('click', () => {
            document.getElementById('settings-panel')?.classList.remove('visible');
            // Re-show pause menu if game is paused
            if (this.isPaused) {
                document.getElementById('pause-menu')?.classList.add('visible');
            }
        });

        // Setup key binding listeners
        this.setupKeyBindingListeners();

        // Setup toggle switches (for in-game settings)
        document.getElementById('toggle-fps')?.addEventListener('click', (e) => {
            (e.target as HTMLElement).classList.toggle('active');
        });

        document.getElementById('toggle-controls')?.addEventListener('click', (e) => {
            (e.target as HTMLElement).classList.toggle('active');
        });

        document.getElementById('toggle-crouch-mode')?.addEventListener('click', (e) => {
            (e.target as HTMLElement).classList.toggle('active');
        });

        // Setup slider value displays
        document.getElementById('music-volume')?.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value;
            const display = document.getElementById('music-value');
            if (display) display.textContent = value;
        });

        document.getElementById('sfx-volume')?.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value;
            const display = document.getElementById('sfx-value');
            if (display) display.textContent = value;
        });

        document.getElementById('mouse-sensitivity')?.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value;
            const display = document.getElementById('sensitivity-value');
            if (display) display.textContent = value;
        });
    }

    private setupKeyBindingListeners(): void {
        // Add click listeners to all key binding buttons
        document.querySelectorAll('.key-bind-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.currentTarget as HTMLElement;
                const action = button.dataset.action as keyof KeyBindings;
                if (!action) return;

                // Mark as listening
                button.classList.add('listening');
                button.textContent = '...';

                // Listen for next key press
                const keyHandler = (keyEvent: KeyboardEvent) => {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();

                    // Don't allow Escape as a binding
                    if (keyEvent.code === 'Escape') {
                        button.classList.remove('listening');
                        this.loadControlsToUI();
                        return;
                    }

                    // Set the new binding
                    this.settings.setBinding(action, [keyEvent.code]);
                    button.classList.remove('listening');
                    this.loadControlsToUI();

                    window.removeEventListener('keydown', keyHandler, true);
                };

                window.addEventListener('keydown', keyHandler, true);
            });
        });
    }

    private loadControlsToUI(): void {
        const bindings = this.settings.keyBindings;

        const updateButton = (action: string) => {
            const btn = document.querySelector(`.key-bind-btn[data-action="${action}"]`);
            if (btn) {
                btn.textContent = this.settings.getBindingDisplay(action as keyof KeyBindings);
            }
        };

        updateButton('forward');
        updateButton('backward');
        updateButton('left');
        updateButton('right');
        updateButton('run');
        updateButton('jump');
        updateButton('crouch');
        updateButton('pause');
        updateButton('interact');
    }

    private togglePause(): void {
        if (this.isPaused) {
            this.resumeGame();
        } else {
            this.pauseGame();
        }
    }

    private pauseGame(): void {
        this.isPaused = true;
        this.scene.metadata = this.scene.metadata || {};
        this.scene.metadata.isPaused = true;
        this.companion?.updateContext({ isPaused: true });

        // Store which animations were playing (with their loop state) and pause them
        this.pausedAnimations.clear();
        for (const animGroup of this.scene.animationGroups) {
            if (animGroup.isPlaying) {
                this.pausedAnimations.set(animGroup, animGroup.loopAnimation);
                animGroup.pause();
            }
        }

        // Pause audio
        this.audioManager.pauseAll();

        // Play loading sound (looping) during pause
        this.audioManager.playLoadingSound();

        document.getElementById('pause-menu')?.classList.add('visible');
        document.exitPointerLock();
    }

    private resumeGame(): void {
        this.isPaused = false;
        if (this.scene.metadata) {
            this.scene.metadata.isPaused = false;
        }
        this.companion?.updateContext({ isPaused: false });

        // Resume only the animations that were playing before pause
        for (const [animGroup, wasLooping] of this.pausedAnimations) {
            animGroup.play(wasLooping);
        }
        this.pausedAnimations.clear();

        // Stop loading sound and resume game audio
        this.audioManager.stopLoadingSound();
        this.audioManager.resumeAll();

        document.getElementById('pause-menu')?.classList.remove('visible');
        document.getElementById('settings-panel')?.classList.remove('visible');
        document.getElementById('controls-panel')?.classList.remove('visible');
    }

    private loadSettingsToUI(): void {
        const musicSlider = document.getElementById('music-volume') as HTMLInputElement;
        const sfxSlider = document.getElementById('sfx-volume') as HTMLInputElement;
        const sensitivitySlider = document.getElementById('mouse-sensitivity') as HTMLInputElement;
        const fpsToggle = document.getElementById('toggle-fps');
        const controlsToggle = document.getElementById('toggle-controls');
        const crouchModeToggle = document.getElementById('toggle-crouch-mode');

        if (musicSlider) {
            musicSlider.value = String(this.settings.musicVolume);
            const display = document.getElementById('music-value');
            if (display) display.textContent = String(this.settings.musicVolume);
        }

        if (sfxSlider) {
            sfxSlider.value = String(this.settings.sfxVolume);
            const display = document.getElementById('sfx-value');
            if (display) display.textContent = String(this.settings.sfxVolume);
        }

        if (sensitivitySlider) {
            sensitivitySlider.value = String(this.settings.mouseSensitivity);
            const display = document.getElementById('sensitivity-value');
            if (display) display.textContent = String(this.settings.mouseSensitivity);
        }

        if (fpsToggle) {
            fpsToggle.classList.toggle('active', this.settings.showFps);
        }

        if (controlsToggle) {
            controlsToggle.classList.toggle('active', this.settings.showControls);
        }

        if (crouchModeToggle) {
            // Active = hold mode, Inactive = toggle mode
            crouchModeToggle.classList.toggle('active', this.settings.crouchMode === 'hold');
        }
    }

    private saveSettingsFromUI(): void {
        const musicSlider = document.getElementById('music-volume') as HTMLInputElement;
        const sfxSlider = document.getElementById('sfx-volume') as HTMLInputElement;
        const sensitivitySlider = document.getElementById('mouse-sensitivity') as HTMLInputElement;
        const fpsToggle = document.getElementById('toggle-fps');
        const controlsToggle = document.getElementById('toggle-controls');
        const crouchModeToggle = document.getElementById('toggle-crouch-mode');

        if (musicSlider) {
            this.settings.musicVolume = parseInt(musicSlider.value, 10);
        }

        if (sfxSlider) {
            this.settings.sfxVolume = parseInt(sfxSlider.value, 10);
        }

        if (sensitivitySlider) {
            this.settings.mouseSensitivity = parseInt(sensitivitySlider.value, 10);
        }

        if (fpsToggle) {
            this.settings.showFps = fpsToggle.classList.contains('active');
        }

        if (controlsToggle) {
            this.settings.showControls = controlsToggle.classList.contains('active');
        }

        if (crouchModeToggle) {
            // Active = hold mode, Inactive = toggle mode
            this.settings.crouchMode = crouchModeToggle.classList.contains('active') ? 'hold' : 'toggle';
        }

        this.settings.save();

        // Apply sensitivity immediately
        this.camera?.updateSensitivity();

        // Apply audio volumes immediately
        this.audioManager.applyVolumes();

        // Update controls display
        this.updateControlsDisplay();
    }

    private updateControlsDisplay(): void {
        // Get display names for movement keys (combine forward, left, backward, right)
        const forward = this.settings.getBindingDisplay('forward');
        const left = this.settings.getBindingDisplay('left');
        const backward = this.settings.getBindingDisplay('backward');
        const right = this.settings.getBindingDisplay('right');
        const movementKeys = `${forward}${left}${backward}${right}`;

        const runKey = this.settings.getBindingDisplay('run');
        const jumpKey = this.settings.getBindingDisplay('jump');
        const crouchKey = this.settings.getBindingDisplay('crouch');
        const pauseKey = this.settings.getBindingDisplay('pause');

        // Update all elements with data-control attribute
        document.querySelectorAll('[data-control="movement"]').forEach(el => {
            el.textContent = movementKeys;
        });

        document.querySelectorAll('[data-control="run"]').forEach(el => {
            el.textContent = runKey;
        });

        document.querySelectorAll('[data-control="jump"]').forEach(el => {
            el.textContent = jumpKey;
        });

        document.querySelectorAll('[data-control="crouch"]').forEach(el => {
            el.textContent = crouchKey;
        });

        document.querySelectorAll('[data-control="pause"]').forEach(el => {
            el.textContent = pauseKey;
        });

        const interactKey = this.settings.getBindingDisplay('interact');
        document.querySelectorAll('[data-control="interact"]').forEach(el => {
            el.textContent = interactKey;
        });
    }

    private updateFpsCounter(): void {
        const fpsCounter = document.getElementById('fps-counter');
        if (!fpsCounter) return;

        // Show/hide based on settings
        if (this.settings.showFps) {
            fpsCounter.classList.add('visible');
        } else {
            fpsCounter.classList.remove('visible');
            return;
        }

        // Update FPS every 500ms
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate >= 500) {
            const fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            const fpsValue = fpsCounter.querySelector('.fps-value');
            if (fpsValue) {
                fpsValue.textContent = String(fps);
            }

            // Color based on performance
            fpsCounter.classList.remove('low', 'medium');
            if (fps < 30) {
                fpsCounter.classList.add('low');
            } else if (fps < 50) {
                fpsCounter.classList.add('medium');
            }

            this.frameCount = 0;
            this.lastFpsUpdate = now;
        }
    }

    private updateDebugPosition(): void {
        const debugPos = document.getElementById('debug-position');
        if (!debugPos) return;

        // Show debug position when FPS counter is visible (uses same setting)
        if (this.settings.showFps && this.player) {
            debugPos.classList.add('visible');
            const pos = this.player.position;
            const posX = debugPos.querySelector('.pos-x');
            const posY = debugPos.querySelector('.pos-y');
            const posZ = debugPos.querySelector('.pos-z');
            if (posX) posX.textContent = pos.x.toFixed(1);
            if (posY) posY.textContent = pos.y.toFixed(1);
            if (posZ) posZ.textContent = pos.z.toFixed(1);
        } else {
            debugPos.classList.remove('visible');
        }
    }

    render(): void {
        // Update FPS counter
        this.updateFpsCounter();

        // Update debug position
        this.updateDebugPosition();

        // Update gamepad camera look
        this.updateGamepadCamera();

        // Don't update game logic if paused, but still render
        if (!this.isPaused) {
            this.scene.render();
        } else {
            // Still render but without animation updates
            this.scene.render();
        }
    }

    /**
     * Update the inventory UI (potions and arrows)
     */
    private updateInventoryUI(state: { potions: PotionType[]; arrows: number; maxArrows: number }): void {
        let inventoryUI = document.getElementById('inventory-ui');
        if (!inventoryUI) {
            inventoryUI = document.createElement('div');
            inventoryUI.id = 'inventory-ui';
            inventoryUI.style.cssText = `
                position: fixed;
                bottom: 60px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 20px;
                font-family: 'Montaga', 'Georgia', serif;
                z-index: 100;
                visibility: hidden;
            `;

            const style = document.createElement('style');
            style.textContent = `
                #inventory-ui .inv-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    background: linear-gradient(180deg, rgba(20, 15, 10, 0.9) 0%, rgba(10, 8, 5, 0.95) 100%);
                    border: 1px solid #3d2f1f;
                    border-radius: 4px;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
                }
                #inventory-ui .inv-icon {
                    font-size: 20px;
                }
                #inventory-ui .inv-count {
                    color: #ffd700;
                    font-size: 18px;
                    font-weight: bold;
                    text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
                }
                #inventory-ui .inv-label {
                    color: #b8a070;
                    font-size: 12px;
                }
                #inventory-ui .arrows .inv-count.empty {
                    color: #ff4444;
                }
                #inventory-ui .potion-slots {
                    display: flex;
                    gap: 6px;
                }
                #inventory-ui .potion-slot {
                    width: 48px;
                    height: 52px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(180deg, rgba(20, 15, 10, 0.9) 0%, rgba(10, 8, 5, 0.95) 100%);
                    border: 2px solid #3d2f1f;
                    border-radius: 4px;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
                    position: relative;
                }
                #inventory-ui .potion-slot.empty {
                    opacity: 0.35;
                }
                #inventory-ui .potion-slot .slot-key {
                    position: absolute;
                    top: 2px;
                    left: 4px;
                    font-size: 9px;
                    color: #706040;
                    font-family: 'Consolas', monospace;
                }
                #inventory-ui .potion-slot .slot-tier {
                    font-size: 16px;
                    font-weight: bold;
                    text-shadow: 0 0 6px currentColor;
                }
                #inventory-ui .potion-slot .slot-heal {
                    font-size: 9px;
                    color: #b8a070;
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(inventoryUI);
        }

        // Potion color/tier config
        const potionConfig: Record<string, { color: string; tier: string; heal: string }> = {
            'p1': { color: '#ff8c00', tier: 'I', heal: '+20' },
            'p2': { color: '#0080ff', tier: 'II', heal: '+35' },
            'p3': { color: '#00cc00', tier: 'III', heal: '+50' },
            'p4': { color: '#ff1a4d', tier: 'IV', heal: '+100' },
        };

        // Build UI content
        let html = '<div class="potion-slots">';
        for (let i = 0; i < 4; i++) {
            const potion = state.potions[i];
            if (potion) {
                const cfg = potionConfig[potion];
                html += `
                    <div class="potion-slot" style="border-color: ${cfg.color};">
                        <span class="slot-key">${i + 1}</span>
                        <span class="slot-tier" style="color: ${cfg.color};">${cfg.tier}</span>
                        <span class="slot-heal">${cfg.heal}</span>
                    </div>
                `;
            } else {
                html += `
                    <div class="potion-slot empty">
                        <span class="slot-key">${i + 1}</span>
                        <span class="slot-tier" style="color: #3d2f1f;">-</span>
                    </div>
                `;
            }
        }
        html += '</div>';

        // Arrows (only for archer)
        if (this.characterClass === 'archer') {
            const isEmpty = state.arrows === 0;
            html += `
                <div class="inv-item arrows">
                    <span class="inv-icon">🏹</span>
                    <div>
                        <span class="inv-count ${isEmpty ? 'empty' : ''}">${state.arrows}</span>
                        <span class="inv-label">/${state.maxArrows}</span>
                    </div>
                </div>
            `;
        }

        inventoryUI.innerHTML = html;
    }

    /**
     * Update the interaction prompt (press F to open chest/door)
     */
    private updateInteractPrompt(nearChest: boolean, nearItem: boolean = false, nearDoor: boolean = false): void {
        let prompt = document.getElementById('interact-prompt');
        const show = nearChest || nearItem || nearDoor;

        if (show) {
            if (!prompt) {
                prompt = document.createElement('div');
                prompt.id = 'interact-prompt';
                prompt.style.cssText = `
                    position: fixed;
                    bottom: 120px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 12px 24px;
                    background: linear-gradient(180deg, rgba(20, 15, 10, 0.95) 0%, rgba(10, 8, 5, 0.98) 100%);
                    border: 2px solid #ffd700;
                    border-radius: 4px;
                    font-family: 'Montaga', 'Georgia', serif;
                    color: #ffd700;
                    font-size: 14px;
                    z-index: 100;
                    box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
                    animation: promptPulse 1.5s ease-in-out infinite;
                `;

                const style = document.createElement('style');
                style.id = 'interact-prompt-style';
                style.textContent = `
                    @keyframes promptPulse {
                        0%, 100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.3); }
                        50% { box-shadow: 0 0 30px rgba(255, 215, 0, 0.5); }
                    }
                `;
                if (!document.getElementById('interact-prompt-style')) {
                    document.head.appendChild(style);
                }

                document.body.appendChild(prompt);
            }

            // Show gamepad button if gamepad is active, otherwise keyboard key
            let interactKey: string;
            if (this.gamepadManager.getActiveInputType() === 'gamepad' && this.gamepadManager.isConnected()) {
                const controllerType = this.gamepadManager.getControllerType();
                interactKey = GamepadManager.getButtonDisplayName(GamepadButton.Y, controllerType);
            } else {
                interactKey = this.settings.getBindingDisplay('interact');
            }
            if (nearDoor) {
                prompt.innerHTML = `<span style="background: #2a2015; padding: 2px 8px; border-radius: 3px; margin-right: 8px;">${interactKey}</span> Ouvrir la porte`;
            } else if (nearChest) {
                prompt.innerHTML = `<span style="background: #2a2015; padding: 2px 8px; border-radius: 3px; margin-right: 8px;">${interactKey}</span> Ouvrir le coffre`;
            } else if (nearItem) {
                prompt.innerHTML = `<span style="background: #2a2015; padding: 2px 8px; border-radius: 3px; margin-right: 8px;">${interactKey}</span> Ramasser`;
            }
            prompt.style.display = 'block';
        } else if (prompt) {
            prompt.style.display = 'none';
        }
    }

    /**
     * Update UI prompt for exit door interaction
     */
    private updateExitDoorPrompt(nearby: boolean, isSealed: boolean): void {
        // Get or create the exit door prompt element
        let prompt = document.getElementById('exit-door-prompt');

        if (nearby) {
            if (!prompt) {
                prompt = document.createElement('div');
                prompt.id = 'exit-door-prompt';
                prompt.style.cssText = `
                    position: fixed;
                    bottom: 25%;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 12px 24px;
                    background: linear-gradient(135deg, rgba(20, 15, 10, 0.95) 0%, rgba(40, 30, 20, 0.9) 100%);
                    border: 2px solid #8b6914;
                    border-radius: 8px;
                    font-family: 'Montaga', Georgia, serif;
                    font-size: 16px;
                    color: #ffd700;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                    z-index: 100;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,0,0.1);
                `;
                document.body.appendChild(prompt);
            }

            // Show gamepad button if gamepad is active, otherwise keyboard key
            let interactKey: string;
            if (this.gamepadManager.getActiveInputType() === 'gamepad' && this.gamepadManager.isConnected()) {
                const controllerType = this.gamepadManager.getControllerType();
                interactKey = GamepadManager.getButtonDisplayName(GamepadButton.Y, controllerType);
            } else {
                interactKey = this.settings.getBindingDisplay('interact');
            }

            if (isSealed) {
                prompt.innerHTML = `<span style="color: #ff4444;">🔒 Porte scellée</span> - Éliminez tous les ennemis`;
                prompt.style.borderColor = '#8b0000';
            } else {
                prompt.innerHTML = `<span style="background: #2a2015; padding: 2px 8px; border-radius: 3px; margin-right: 8px;">${interactKey}</span> Traverser vers le niveau suivant`;
                prompt.style.borderColor = '#228b22';
            }
            prompt.style.display = 'block';
        } else if (prompt) {
            prompt.style.display = 'none';
        }
    }

    /**
     * Show a circular damage direction indicator centered on screen.
     * The side of the circle facing the enemy lights up in red.
     */
    private showDamageIndicator(enemyPosition: Vector3): void {
        if (!this.player?.rootMesh || !this.camera) return;

        const playerPos = this.player.rootMesh.position;
        const dx = enemyPosition.x - playerPos.x;
        const dz = enemyPosition.z - playerPos.z;
        const worldAngle = Math.atan2(dx, dz);

        const cameraAlpha = this.camera.alpha;
        const relativeAngle = worldAngle - (-cameraAlpha - Math.PI / 2);
        const angleRad = relativeAngle - Math.PI / 2;

        // Render at low resolution, display scaled up with pixelated rendering
        const pixelScale = 3;
        const displaySize = 200;
        const lowRes = Math.ceil(displaySize / pixelScale);
        const cx = lowRes / 2;
        const cy = lowRes / 2;
        const r = 80 / pixelScale;
        const strokeWidth = 10 / pixelScale;
        const arcSpread = (50 * Math.PI) / 180; // 50 degrees in radians

        const canvas = document.createElement('canvas');
        canvas.width = lowRes;
        canvas.height = lowRes;
        canvas.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            width: ${displaySize}px;
            height: ${displaySize}px;
            margin-left: -${displaySize / 2}px;
            margin-top: -${displaySize / 2}px;
            pointer-events: none;
            z-index: 150;
            image-rendering: pixelated;
        `;

        const ctx = canvas.getContext('2d')!;

        // Background circle (subtle)
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 30, 30, 0.08)';
        ctx.lineWidth = strokeWidth;
        ctx.stroke();

        // Glow arc (wider, transparent — drawn first behind the main arc)
        ctx.beginPath();
        ctx.arc(cx, cy, r, angleRad - arcSpread / 2, angleRad + arcSpread / 2);
        ctx.strokeStyle = 'rgba(255, 40, 40, 0.3)';
        ctx.lineWidth = strokeWidth * 3;
        ctx.stroke();

        // Main damage arc
        ctx.beginPath();
        ctx.arc(cx, cy, r, angleRad - arcSpread / 2, angleRad + arcSpread / 2);
        ctx.strokeStyle = 'rgba(255, 20, 20, 0.85)';
        ctx.lineWidth = strokeWidth;
        ctx.stroke();

        document.body.appendChild(canvas);

        // Animate fade out
        canvas.getBoundingClientRect();
        canvas.style.transition = 'opacity 1.2s ease-out';
        canvas.style.opacity = '0';

        setTimeout(() => {
            canvas.remove();
        }, 1300);
    }

    /**
     * Show a floating pickup notification above the HUD
     */
    private showPickupNotification(text: string, color: string): void {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 150px;
            left: 50%;
            transform: translateX(-50%) translateY(0px);
            font-family: 'Montaga', 'Georgia', serif;
            font-size: 20px;
            font-weight: bold;
            color: ${color};
            text-shadow: 0 0 12px ${color}, 0 0 24px ${color}, 0 2px 4px rgba(0,0,0,0.9);
            pointer-events: none;
            z-index: 200;
            white-space: nowrap;
            letter-spacing: 0.05em;
        `;
        notification.textContent = text;
        document.body.appendChild(notification);

        // Force layout reflow before starting transition
        notification.getBoundingClientRect();
        notification.style.transition = 'transform 1.5s ease-out, opacity 1.5s ease-out';
        notification.style.transform = 'translateX(-50%) translateY(-50px)';
        notification.style.opacity = '0';

        // Remove from DOM
        setTimeout(() => {
            notification.remove();
        }, 1600);
    }

    /**
     * Handle the use potion action
     */
    private usePotion(slotIndex?: number): void {
        if (!this.playerInventory || this.isPlayerDead) return;

        const potion = slotIndex !== undefined
            ? this.playerInventory.usePotionAtIndex(slotIndex)
            : this.playerInventory.usePotion();
        if (potion) {
            const healAmount = PlayerInventory.getPotionHealAmount(potion);
            this.playerHealth = Math.min(100, this.playerHealth + healAmount);
            this.updateHealthUI();
            this.audioManager.playPotionDrinkSound();
            this.statsService.recordPotionUsed();
            // Play healing visual effect
            this.healingEffect?.play();
            this.companion?.trigger('potion_used');
            this.companion?.checkHealthTriggers(this.playerHealth);
            // Check if out of potions after using
            if (this.playerInventory) {
                this.companion?.checkInventoryTriggers(
                    this.playerInventory.getPotionCount(),
                    this.playerInventory.getArrowCount()
                );
            }
            console.log(`[DungeonScene] Used ${potion} potion, healed ${healAmount}, health: ${this.playerHealth}`);
        }
    }

    /**
     * Setup interaction keyboard listener
     */
    private setupInteractionListener(): void {
        window.addEventListener('keydown', (e) => {
            // Check if interact key is pressed
            if (this.settings.isKeyBound('interact', e.code)) {
                // Don't interact if game is paused or player is dead
                if (this.isPaused || this.isPlayerDead || this.isLevelComplete) return;

                // Try to open exit door if nearby (highest priority)
                if (this.nearbyExitDoor && this.doorSystem) {
                    if (!this.exitDoorSealed) {
                        // Play kick animation then open exit door
                        if (this.player) {
                            this.player.playKick();
                        }
                        // Delay door opening slightly for animation sync
                        setTimeout(() => {
                            this.doorSystem?.tryOpenExitDoor();
                        }, 200);
                    }
                    // If sealed, do nothing (prompt already shows message)
                    return;
                }
                // Try to open regular door if nearby
                else if (this.nearbyDoor && this.doorSystem) {
                    // Play kick animation then open door
                    if (this.player) {
                        this.player.playKick();
                    }
                    // Delay door opening slightly for animation sync
                    setTimeout(() => {
                        this.doorSystem?.tryOpenDoor();
                        this.companion?.trigger('door_open');
                    }, 200);
                }
                // Try to open chest if nearby (priority over pickup)
                else if (this.nearbyChest && this.chestSystem) {
                    this.chestSystem.tryOpenChest();
                    this.statsService.recordChestOpened();
                    this.companion?.trigger('chest_open');
                } else if (this.chestSystem?.hasNearbyItem()) {
                    // Try to pick up item
                    this.chestSystem.tryPickupItem();
                }
            }

            // Number keys 1-4 to use potions (mapped to slot index 0-3)
            if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4') {
                if (this.isPaused || this.isPlayerDead || this.isLevelComplete) return;
                const slotIndex = parseInt(e.code.charAt(5), 10) - 1;
                this.usePotion(slotIndex);
            }
        });
    }

    /**
     * Setup gamepad button callbacks for global actions
     */
    private setupGamepadCallbacks(): void {
        this.gamepadManager.onButtonPress((button) => {
            if (!this.settings.gamepadEnabled) return;

            // Start button - Pause/Resume
            if (button === GamepadButton.Start) {
                if (this.isPlayerDead || this.isLevelComplete) return;

                // If settings or controls panel is open, close it
                const settingsPanel = document.getElementById('settings-panel');
                const controlsPanel = document.getElementById('controls-panel');
                if (settingsPanel?.classList.contains('visible')) {
                    settingsPanel.classList.remove('visible');
                    return;
                }
                if (controlsPanel?.classList.contains('visible')) {
                    controlsPanel.classList.remove('visible');
                    return;
                }

                this.togglePause();
                return;
            }

            // Pause menu navigation (only when paused)
            if (this.isPaused) {
                const pauseMenu = document.getElementById('pause-menu');
                if (pauseMenu?.classList.contains('visible')) {
                    this.handlePauseMenuGamepad(button);
                }
                return;
            }

            // In-game buttons (only when not paused)
            if (this.isPaused || this.isPlayerDead || this.isLevelComplete) return;

            switch (button) {
                // Y button - Interact
                case GamepadButton.Y:
                    this.handleGamepadInteract();
                    break;

                // D-pad - Potions 1-4
                case GamepadButton.DpadUp:
                case GamepadButton.DpadDown:
                case GamepadButton.DpadLeft:
                case GamepadButton.DpadRight:
                    this.usePotion();
                    break;
            }
        });

        // Apply gamepad settings from GameSettings
        this.gamepadManager.setDeadZone(this.settings.gamepadDeadZone);
        this.gamepadManager.setEnabled(this.settings.gamepadEnabled);

        // Update HUD controls display when input type changes
        this.gamepadManager.onInputTypeChange((inputType) => {
            this.updateHUDControls(inputType === 'gamepad');
        });

        // Initialize HUD with current input type
        this.updateHUDControls(this.gamepadManager.getActiveInputType() === 'gamepad' && this.gamepadManager.isConnected());
    }

    /**
     * Update the HUD controls display for keyboard or gamepad
     */
    private updateHUDControls(isGamepad: boolean): void {
        const instructions = document.getElementById('instructions');
        if (!instructions) return;

        // Define keyboard and gamepad mappings
        const keyboardControls: Record<string, string> = {
            'movement': 'ZQSD',
            'run': 'Shift',
            'look': 'Souris',
            'attack': 'Clic G',
            'block': 'Clic D',
            'crouch': 'Ctrl',
            'interact': 'F',
            'potions': '1-4',
            'pause': 'P'
        };

        // Detect controller type (PlayStation or Xbox)
        const controllerType = this.gamepadManager.getControllerType();
        const getBtn = (btn: GamepadButton) => GamepadManager.getButtonDisplayName(btn, controllerType);

        const gamepadControls: Record<string, string> = {
            'movement': '🕹️ G',
            'run': getBtn(GamepadButton.LB),
            'look': '🕹️ D',
            'attack': getBtn(GamepadButton.X),
            'block': getBtn(GamepadButton.B),
            'crouch': getBtn(GamepadButton.RS),
            'interact': getBtn(GamepadButton.Y),
            'potions': '↑↓←→',
            'pause': getBtn(GamepadButton.Start)
        };

        const controls = isGamepad ? gamepadControls : keyboardControls;

        // Update all control elements
        const rows = instructions.querySelectorAll('.row');
        rows.forEach(row => {
            const keySpan = row.querySelector('.key');
            const actionSpan = row.querySelector('.action');
            if (!keySpan || !actionSpan) return;

            const actionText = actionSpan.textContent?.toLowerCase() || '';

            // Match action to control type
            if (actionText.includes('déplacer')) {
                keySpan.textContent = controls['movement'];
            } else if (actionText.includes('courir')) {
                keySpan.textContent = controls['run'];
            } else if (actionText.includes('regarder')) {
                keySpan.textContent = controls['look'];
            } else if (actionText.includes('attaquer')) {
                keySpan.textContent = controls['attack'];
            } else if (actionText.includes('bloquer')) {
                keySpan.textContent = controls['block'];
            } else if (actionText.includes('accroupir')) {
                keySpan.textContent = controls['crouch'];
            } else if (actionText.includes('interagir')) {
                keySpan.textContent = controls['interact'];
            } else if (actionText.includes('potion')) {
                keySpan.textContent = controls['potions'];
            } else if (actionText.includes('pause')) {
                keySpan.textContent = controls['pause'];
            }
        });
    }

    /**
     * Handle gamepad input for pause menu navigation
     */
    private handlePauseMenuGamepad(button: GamepadButton): void {
        const buttons = Array.from(document.querySelectorAll('#pause-menu button'));
        if (buttons.length === 0) return;

        switch (button) {
            case GamepadButton.DpadUp:
                this.pauseMenuIndex = Math.max(0, this.pauseMenuIndex - 1);
                this.updatePauseMenuSelection(buttons);
                break;
            case GamepadButton.DpadDown:
                this.pauseMenuIndex = Math.min(buttons.length - 1, this.pauseMenuIndex + 1);
                this.updatePauseMenuSelection(buttons);
                break;
            case GamepadButton.A:
                // Activate selected button
                const selectedBtn = buttons[this.pauseMenuIndex] as HTMLButtonElement;
                if (selectedBtn) {
                    selectedBtn.click();
                }
                break;
            case GamepadButton.B:
                // Resume game
                this.resumeGame();
                break;
        }
    }

    /**
     * Update pause menu visual selection
     */
    private updatePauseMenuSelection(buttons: Element[]): void {
        buttons.forEach((btn, index) => {
            if (index === this.pauseMenuIndex) {
                btn.classList.add('gamepad-selected');
            } else {
                btn.classList.remove('gamepad-selected');
            }
        });
    }

    /**
     * Handle gamepad interact button
     */
    private handleGamepadInteract(): void {
        // Try to open exit door if nearby (highest priority)
        if (this.nearbyExitDoor && this.doorSystem) {
            if (!this.exitDoorSealed) {
                if (this.player) {
                    this.player.playKick();
                }
                setTimeout(() => {
                    this.doorSystem?.tryOpenExitDoor();
                }, 200);
            }
            // If sealed, do nothing (prompt already shows message)
            return;
        }
        // Try to open regular door if nearby
        else if (this.nearbyDoor && this.doorSystem) {
            if (this.player) {
                this.player.playKick();
            }
            setTimeout(() => {
                this.doorSystem?.tryOpenDoor();
                this.companion?.trigger('door_open');
            }, 200);
        }
        // Try to open chest if nearby
        else if (this.nearbyChest && this.chestSystem) {
            this.chestSystem.tryOpenChest();
            this.statsService.recordChestOpened();
            this.companion?.trigger('chest_open');
        } else if (this.chestSystem?.hasNearbyItem()) {
            this.chestSystem.tryPickupItem();
        }
    }

    /**
     * Apply gamepad camera look - called from render loop
     */
    private updateGamepadCamera(): void {
        if (!this.settings.gamepadEnabled || !this.gamepadManager.isConnected()) return;
        if (this.isPaused || this.isPlayerDead || this.isLevelComplete) return;

        const rightStick = this.gamepadManager.getRightStick();
        if (Math.abs(rightStick.x) > 0.01 || Math.abs(rightStick.y) > 0.01) {
            this.camera?.applyGamepadLook(rightStick.x, rightStick.y);
        }
    }
}
