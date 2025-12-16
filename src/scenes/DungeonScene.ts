import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { PointLight } from '@babylonjs/core/Lights/pointLight';

import { AssetLoader } from '../core/AssetLoader';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera';
import { PlayerController } from '../core/PlayerController';
import { MeshPlacer } from '../utils/MeshPlacer';

export class DungeonScene {
    private canvas: HTMLCanvasElement;
    private scene: Scene;
    private assetLoader: AssetLoader;
    private camera: ThirdPersonCamera | null = null;
    private player: PlayerController | null = null;

    constructor(engine: Engine, canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.scene = new Scene(engine);
        this.assetLoader = new AssetLoader(this.scene);

        this.setupScene();
    }

    private setupScene(): void {
        this.scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);
        this.scene.ambientColor = new Color3(0.1, 0.1, 0.15);

        // Fog
        this.scene.fogMode = Scene.FOGMODE_EXP2;
        this.scene.fogDensity = 0.025;
        this.scene.fogColor = new Color3(0.05, 0.05, 0.08);
    }

    private setupLighting(): void {
        // Ambient
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.3;
        ambient.diffuse = new Color3(0.6, 0.6, 0.8);
        ambient.groundColor = new Color3(0.2, 0.15, 0.1);

        // Directional
        const dir = new DirectionalLight('dirLight', new Vector3(-1, -2, 1), this.scene);
        dir.intensity = 0.4;
    }

    private addTorchLight(position: Vector3): PointLight {
        const light = new PointLight(`torch_${Date.now()}`, position, this.scene);
        light.diffuse = new Color3(1, 0.6, 0.2);
        light.intensity = 0.8;
        light.range = 8;
        return light;
    }

    async init(): Promise<void> {
        // Lighting
        this.setupLighting();

        // Load dungeon assets
        const assets = await this.assetLoader.loadGLB(
            'dungeon',
            `${import.meta.env.BASE_URL}assets/Dungeon_set/`,
            'Dungeon_set.glb'
        );

        // Build level
        const placer = new MeshPlacer(assets);
        this.buildLevel(placer);

        // Load player
        // Note: meshYOffset compense le pivot du modèle pour aligner les pieds au sol
        // Une valeur positive remonte le mesh par rapport au rootNode
        this.player = new PlayerController(this.scene, {
            position: new Vector3(0, 0.1, -2), // Y légèrement au-dessus pour compenser l'épaisseur du sol
            scale: 1,
            walkSpeed: 0.08,
            runSpeed: 0.15,
            meshYOffset: 0
        });

        const playerBasePath = `${import.meta.env.BASE_URL}assets/Sword and Shield Pack/`;
        await this.player.load(playerBasePath);

        // Setup camera to follow player
        this.camera = new ThirdPersonCamera(this.scene, this.canvas, {
            distance: 5,
            heightOffset: 1.5
        });

        if (this.player.rootMesh) {
            this.camera.setTarget(this.player.rootMesh);
        }
        this.player.setCamera(this.camera);

        // Setup mouse events for attack/block
        this.setupMouseEvents();

        // Update camera in render loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.camera?.update();
        });

        // Hide loading
        document.getElementById('loading')?.classList.add('hidden');
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
        // Floor grid
        placer.placeGrid('floor_A', {
            startX: -4,
            startZ: -4,
            countX: 3,
            countZ: 3,
            spacingX: 4,
            spacingZ: 4
        });

        // Back wall
        placer.placeMultiple('wall_A', [
            { position: { x: -4, y: 0, z: 6 } },
            { position: { x: 0, y: 0, z: 6 } },
            { position: { x: 4, y: 0, z: 6 } }
        ]);

        // Side walls
        const leftWallRotation = Math.PI / 2;
        const rightWallRotation = -Math.PI / 2;

        placer.placeMultiple('wall_A', [
            { position: { x: -6, y: 0, z: 4 }, rotation: leftWallRotation },
            { position: { x: -6, y: 0, z: 0 }, rotation: leftWallRotation },
            { position: { x: -6, y: 0, z: -4 }, rotation: leftWallRotation },
            { position: { x: 6, y: 0, z: 4 }, rotation: rightWallRotation },
            { position: { x: 6, y: 0, z: 0 }, rotation: rightWallRotation },
            { position: { x: 6, y: 0, z: -4 }, rotation: rightWallRotation }
        ]);

        // Pillars
        placer.place('pillar_big', { position: { x: -3, y: 0, z: 3 } });
        placer.place('pillar_big', { position: { x: 3, y: 0, z: 3 } });
        placer.place('pillar_thin_A', { position: { x: -3, y: 0, z: -3 } });
        placer.place('pillar_thin_A', { position: { x: 3, y: 0, z: -3 } });

        // Torches + lights
        placer.place('torch', { position: { x: -5.5, y: 1.5, z: 0 } });
        placer.place('torch', { position: { x: 5.5, y: 1.5, z: 0 }, rotation: Math.PI });
        this.addTorchLight(new Vector3(-5, 2.2, 0));
        this.addTorchLight(new Vector3(5, 2.2, 0));

        // Central statue
        placer.place('statue_A', { position: { x: 0, y: 0, z: 4 } });

        // Braziers
        placer.place('brazier_A', { position: { x: -2, y: 0, z: 0 } });
        placer.place('brazier_B', { position: { x: 2, y: 0, z: 0 } });

        // Fountain
        placer.place('fountain', { position: { x: 0, y: 0, z: -2 } });

        // Tombs
        placer.place('tomb_A', { position: { x: -4, y: 0, z: -2 } });
        placer.place('tomb_B', { position: { x: 4, y: 0, z: -2 } });

        // Hanging cage
        placer.place('hanging_cage_A', { position: { x: -2, y: 2.5, z: 4 } });

        // Door
        placer.place('door_framebig_A', { position: { x: 0, y: 0, z: 6 } });
        placer.place('door_bigleft', { position: { x: -0.8, y: 0, z: 6 } });
        placer.place('door_bigright', { position: { x: 0.8, y: 0, z: 6 } });

        // Lever
        placer.place('lever_base', { position: { x: 4.5, y: 0, z: 4 } });
        placer.place('lever', { position: { x: 4.5, y: 0.5, z: 4 } });

        // Gargoyles
        placer.place('gargolyle_A', { position: { x: -5.5, y: 2.5, z: 4 } });
        placer.place('gargolyle_B', { position: { x: 5.5, y: 2.5, z: 4 }, rotation: Math.PI });
    }

    render(): void {
        this.scene.render();
    }
}
