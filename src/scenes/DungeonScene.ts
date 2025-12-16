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
        this.scene.fogDensity = 0.015;
        this.scene.fogColor = new Color3(0.05, 0.05, 0.08);

        // Augmenter la limite de lumières simultanées (par défaut 4)
        this.scene.onNewMeshAddedObservable.add((mesh) => {
            if (mesh.material) {
                (mesh.material as any).maxSimultaneousLights = 16;
            }
        });
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
        light.intensity = 1.5;
        light.range = 15;
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

        // Debug: log available meshes
        console.log('[DungeonScene] Available meshes:', Array.from(assets.meshes.keys()));

        // Build level
        const placer = new MeshPlacer(assets);
        this.buildLevel(placer);

        // Load player
        // Note: meshYOffset compense le pivot du modèle pour aligner les pieds au sol
        // Une valeur positive remonte le mesh par rapport au rootNode
        this.player = new PlayerController(this.scene, {
            position: new Vector3(0, 0, -6), // Près de l'entrée sud
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

        // Setup GUI with compass
        this.setupGUI();

        // Update camera in render loop
        this.scene.onBeforeRenderObservable.add(() => {
            this.camera?.update();
        });

        // Hide loading
        document.getElementById('loading')?.classList.add('hidden');
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

        // Types de murs par couche
        const wallTypes = ['wall_A', 'wall_B', 'upper_wall'];
        const cornerTypes = ['wall_corner_A', 'wall_corner_B', 'wall_corner_A'];

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
