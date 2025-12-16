import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { LoadedAssets } from '../core/AssetLoader';

export interface PlacementOptions {
    position: { x: number; y: number; z: number };
    rotation?: number;
    scale?: number;
    /** Enable collision detection on this mesh (default: true for walls/pillars) */
    checkCollisions?: boolean;
}

export class MeshPlacer {
    private assets: LoadedAssets;
    private cloneCounter: number = 0;
    private scene: any;

    constructor(assets: LoadedAssets) {
        this.assets = assets;
        // Get scene from first mesh
        const firstMesh = assets.meshes.values().next().value;
        this.scene = firstMesh?.getScene();
    }

    place(meshName: string, options: PlacementOptions): AbstractMesh | null {
        // First try exact match
        let original = this.assets.meshes.get(meshName);

        if (!original) {
            // Try to find primitives (meshName_primitive0, meshName_primitive1, etc.)
            const primitives = this.findPrimitives(meshName);
            if (primitives.length > 0) {
                return this.placeGroup(meshName, primitives, options);
            }
            console.warn(`[MeshPlacer] Mesh "${meshName}" not found`);
            return null;
        }

        const clone = original.clone(`${meshName}_${this.cloneCounter++}`, null);
        if (!clone) return null;

        clone.isVisible = true;
        clone.position = new Vector3(options.position.x, options.position.y, options.position.z);

        if (options.rotation !== undefined) {
            clone.rotation.y = options.rotation;
        }

        if (options.scale !== undefined) {
            clone.scaling = new Vector3(options.scale, options.scale, options.scale);
        }

        return clone;
    }

    private findPrimitives(baseName: string): AbstractMesh[] {
        const primitives: AbstractMesh[] = [];
        for (const [name, mesh] of this.assets.meshes) {
            if (name.startsWith(baseName + '_primitive')) {
                primitives.push(mesh);
            }
        }
        return primitives;
    }

    private placeGroup(baseName: string, primitives: AbstractMesh[], options: PlacementOptions): AbstractMesh {
        // Create a parent node to group all primitives
        const groupId = this.cloneCounter++;
        const parent = new TransformNode(`${baseName}_group_${groupId}`, this.scene);
        parent.position = new Vector3(options.position.x, options.position.y, options.position.z);

        if (options.rotation !== undefined) {
            parent.rotation.y = options.rotation;
        }

        if (options.scale !== undefined) {
            parent.scaling = new Vector3(options.scale, options.scale, options.scale);
        }

        // Clone and attach all primitives to parent
        let firstClone: AbstractMesh | null = null;
        for (const primitive of primitives) {
            const clone = primitive.clone(`${primitive.name}_${groupId}`, parent);
            if (clone) {
                clone.isVisible = true;
                // Reset position/rotation since parent handles it
                clone.position = primitive.position.clone();
                clone.rotation = primitive.rotation.clone();
                if (!firstClone) firstClone = clone;
            }
        }

        return firstClone!;
    }

    placeMultiple(meshName: string, positions: PlacementOptions[]): AbstractMesh[] {
        return positions
            .map(opts => this.place(meshName, opts))
            .filter((mesh): mesh is AbstractMesh => mesh !== null);
    }

    placeGrid(meshName: string, config: {
        startX: number;
        startZ: number;
        countX: number;
        countZ: number;
        spacingX: number;
        spacingZ: number;
        y?: number;
    }): AbstractMesh[] {
        const meshes: AbstractMesh[] = [];
        const y = config.y ?? 0;

        for (let ix = 0; ix < config.countX; ix++) {
            for (let iz = 0; iz < config.countZ; iz++) {
                const mesh = this.place(meshName, {
                    position: {
                        x: config.startX + ix * config.spacingX,
                        y,
                        z: config.startZ + iz * config.spacingZ
                    }
                });
                if (mesh) meshes.push(mesh);
            }
        }

        return meshes;
    }
}
