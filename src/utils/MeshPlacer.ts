import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { LoadedAssets } from '../core/AssetLoader';

export interface PlacementOptions {
    position: { x: number; y: number; z: number };
    rotation?: number;
    scale?: number;
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

        // Reset rotation avant d'appliquer la nouvelle
        clone.rotation = Vector3.Zero();
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
        const groupId = this.cloneCounter++;

        // First, calculate the combined bounding box from all primitives
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const primitive of primitives) {
            const bb = primitive.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bb.minimumWorld.x);
            minY = Math.min(minY, bb.minimumWorld.y);
            minZ = Math.min(minZ, bb.minimumWorld.z);
            maxX = Math.max(maxX, bb.maximumWorld.x);
            maxY = Math.max(maxY, bb.maximumWorld.y);
            maxZ = Math.max(maxZ, bb.maximumWorld.z);
        }

        // Create a parent mesh (invisible box) with the correct bounding box
        const width = maxX - minX;
        const height = maxY - minY;
        const depth = maxZ - minZ;

        const parentMesh = MeshBuilder.CreateBox(`${baseName}_group_${groupId}`, {
            width: width || 0.1,
            height: height || 0.1,
            depth: depth || 0.1
        }, this.scene);

        parentMesh.position = new Vector3(options.position.x, options.position.y, options.position.z);
        parentMesh.isVisible = false; // Parent is invisible, children are visible

        if (options.rotation !== undefined) {
            parentMesh.rotation.y = options.rotation;
        }

        if (options.scale !== undefined) {
            parentMesh.scaling = new Vector3(options.scale, options.scale, options.scale);
        }

        // Clone and attach all primitives to parent
        for (const primitive of primitives) {
            const clone = primitive.clone(`${primitive.name}_${groupId}`, parentMesh);
            if (clone) {
                clone.isVisible = true;
                // Position/rotation à zéro - le parent gère tout
                clone.position = Vector3.Zero();
                clone.rotation = Vector3.Zero();
            }
        }

        return parentMesh;
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
