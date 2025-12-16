import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Engine } from '@babylonjs/core/Engines/engine';
import { MeshPlacer } from '../utils/MeshPlacer';
import { LoadedAssets } from './AssetLoader';
import { LevelData, WallSegment, GridPlacement, PropPlacement, LightData } from './LevelData';

// Padding added to colliders to prevent clipping
const COLLIDER_PADDING = 0.1;

// How often to update light culling (in frames)
const CULLING_UPDATE_INTERVAL = 15;
// Reserved uniform blocks for other stuff (camera, materials, etc.)
const RESERVED_UNIFORM_BLOCKS = 4;

interface LightDefinition {
    position: Vector3;
    color: Color3;
    intensity: number;
    range: number;
}

export class LevelLoader {
    private scene: Scene;
    private placer: MeshPlacer | null = null;
    private colliders: Mesh[] = [];
    private lightDefinitions: LightDefinition[] = [];
    private activeLights: PointLight[] = [];
    private playerTarget: TransformNode | null = null;
    private frameCounter = 0;
    private maxActiveLights: number = 8;
    private useCulling: boolean = true;

    constructor(scene: Scene) {
        this.scene = scene;
        this.detectGPUCapabilities();
    }

    private detectGPUCapabilities(): void {
        try {
            const engine = this.scene.getEngine() as Engine;
            const gl = engine._gl as WebGLRenderingContext | WebGL2RenderingContext;

            if (gl) {
                // Get max uniform blocks (WebGL 2) or estimate for WebGL 1
                let maxUniformBlocks = 12; // Default conservative value

                if (gl.getParameter) {
                    // Try WebGL 2 parameters (using numeric constants for compatibility)
                    // MAX_VERTEX_UNIFORM_BLOCKS = 0x8A2B, MAX_FRAGMENT_UNIFORM_BLOCKS = 0x8A2D
                    const maxVertexUniformBlocks = gl.getParameter(0x8A2B);
                    const maxFragmentUniformBlocks = gl.getParameter(0x8A2D);

                    if (maxVertexUniformBlocks && maxFragmentUniformBlocks) {
                        maxUniformBlocks = Math.min(maxVertexUniformBlocks, maxFragmentUniformBlocks);
                    }
                }

                // Calculate max lights (leave room for other uniforms)
                this.maxActiveLights = Math.max(4, maxUniformBlocks - RESERVED_UNIFORM_BLOCKS);

                // Get GPU info for logging
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                const renderer = debugInfo
                    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
                    : 'Unknown GPU';

                console.log(`[LevelLoader] GPU: ${renderer}`);
                console.log(`[LevelLoader] Max uniform blocks: ${maxUniformBlocks}, Max active lights: ${this.maxActiveLights}`);
            }
        } catch (e) {
            console.warn('[LevelLoader] Could not detect GPU capabilities, using defaults');
            this.maxActiveLights = 8;
        }
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

        // Store light definitions
        this.storeLightDefinitions(levelData.lights);

        // Decide if we need culling based on light count vs GPU capability
        const totalLights = this.lightDefinitions.length;
        this.useCulling = totalLights > this.maxActiveLights;

        if (this.useCulling) {
            console.log(`[LevelLoader] Using dynamic culling: ${totalLights} lights, max ${this.maxActiveLights} active`);
            this.setupLightCulling();
        } else {
            console.log(`[LevelLoader] GPU can handle all ${totalLights} lights - no culling needed!`);
            this.createAllLightsStatic();
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

        // North wall (z = maxZ) - visual only
        for (let x = minX; x <= maxX; x += spacing) {
            this.placer.place(wall.mesh, {
                position: { x, y: wall.y, z: maxZ }
            });
        }

        // South wall (z = minZ) - visual only
        for (let x = minX; x <= maxX; x += spacing) {
            this.placer.place(wall.mesh, {
                position: { x, y: wall.y, z: minZ },
                rotation: Math.PI
            });
        }

        // West wall (x = minX) - visual only
        for (let z = minZ + spacing; z < maxZ; z += spacing) {
            this.placer.place(wall.mesh, {
                position: { x: minX, y: wall.y, z },
                rotation: Math.PI / 2
            });
        }

        // East wall (x = maxX) - visual only
        for (let z = minZ + spacing; z < maxZ; z += spacing) {
            this.placer.place(wall.mesh, {
                position: { x: maxX, y: wall.y, z },
                rotation: -Math.PI / 2
            });
        }

        // Corners - visual only
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

        // Create invisible collision walls (only for the bottom layer y=0)
        if (wall.y === 0) {
            this.createWallColliders(wall.bounds);
        }
    }

    private createWallColliders(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): void {
        const { minX, maxX, minZ, maxZ } = bounds;
        const wallHeight = 6; // Height of collision wall
        const wallThickness = 1;

        // North wall collider
        const northWall = MeshBuilder.CreateBox('collider_north', {
            width: maxX - minX + wallThickness,
            height: wallHeight,
            depth: wallThickness
        }, this.scene);
        northWall.position = new Vector3((minX + maxX) / 2, wallHeight / 2, maxZ + wallThickness / 2);
        northWall.isVisible = false;
        northWall.checkCollisions = true;
        this.colliders.push(northWall);

        // South wall collider
        const southWall = MeshBuilder.CreateBox('collider_south', {
            width: maxX - minX + wallThickness,
            height: wallHeight,
            depth: wallThickness
        }, this.scene);
        southWall.position = new Vector3((minX + maxX) / 2, wallHeight / 2, minZ - wallThickness / 2);
        southWall.isVisible = false;
        southWall.checkCollisions = true;
        this.colliders.push(southWall);

        // West wall collider
        const westWall = MeshBuilder.CreateBox('collider_west', {
            width: wallThickness,
            height: wallHeight,
            depth: maxZ - minZ + wallThickness
        }, this.scene);
        westWall.position = new Vector3(minX - wallThickness / 2, wallHeight / 2, (minZ + maxZ) / 2);
        westWall.isVisible = false;
        westWall.checkCollisions = true;
        this.colliders.push(westWall);

        // East wall collider
        const eastWall = MeshBuilder.CreateBox('collider_east', {
            width: wallThickness,
            height: wallHeight,
            depth: maxZ - minZ + wallThickness
        }, this.scene);
        eastWall.position = new Vector3(maxX + wallThickness / 2, wallHeight / 2, (minZ + maxZ) / 2);
        eastWall.isVisible = false;
        eastWall.checkCollisions = true;
        this.colliders.push(eastWall);

        console.log('[LevelLoader] Created wall colliders');
    }

    private placeProp(prop: PropPlacement): void {
        if (!this.placer) return;

        // Place visual mesh (no collision on visual meshes)
        const placedMesh = this.placer.place(prop.mesh, {
            position: prop.position,
            rotation: prop.rotation ? (prop.rotation * Math.PI / 180) : undefined,
            scale: prop.scale
        });

        // Create invisible collision box based on mesh bounding box if collision is enabled
        if (prop.collision && placedMesh) {
            this.createColliderFromMesh(placedMesh, prop);
        }
    }

    private createColliderFromMesh(mesh: AbstractMesh, prop: PropPlacement): void {
        // Special case for door frames - create two side pillars instead of one box
        if (prop.mesh.includes('door_frame')) {
            this.createDoorFrameColliders(mesh, prop);
            return;
        }

        // Calculate combined bounding box from mesh and all its children
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        const processMesh = (m: AbstractMesh) => {
            // Force compute world matrix
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;

            // Use world coordinates
            minX = Math.min(minX, bb.minimumWorld.x);
            minY = Math.min(minY, bb.minimumWorld.y);
            minZ = Math.min(minZ, bb.minimumWorld.z);
            maxX = Math.max(maxX, bb.maximumWorld.x);
            maxY = Math.max(maxY, bb.maximumWorld.y);
            maxZ = Math.max(maxZ, bb.maximumWorld.z);
        };

        // Process main mesh if it has geometry
        if (mesh.getTotalVertices() > 0) {
            processMesh(mesh);
        }

        // Process all child meshes
        const children = mesh.getChildMeshes(false);
        for (const child of children) {
            if (child.getTotalVertices() > 0) {
                processMesh(child);
            }
        }

        // Check if we found valid bounds
        if (minX === Infinity) {
            console.warn(`[LevelLoader] No valid geometry found for ${prop.mesh}`);
            return;
        }

        // Calculate dimensions with padding
        const width = (maxX - minX) + COLLIDER_PADDING * 2;
        const height = (maxY - minY) + COLLIDER_PADDING * 2;
        const depth = (maxZ - minZ) + COLLIDER_PADDING * 2;

        // Calculate center position
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // Create collider box matching the combined mesh dimensions
        const collider = MeshBuilder.CreateBox(`collider_${prop.mesh}_${this.colliders.length}`, {
            width,
            height,
            depth
        }, this.scene);

        // Position at the combined bounding box center (already in world space)
        collider.position = new Vector3(centerX, centerY, centerZ);

        collider.isVisible = false;
        collider.checkCollisions = true;
        this.colliders.push(collider);

        console.log(`[LevelLoader] Created collider for ${prop.mesh}: ${width.toFixed(2)} x ${height.toFixed(2)} x ${depth.toFixed(2)} at (${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${centerZ.toFixed(1)})`);
    }

    private createDoorFrameColliders(mesh: AbstractMesh, prop: PropPlacement): void {
        // Calculate combined bounding box to get door dimensions
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        const processMesh = (m: AbstractMesh) => {
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bb.minimumWorld.x);
            minY = Math.min(minY, bb.minimumWorld.y);
            minZ = Math.min(minZ, bb.minimumWorld.z);
            maxX = Math.max(maxX, bb.maximumWorld.x);
            maxY = Math.max(maxY, bb.maximumWorld.y);
            maxZ = Math.max(maxZ, bb.maximumWorld.z);
        };

        if (mesh.getTotalVertices() > 0) processMesh(mesh);
        for (const child of mesh.getChildMeshes(false)) {
            if (child.getTotalVertices() > 0) processMesh(child);
        }

        if (minX === Infinity) return;

        const height = maxY - minY;
        const sizeX = maxX - minX;
        const sizeZ = maxZ - minZ;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // Determine door orientation: the longer axis is the door width
        const isAlignedX = sizeX > sizeZ;
        const doorWidth = isAlignedX ? sizeX : sizeZ;
        const doorDepth = isAlignedX ? sizeZ : sizeX;
        const pillarWidth = doorWidth * 0.25; // Pillars = 25% of door width

        // Create two pillars on either side of the door opening
        const leftPillar = MeshBuilder.CreateBox(`collider_${prop.mesh}_left_${this.colliders.length}`, {
            width: isAlignedX ? pillarWidth + COLLIDER_PADDING : doorDepth + COLLIDER_PADDING,
            height: height + COLLIDER_PADDING,
            depth: isAlignedX ? doorDepth + COLLIDER_PADDING : pillarWidth + COLLIDER_PADDING
        }, this.scene);

        const rightPillar = MeshBuilder.CreateBox(`collider_${prop.mesh}_right_${this.colliders.length}`, {
            width: isAlignedX ? pillarWidth + COLLIDER_PADDING : doorDepth + COLLIDER_PADDING,
            height: height + COLLIDER_PADDING,
            depth: isAlignedX ? doorDepth + COLLIDER_PADDING : pillarWidth + COLLIDER_PADDING
        }, this.scene);

        if (isAlignedX) {
            // Door aligned along X axis - pillars on left/right (X direction)
            leftPillar.position = new Vector3(minX + pillarWidth / 2, centerY, centerZ);
            rightPillar.position = new Vector3(maxX - pillarWidth / 2, centerY, centerZ);
        } else {
            // Door aligned along Z axis - pillars on front/back (Z direction)
            leftPillar.position = new Vector3(centerX, centerY, minZ + pillarWidth / 2);
            rightPillar.position = new Vector3(centerX, centerY, maxZ - pillarWidth / 2);
        }

        leftPillar.isVisible = false;
        leftPillar.checkCollisions = true;
        this.colliders.push(leftPillar);

        rightPillar.isVisible = false;
        rightPillar.checkCollisions = true;
        this.colliders.push(rightPillar);

        console.log(`[LevelLoader] Created door frame colliders for ${prop.mesh}: 2 pillars (${isAlignedX ? 'X-aligned' : 'Z-aligned'})`);
    }

    private storeLightDefinitions(lights: LightData[]): void {
        if (!lights || lights.length === 0) {
            console.warn('[LevelLoader] No lights defined in level!');
            return;
        }

        for (const lightData of lights) {
            this.lightDefinitions.push({
                position: new Vector3(lightData.position.x, lightData.position.y, lightData.position.z),
                color: lightData.color
                    ? new Color3(lightData.color.x, lightData.color.y, lightData.color.z)
                    : new Color3(1, 0.6, 0.2),
                intensity: lightData.intensity ?? 0.8,
                range: lightData.range ?? 8
            });
        }
        console.log(`[LevelLoader] Stored ${this.lightDefinitions.length} light definitions`);
    }

    // For powerful GPUs: create all lights at once, no culling
    private createAllLightsStatic(): void {
        for (let i = 0; i < this.lightDefinitions.length; i++) {
            const def = this.lightDefinitions[i];
            const light = new PointLight(`light_${i}`, def.position.clone(), this.scene);
            light.diffuse = def.color;
            light.intensity = def.intensity;
            light.range = def.range;
            light.specular = new Color3(0.3, 0.2, 0.1);
            this.activeLights.push(light);
        }
        console.log(`[LevelLoader] Created all ${this.activeLights.length} lights (no culling)`);
    }

    private setupLightCulling(): void {
        this.scene.onBeforeRenderObservable.add(() => {
            this.frameCounter++;

            // Only update culling every N frames for performance
            if (this.frameCounter % CULLING_UPDATE_INTERVAL !== 0) return;

            this.updateLightCulling();
        });
    }

    private updateLightCulling(): void {
        if (!this.playerTarget || this.lightDefinitions.length === 0) return;

        const playerPos = this.playerTarget.position;

        // Calculate distance for each light definition
        const lightsWithDistance = this.lightDefinitions.map((def, index) => ({
            definition: def,
            index,
            distance: Vector3.Distance(playerPos, def.position)
        }));

        // Sort by distance (closest first)
        lightsWithDistance.sort((a, b) => a.distance - b.distance);

        // Get the indices of lights that should be active
        const shouldBeActive = new Set<number>();
        for (let i = 0; i < Math.min(this.maxActiveLights, lightsWithDistance.length); i++) {
            shouldBeActive.add(lightsWithDistance[i].index);
        }

        // Check which active lights need to be removed
        const lightsToRemove: number[] = [];
        for (let i = 0; i < this.activeLights.length; i++) {
            const lightIndex = parseInt(this.activeLights[i].name.replace('dynLight_', ''));
            if (!shouldBeActive.has(lightIndex)) {
                lightsToRemove.push(i);
            }
        }

        // Remove lights that are now too far (reverse order to preserve indices)
        for (let i = lightsToRemove.length - 1; i >= 0; i--) {
            const light = this.activeLights[lightsToRemove[i]];
            light.dispose();
            this.activeLights.splice(lightsToRemove[i], 1);
        }

        // Check which lights need to be created
        const existingIndices = new Set(
            this.activeLights.map(l => parseInt(l.name.replace('dynLight_', '')))
        );

        for (const entry of lightsWithDistance.slice(0, this.maxActiveLights)) {
            if (!existingIndices.has(entry.index)) {
                // Create new light
                const def = entry.definition;
                const light = new PointLight(`dynLight_${entry.index}`, def.position.clone(), this.scene);
                light.diffuse = def.color;
                light.intensity = def.intensity;
                light.range = def.range;
                light.specular = Color3.Black(); // Disable specular for perf on weaker GPUs
                this.activeLights.push(light);
            }
        }
    }

    setPlayerTarget(target: TransformNode): void {
        this.playerTarget = target;

        // Only do initial culling update if we're using culling
        if (this.useCulling) {
            console.log(`[LevelLoader] Player target set, initializing dynamic lighting`);
            this.updateLightCulling();
        }
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
        this.activeLights.forEach(light => light.dispose());
        this.activeLights = [];
        this.lightDefinitions = [];
        this.colliders.forEach(collider => collider.dispose());
        this.colliders = [];
    }
}
