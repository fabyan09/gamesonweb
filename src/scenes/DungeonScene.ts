import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';

import { AssetLoader } from '../core/AssetLoader';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera';
import { PlayerController } from '../core/PlayerController';
import { LevelLoader } from '../core/LevelLoader';
import { LevelData } from '../core/LevelData';
import { Enemy } from '../core/Enemy';

export class DungeonScene {
    private canvas: HTMLCanvasElement;
    private scene: Scene;
    private assetLoader: AssetLoader;
    private levelLoader: LevelLoader;
    private camera: ThirdPersonCamera | null = null;
    private player: PlayerController | null = null;
    private currentLevel: LevelData | null = null;
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

    async init(levelUrl?: string): Promise<void> {
        // Lighting
        this.setupLighting();

        // Load dungeon assets
        const assets = await this.assetLoader.loadGLB(
            'dungeon',
            `${import.meta.env.BASE_URL}assets/Dungeon_set/`,
            'Dungeon_set.glb'
        );

        console.log('[DungeonScene] Available meshes:', Array.from(assets.meshes.keys()));

        // Load and build level from JSON
        const levelPath = levelUrl ?? `${import.meta.env.BASE_URL}levels/level1.json`;
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

        // Setup camera to follow player
        this.camera = new ThirdPersonCamera(this.scene, this.canvas, {
            distance: 5,
            heightOffset: 1.5
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

        const overlay = document.createElement('div');
        overlay.id = 'victory-overlay';
        overlay.innerHTML = `
            <div class="victory-content">
                <h1>VICTOIRE!</h1>
                <p>Niveau ${this.currentLevel?.name || '1'} termine!</p>
                <p class="sub">Tous les ennemis ont ete vaincus</p>
            </div>
        `;
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            animation: fadeIn 0.5s ease-out;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .victory-content {
                text-align: center;
                color: #ffd700;
                font-family: 'Georgia', serif;
            }
            .victory-content h1 {
                font-size: 4rem;
                margin-bottom: 1rem;
                text-shadow: 0 0 20px #ffd700, 0 0 40px #ff8c00;
            }
            .victory-content p {
                font-size: 1.5rem;
                color: #fff;
                margin: 0.5rem 0;
            }
            .victory-content .sub {
                font-size: 1rem;
                color: #aaa;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
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
                left: 20px;
                width: 200px;
                height: 20px;
                background: #333;
                border: 2px solid #666;
                border-radius: 10px;
                overflow: hidden;
            `;

            const style = document.createElement('style');
            style.textContent = `
                #health-bar .health-fill {
                    height: 100%;
                    background: linear-gradient(to right, #ff0000, #ff4444);
                    transition: width 0.3s ease;
                }
                #health-bar .health-text {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    color: white;
                    font-size: 12px;
                    font-weight: bold;
                    text-shadow: 1px 1px 2px black;
                }
            `;
            document.head.appendChild(style);
            document.body.appendChild(healthBar);
        }

        const fill = healthBar.querySelector('.health-fill') as HTMLElement;
        const text = healthBar.querySelector('.health-text') as HTMLElement;
        const percent = Math.max(0, this.playerHealth);
        fill.style.width = `${percent}%`;
        text.textContent = `${percent}/100`;
    }

    private handlePlayerDeath(): void {
        console.log('[DungeonScene] Player died!');

        const overlay = document.createElement('div');
        overlay.id = 'death-overlay';
        overlay.innerHTML = `
            <div class="death-content">
                <h1>MORT</h1>
                <p>Vous avez ete vaincu...</p>
                <button onclick="location.reload()">Reessayer</button>
            </div>
        `;
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(80, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        const style = document.createElement('style');
        style.textContent = `
            .death-content {
                text-align: center;
                color: #ff4444;
                font-family: 'Georgia', serif;
            }
            .death-content h1 {
                font-size: 4rem;
                margin-bottom: 1rem;
            }
            .death-content p {
                font-size: 1.5rem;
                color: #fff;
                margin-bottom: 2rem;
            }
            .death-content button {
                padding: 1rem 2rem;
                font-size: 1.2rem;
                background: #8b0000;
                color: white;
                border: 2px solid #ff4444;
                border-radius: 5px;
                cursor: pointer;
            }
            .death-content button:hover {
                background: #a00000;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(overlay);
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

    render(): void {
        this.scene.render();
    }
}
