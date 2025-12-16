import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { LoadedAssets } from '../core/AssetLoader';

export interface PlacementOptions {
    position: { x: number; y: number; z: number };
    rotation?: number;
    scale?: number;
}

export class MeshPlacer {
    private assets: LoadedAssets;
    private cloneCounter: number = 0;

    constructor(assets: LoadedAssets) {
        this.assets = assets;
    }

    place(meshName: string, options: PlacementOptions): AbstractMesh | null {
        const original = this.assets.meshes.get(meshName);

        if (!original) {
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
