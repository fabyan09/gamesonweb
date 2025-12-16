import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { MeshPlacer } from '../utils/MeshPlacer';
import { LoadedAssets } from './AssetLoader';
import { LevelData, WallSegment, GridPlacement, PropPlacement, LightData } from './LevelData';

export class LevelLoader {
    private scene: Scene;
    private placer: MeshPlacer | null = null;
    private lights: PointLight[] = [];

    constructor(scene: Scene) {
        this.scene = scene;
    }

    async loadFromUrl(url: string): Promise<LevelData> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load level: ${response.statusText}`);
        }
        return response.json();
    }

    buildLevel(levelData: LevelData, assets: LoadedAssets): void {
        this.placer = new MeshPlacer(assets);

        console.log(`[LevelLoader] Building level: ${levelData.name}`);

        // Build floors
        for (const floor of levelData.floors) {
            this.buildFloor(floor);
        }

        // Build walls
        for (const wall of levelData.walls) {
            this.buildWalls(wall);
        }

        // Place props
        for (const prop of levelData.props) {
            this.placeProp(prop);
        }

        // Create lights
        for (const light of levelData.lights) {
            this.createLight(light);
        }

        // Apply scene settings
        if (levelData.scene) {
            this.applySceneSettings(levelData.scene);
        }

        console.log(`[LevelLoader] Level built successfully`);
    }

    private buildFloor(floor: GridPlacement): void {
        if (!this.placer) return;

        this.placer.placeGrid(floor.mesh, {
            startX: floor.start.x,
            startZ: floor.start.z,
            countX: floor.countX,
            countZ: floor.countZ,
            spacingX: floor.spacing,
            spacingZ: floor.spacing,
            y: floor.start.y
        });
    }

    private buildWalls(wall: WallSegment): void {
        if (!this.placer) return;

        const { minX, maxX, minZ, maxZ } = wall.bounds;
        const spacing = wall.spacing;

        // North wall (z = maxZ)
        for (let x = minX; x <= maxX; x += spacing) {
            this.placer.place(wall.mesh, {
                position: { x, y: wall.y, z: maxZ }
            });
        }

        // South wall (z = minZ)
        for (let x = minX; x <= maxX; x += spacing) {
            this.placer.place(wall.mesh, {
                position: { x, y: wall.y, z: minZ },
                rotation: Math.PI
            });
        }

        // West wall (x = minX)
        for (let z = minZ + spacing; z < maxZ; z += spacing) {
            this.placer.place(wall.mesh, {
                position: { x: minX, y: wall.y, z },
                rotation: Math.PI / 2
            });
        }

        // East wall (x = maxX)
        for (let z = minZ + spacing; z < maxZ; z += spacing) {
            this.placer.place(wall.mesh, {
                position: { x: maxX, y: wall.y, z },
                rotation: -Math.PI / 2
            });
        }

        // Corners
        if (wall.cornerMesh) {
            this.placer.place(wall.cornerMesh, {
                position: { x: minX, y: wall.y, z: maxZ },
                rotation: 0
            });
            this.placer.place(wall.cornerMesh, {
                position: { x: maxX, y: wall.y, z: maxZ },
                rotation: -Math.PI / 2
            });
            this.placer.place(wall.cornerMesh, {
                position: { x: minX, y: wall.y, z: minZ },
                rotation: Math.PI / 2
            });
            this.placer.place(wall.cornerMesh, {
                position: { x: maxX, y: wall.y, z: minZ },
                rotation: Math.PI
            });
        }
    }

    private placeProp(prop: PropPlacement): void {
        if (!this.placer) return;

        this.placer.place(prop.mesh, {
            position: prop.position,
            rotation: prop.rotation ? (prop.rotation * Math.PI / 180) : undefined,
            scale: prop.scale
        });
    }

    private createLight(light: LightData): void {
        const pointLight = new PointLight(
            `light_${this.lights.length}`,
            new Vector3(light.position.x, light.position.y, light.position.z),
            this.scene
        );

        if (light.color) {
            pointLight.diffuse = new Color3(light.color.x, light.color.y, light.color.z);
        } else {
            // Default torch color
            pointLight.diffuse = new Color3(1, 0.6, 0.2);
        }

        pointLight.intensity = light.intensity ?? 0.8;
        pointLight.range = light.range ?? 8;

        this.lights.push(pointLight);
    }

    private applySceneSettings(settings: LevelData['scene']): void {
        if (!settings) return;

        if (settings.fogDensity !== undefined) {
            this.scene.fogDensity = settings.fogDensity;
        }

        if (settings.fogColor) {
            this.scene.fogColor = new Color3(
                settings.fogColor.x,
                settings.fogColor.y,
                settings.fogColor.z
            );
        }

        if (settings.ambientColor) {
            this.scene.ambientColor = new Color3(
                settings.ambientColor.x,
                settings.ambientColor.y,
                settings.ambientColor.z
            );
        }
    }

    getPlayerSpawn(levelData: LevelData): { position: Vector3; rotation: number } {
        return {
            position: new Vector3(
                levelData.playerSpawn.position.x,
                levelData.playerSpawn.position.y,
                levelData.playerSpawn.position.z
            ),
            rotation: levelData.playerSpawn.rotation ?? 0
        };
    }

    dispose(): void {
        this.lights.forEach(light => light.dispose());
        this.lights = [];
    }
}
