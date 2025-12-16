import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { AxesViewer } from '@babylonjs/core/Debug/axesViewer';
import '@babylonjs/inspector';

import { AssetLoader } from '../core/AssetLoader';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera';
import { PlayerController } from '../core/PlayerController';
import { LevelLoader } from '../core/LevelLoader';
import { LevelData } from '../core/LevelData';
import { Enemy } from '../core/Enemy';
import { MeshPlacer } from '../utils/MeshPlacer';

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

    constructor(engine: Engine, canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.scene = new Scene(engine);
        this.assetLoader = new AssetLoader(this.scene);
        this.levelLoader = new LevelLoader(this.scene);

        this.setupScene();
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
        // Ambient - lumière hémisphérique pour éclairer globalement
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.6;
        ambient.diffuse = new Color3(0.7, 0.7, 0.85);
        ambient.groundColor = new Color3(0.3, 0.25, 0.2);

        // Directional - lumière directionnelle pour les ombres
        const dir = new DirectionalLight('dirLight', new Vector3(-1, -2, 1), this.scene);
        dir.intensity = 0.5;
        dir.diffuse = new Color3(1, 0.95, 0.8);
    }

    private addTorchLight(position: Vector3): PointLight {
        const light = new PointLight(`torch_${Date.now()}`, position, this.scene);
        light.diffuse = new Color3(1, 0.6, 0.2);
        light.intensity = 1.5;
        light.range = 15;
        return light;
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

        // Debug: log available meshes
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
        }
        this.player.setCamera(this.camera);

        // Setup player attack callback
        this.player.onAttackHit((position, range) => {
            this.handlePlayerAttack(position, range);
        });

        // Setup mouse events for attack/block
        this.setupMouseEvents();

        // Setup GUI with compass
        this.setupGUI();

        // Update camera in render loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.camera?.update();
        });

        // Show health bar
        this.updateHealthUI();

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
                health: enemySpawn.health,
                damage: enemySpawn.damage,
                scale: 1
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
                enemy.takeDamage(25); // Player deals 25 damage per hit
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

        const hasNextLevel = this.currentLevelIndex < LEVELS.length - 1;
        const nextLevelIndex = this.currentLevelIndex + 1;

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
                window.location.href = `${window.location.pathname}?level=${nextLevelIndex}`;
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
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                width: 250px;
                height: 8px;
                background: #1a0a0a;
                border: 2px solid #555;
                border-radius: 3px;
                overflow: visible;
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
                    width: 2px;
                    height: 10px;
                    background: #ffd700;
                    border-radius: 1px;
                    box-shadow: 0 0 6px #ffd700, 0 0 12px #ffaa00, 0 0 20px #ff8800;
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

    private handlePlayerDeath(): void {
        console.log('[DungeonScene] Player died!');

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

    private setupGUI(): void {
        // Axes au centre de la scène (X=rouge, Y=vert, Z=bleu)
        // X = Est/Ouest, Y = Haut/Bas, Z = Nord/Sud
        new AxesViewer(this.scene, 5);

        // Activer l'inspecteur Babylon.js
        this.scene.debugLayer.show({
            embedMode: true,
            overlay: true
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

    private buildLevel(placer: MeshPlacer): void {
        // ============================================
        // SOL - Grande grille de dalles (24x22 = 528 dalles)
        // ============================================
        // Zone étendue vers la gauche pour couvrir le mur ouest
        placer.placeGrid('floor_A', {
            startX: -24,
            startZ: -22,
            countX: 24,
            countZ: 22,
            spacingX: 2,
            spacingZ: 2,
            y: -1
        });

        // ============================================
        // MURS - Pièce principale fermée (3 couches de hauteur)
        // ============================================
        const wallMin = -22;
        const wallMax = 20;
        const wallSpacing = 2;
        const wallHeight = 2;
        const wallLayers = 3;

        // Fonction pour choisir un mur avec variation
        const getWallType = (layer: number, index: number): string => {
            // Couche du haut = upper_wall
            if (layer === 2) return 'upper_wall';
            // Ajouter des murs décorés de temps en temps (1 sur 6)
            if (layer === 0 && index % 6 === 3) return 'wall_with_decor_A';
            if (layer === 1 && index % 8 === 4) return 'wall_with_decor_B';
            // Alterner entre wall_A et wall_B
            return index % 3 === 0 ? 'wall_B' : 'wall_A';
        };

        for (let layer = 0; layer < wallLayers; layer++) {
            const y = layer * wallHeight;
            let index = 0;

            // Mur NORD (z = wallMax)
            for (let x = wallMin; x <= wallMax; x += wallSpacing) {
                placer.place(getWallType(layer, index++), { position: { x, y, z: wallMax } });
            }

            // Mur SUD (z = wallMin)
            for (let x = wallMin; x <= wallMax; x += wallSpacing) {
                placer.place(getWallType(layer, index++), { position: { x, y, z: wallMin }, rotation: Math.PI });
            }

            // Mur OUEST (x = wallMin)
            for (let z = wallMin; z <= wallMax; z += wallSpacing) {
                placer.place(getWallType(layer, index++), { position: { x: wallMin, y, z }, rotation: Math.PI / 2 });
            }

            // Mur EST (x = wallMax)
            for (let z = wallMin; z <= wallMax; z += wallSpacing) {
                placer.place(getWallType(layer, index++), { position: { x: wallMax, y, z }, rotation: -Math.PI / 2 });
            }

            // Coins (toujours wall_corner_A)
            placer.place('wall_corner_A', { position: { x: wallMin, y, z: wallMax }, rotation: 0 });
            placer.place('wall_corner_A', { position: { x: wallMax, y, z: wallMax }, rotation: -Math.PI / 2 });
            placer.place('wall_corner_A', { position: { x: wallMin, y, z: wallMin }, rotation: Math.PI / 2 });
            placer.place('wall_corner_A', { position: { x: wallMax, y, z: wallMin }, rotation: Math.PI });
        }

        // ============================================
        // PILIERS - Grille intérieure
        // ============================================
        for (let x = -12; x <= 12; x += 8) {
            for (let z = -12; z <= 12; z += 8) {
                if (x !== 0 || z !== 0) { // pas au centre
                    placer.place('pillar_big', { position: { x, y: 0, z } });
                }
            }
        }

        // ============================================
        // ÉCLAIRAGE - Torches sur les murs (2ème rangée, y=2)
        // ============================================
        const torchOffset = 0.3;
        const torchY = 3.5; // Sur la 2ème rangée de murs
        const lightY = 4.5;

        // Torches mur NORD (z = wallMax, face vers le sud/intérieur)
        for (let x = -16; x <= 16; x += 8) {
            placer.place('torch', { position: { x, y: torchY, z: wallMax - torchOffset }, rotation: Math.PI });
            this.addTorchLight(new Vector3(x, lightY, wallMax - 1));
        }

        // Torches mur SUD (z = wallMin, face vers le nord/intérieur)
        for (let x = -16; x <= 16; x += 8) {
            placer.place('torch', { position: { x, y: torchY, z: wallMin + torchOffset }, rotation: 0 });
            this.addTorchLight(new Vector3(x, lightY, wallMin + 1));
        }

        // Torches mur OUEST (x = wallMin, face vers l'est/intérieur)
        for (let z = -12; z <= 12; z += 8) {
            placer.place('torch', { position: { x: wallMin + 2.2, y: torchY, z }, rotation: Math.PI / 2 });
            this.addTorchLight(new Vector3(wallMin + 1, lightY, z));
        }

        // Torches mur EST (x = wallMax, face vers l'ouest/intérieur)
        for (let z = -12; z <= 12; z += 8) {
            placer.place('torch', { position: { x: wallMax + 1.7, y: torchY, z }, rotation: -Math.PI / 2 });
            this.addTorchLight(new Vector3(wallMax - 1, lightY, z));
        }

        // Braseros au centre
        placer.place('brazier_A', { position: { x: -4, y: 0, z: 0 } });
        placer.place('brazier_B', { position: { x: 4, y: 0, z: 0 } });
        this.addTorchLight(new Vector3(-4, 1.5, 0));
        this.addTorchLight(new Vector3(4, 1.5, 0));

        // ============================================
        // DÉCORATIONS
        // ============================================
        // Statue centrale au fond
        placer.place('statue_A', { position: { x: 0, y: 0, z: 16 } });

        // Fontaine décalée
        placer.place('fountain', { position: { x: 0, y: 0, z: 8 } });

        // Tombes
        placer.place('tomb_A', { position: { x: -10, y: 0, z: 14 } });
        placer.place('tomb_B', { position: { x: 10, y: 0, z: 14 } });

        // Cages suspendues
        placer.place('hanging_cage_A', { position: { x: -6, y: 3, z: 16 } });
        placer.place('hanging_cage_B', { position: { x: 6, y: 3, z: 16 } });

        // Gargouilles dans les coins
        placer.place('gargolyle_A', { position: { x: -18, y: 2.5, z: 18 } });
        placer.place('gargolyle_B', { position: { x: 18, y: 2.5, z: 18 }, rotation: Math.PI });

        // ============================================
        // ENTRÉE (au milieu)
        // ============================================
        placer.place('door_framebig_A', { position: { x: 0, y: 0, z: 0 } });
    }

    render(): void {
        this.scene.render();
    }
}
