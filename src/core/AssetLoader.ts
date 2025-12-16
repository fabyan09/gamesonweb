import { Scene } from '@babylonjs/core/scene';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import '@babylonjs/loaders/glTF';

export interface LoadedAssets {
    meshes: Map<string, AbstractMesh>;
    rootMesh: AbstractMesh | null;
}

export class AssetLoader {
    private scene: Scene;
    private loadedAssets: Map<string, LoadedAssets> = new Map();

    constructor(scene: Scene) {
        this.scene = scene;
    }

    async loadGLB(name: string, path: string, filename: string): Promise<LoadedAssets> {
        console.log(`[AssetLoader] Loading ${path}${filename}...`);

        try {
            const result = await SceneLoader.ImportMeshAsync('', path, filename, this.scene);
            console.log(`[AssetLoader] Loaded ${result.meshes.length} meshes`);

            const meshMap = new Map<string, AbstractMesh>();

            result.meshes.forEach(mesh => {
                mesh.isVisible = false;
                if (mesh.name && mesh.name !== '__root__') {
                    meshMap.set(mesh.name, mesh);
                }
            });

            const assets: LoadedAssets = {
                meshes: meshMap,
                rootMesh: result.meshes[0] || null
            };

            this.loadedAssets.set(name, assets);
            return assets;
        } catch (error) {
            console.error('[AssetLoader] Failed to load:', error);
            throw error;
        }
    }

    getAssets(name: string): LoadedAssets | undefined {
        return this.loadedAssets.get(name);
    }

    getMesh(assetName: string, meshName: string): AbstractMesh | undefined {
        return this.loadedAssets.get(assetName)?.meshes.get(meshName);
    }

    listMeshes(assetName: string): string[] {
        const assets = this.loadedAssets.get(assetName);
        return assets ? Array.from(assets.meshes.keys()) : [];
    }
}
