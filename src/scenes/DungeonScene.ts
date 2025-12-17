import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';

// Side-effect imports for collisions
import '@babylonjs/core/Collisions/collisionCoordinator';
import '@babylonjs/core/Culling/ray';

import { AssetLoader } from '../core/AssetLoader';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera';
import { PlayerController } from '../core/PlayerController';
import { LevelLoader } from '../core/LevelLoader';
import { LevelData } from '../core/LevelData';
import { Enemy } from '../core/Enemy';
import { GameSettings, KeyBindings } from '../core/GameSettings';

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
    private player: PlayerController | null = null;
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

    constructor(engine: Engine, canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = engine;
        this.scene = new Scene(engine);
        this.assetLoader = new AssetLoader(this.scene);
        this.levelLoader = new LevelLoader(this.scene);
        this.settings = GameSettings.getInstance();

        this.setupScene();
        this.setupPauseMenu();
    }

    private setupScene(): void {
        this.scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);
        this.scene.ambientColor = new Color3(0.1, 0.1, 0.15);

        // Fog
        this.scene.fogMode = Scene.FOGMODE_EXP2;
        this.scene.fogDensity = 0.015;
        this.scene.fogColor = new Color3(0.05, 0.05, 0.08);

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
        // Set current level index (clamped to valid range)
        this.currentLevelIndex = Math.max(0, Math.min(levelIndex, LEVELS.length - 1));

        // Lighting
        this.setupLighting();

        // Load dungeon assets
        const assets = await this.assetLoader.loadGLB(
            'dungeon',
            `${import.meta.env.BASE_URL}assets/Dungeon_set/`,
            'Dungeon_set.glb'
        );

        console.log('[DungeonScene] Available meshes:', Array.from(assets.meshes.keys()));

        // Determine level to load
        const levelPath = `${import.meta.env.BASE_URL}levels/${LEVELS[this.currentLevelIndex]}`;
        console.log(`[DungeonScene] Loading level ${this.currentLevelIndex + 1}/${LEVELS.length}: ${LEVELS[this.currentLevelIndex]}`);

        // Load and build level
        this.currentLevel = await this.levelLoader.loadFromUrl(levelPath);
        this.levelLoader.buildLevel(this.currentLevel, assets);

        // Get player spawn from level data
        const spawn = this.levelLoader.getPlayerSpawn(this.currentLevel);

        // Load player
        this.player = new PlayerController(this.scene, {
            position: spawn.position,
            scale: 1,
            walkSpeed: 0.08,
            runSpeed: 0.15,
            meshYOffset: 0
        });

        const playerBasePath = `${import.meta.env.BASE_URL}assets/Sword and Shield Pack/`;
        await this.player.load(playerBasePath);

        // Load enemies
        await this.loadEnemies();

        // Setup camera to follow player with bounds from level data
        this.camera = new ThirdPersonCamera(this.scene, this.canvas, {
            distance: 5,
            heightOffset: 1.5,
            bounds: this.currentLevel.cameraBounds
        });

        if (this.player.rootMesh) {
            this.camera.setTarget(this.player.rootMesh);
            // Setup dynamic light culling based on player position
            this.levelLoader.setPlayerTarget(this.player.rootMesh);
        }
        this.player.setCamera(this.camera);

        // Setup player attack callback
        this.player.onAttackHit((position, range) => {
            this.handlePlayerAttack(position, range);
        });

        // Setup mouse events for attack/block
        this.setupMouseEvents();

        // Update camera in render loop (only when not paused)
        this.scene.onBeforeRenderObservable.add(() => {
            if (!this.scene.metadata?.isPaused) {
                this.camera?.update();
            }
        });

        // Show health bar
        this.updateHealthUI();

        // Update controls display with current keybindings
        this.updateControlsDisplay();

        // Hide loading
        document.getElementById('loading')?.classList.add('hidden');
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

            // Handle enemy death
            enemy.onDeath(() => {
                this.checkLevelComplete();
            });

            // Handle player getting hit
            enemy.onPlayerHit((damage) => {
                // Don't process damage if player is already dead
                if (this.isPlayerDead) return;

                // Check if player is blocking
                if (this.player?.isCurrentlyBlocking) {
                    console.log(`[DungeonScene] Player blocked ${damage} damage!`);
                    return;
                }

                this.playerHealth -= damage;
                console.log(`[DungeonScene] Player took ${damage} damage, health: ${this.playerHealth}`);
                this.updateHealthUI();

                if (this.playerHealth <= 0) {
                    this.handlePlayerDeath();
                }
            });

            this.enemies.push(enemy);
        }

        console.log(`[DungeonScene] Loaded ${this.enemies.length} enemies`);
    }

    private handlePlayerAttack(position: Vector3, range: number): void {
        for (const enemy of this.enemies) {
            if (enemy.isDead) continue;

            const distance = Vector3.Distance(position, enemy.position);
            if (distance <= range) {
                enemy.takeDamage(25);
            }
        }
    }

    private checkLevelComplete(): void {
        const allDead = this.enemies.every(e => e.isDead);
        if (allDead && !this.isLevelComplete) {
            this.isLevelComplete = true;
            this.showVictoryMessage();
        }
    }

    private showVictoryMessage(): void {
        console.log('[DungeonScene] Level Complete!');

        // Release pointer lock so user can click buttons
        document.exitPointerLock();

        const hasNextLevel = this.currentLevelIndex < LEVELS.length - 1;
        // Convert to 1-indexed for user-friendly URLs
        const nextLevelNumber = this.currentLevelIndex + 2;

        const overlay = document.createElement('div');
        overlay.id = 'victory-overlay';
        overlay.innerHTML = `
            <div class="victory-particles"></div>
            <div class="victory-content">
                <h1>VICTOIRE</h1>
                <div class="victory-divider"></div>
                <p class="level-name">${this.currentLevel?.name || 'Unknown'}</p>
                <p class="sub">Tous les ennemis ont été vaincus</p>
                ${hasNextLevel ? `
                    <button id="next-level-btn">Niveau Suivant</button>
                ` : `
                    <p class="complete">Félicitations ! Vous avez terminé le jeu !</p>
                    <button id="restart-btn">Rejouer</button>
                `}
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
            .victory-content .complete {
                font-size: 1.3rem;
                color: #ffd700;
                margin-top: 1.5rem;
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
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);

        // Add event listeners
        if (hasNextLevel) {
            document.getElementById('next-level-btn')?.addEventListener('click', () => {
                window.location.href = `${window.location.pathname}?level=${nextLevelNumber}`;
            });
        } else {
            document.getElementById('restart-btn')?.addEventListener('click', () => {
                window.location.href = window.location.pathname;
            });
        }
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
    }

    private async handlePlayerDeath(): Promise<void> {
        if (this.isPlayerDead) return;
        this.isPlayerDead = true;

        console.log('[DungeonScene] Player died!');

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
        this.canvas.addEventListener('mousedown', (e) => {
            this.player?.onMouseDown(e.button);
        });

        this.canvas.addEventListener('mouseup', (e) => {
            this.player?.onMouseUp(e.button);
        });

        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    get levelData(): LevelData | null {
        return this.currentLevel;
    }

    private setupPauseMenu(): void {
        // P key to toggle pause (configurable)
        window.addEventListener('keydown', (e) => {
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

        // Store which animations were playing (with their loop state) and pause them
        this.pausedAnimations.clear();
        for (const animGroup of this.scene.animationGroups) {
            if (animGroup.isPlaying) {
                this.pausedAnimations.set(animGroup, animGroup.loopAnimation);
                animGroup.pause();
            }
        }

        document.getElementById('pause-menu')?.classList.add('visible');
        document.exitPointerLock();
    }

    private resumeGame(): void {
        this.isPaused = false;
        if (this.scene.metadata) {
            this.scene.metadata.isPaused = false;
        }

        // Resume only the animations that were playing before pause
        for (const [animGroup, wasLooping] of this.pausedAnimations) {
            animGroup.play(wasLooping);
        }
        this.pausedAnimations.clear();

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

    render(): void {
        // Update FPS counter
        this.updateFpsCounter();

        // Don't update game logic if paused, but still render
        if (!this.isPaused) {
            this.scene.render();
        } else {
            // Still render but without animation updates
            this.scene.render();
        }
    }
}
