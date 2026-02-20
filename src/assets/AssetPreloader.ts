import { Scene } from '@babylonjs/core/scene';
import { Engine, NullEngine } from '@babylonjs/core/Engines';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';

interface PreloadedAsset {
    url: string;
    loaded: boolean;
}

class AssetPreloader {
    private preloadedUrls: Set<string> = new Set();
    private loadingPromises: Map<string, Promise<void>> = new Map();
    private nullEngine: NullEngine | null = null;
    private nullScene: Scene | null = null;

    private getEngine(): { engine: NullEngine; scene: Scene } {
        if (!this.nullEngine) {
            this.nullEngine = new NullEngine();
            this.nullScene = new Scene(this.nullEngine);
        }
        return { engine: this.nullEngine, scene: this.nullScene! };
    }

    async preloadGLB(basePath: string, filename: string): Promise<void> {
        const url = `${basePath}${filename}`;

        if (this.preloadedUrls.has(url)) {
            return;
        }

        if (this.loadingPromises.has(url)) {
            return this.loadingPromises.get(url);
        }

        const loadPromise = this.doPreload(basePath, filename, url);
        this.loadingPromises.set(url, loadPromise);

        try {
            await loadPromise;
            this.preloadedUrls.add(url);
        } finally {
            this.loadingPromises.delete(url);
        }
    }

    private async doPreload(basePath: string, filename: string, url: string): Promise<void> {
        try {
            // Just fetch the file to get it into browser cache
            const response = await fetch(url);
            if (response.ok) {
                // Read the blob to ensure it's fully cached
                await response.blob();
                console.log(`[AssetPreloader] Preloaded: ${filename}`);
            }
        } catch (error) {
            console.warn(`[AssetPreloader] Failed to preload ${filename}:`, error);
        }
    }

    async preloadCharacterAssets(): Promise<void> {
        const basePath = `${import.meta.env.BASE_URL}assets/`;

        // Knight assets
        const knightPath = `${basePath}Sword and Shield Pack/`;
        const knightAssets = [
            'Paladin WProp J Nordstrom.glb',
            'sword and shield idle.glb',
            'sword and shield idle (2).glb',
            'sword and shield idle (3).glb',
            'sword and shield idle (4).glb',
            'sword and shield walk forward.glb',
            'sword and shield run.glb',
            'sword and shield slash.glb',
            'sword and shield slash (1).glb',
            'sword and shield block.glb',
            'sword and shield block idle.glb',
            'sword and shield death.glb'
        ];

        // Archer assets
        const archerPath = `${basePath}Pro Longbow Pack/`;
        const archerAssets = [
            'Erika Archer With Bow Arrow.glb',
            'standing idle 01.glb',
            'standing idle 03 examine.glb',
            'standing walk forward.glb',
            'standing run forward.glb',
            'standing draw arrow.glb',
            'standing aim overdraw.glb',
            'standing aim recoil.glb',
            'standing aim walk forward.glb',
            'standing aim walk back.glb',
            'standing aim walk left.glb',
            'standing aim walk right.glb',
            'standing block.glb',
            'standing death backward 01.glb'
        ];

        // Dungeon assets
        const dungeonPath = `${basePath}Dungeon_set/`;
        const dungeonAssets = [
            'Dungeon_set.glb'
        ];

        // Enemy assets
        const enemyPath = `${basePath}Creature Pack/`;
        const enemyAssets = [
            'Vampire.glb',
            'Parasite.glb',
            'Mutant.glb',
            'Zombie Skeleton.glb',
            'Warrok.glb'
        ];

        console.log('[AssetPreloader] Starting background preload...');

        // Preload in batches to avoid overwhelming the browser
        const allAssets: { path: string; file: string }[] = [
            ...knightAssets.map(file => ({ path: knightPath, file })),
            ...archerAssets.map(file => ({ path: archerPath, file })),
            ...dungeonAssets.map(file => ({ path: dungeonPath, file })),
            ...enemyAssets.map(file => ({ path: enemyPath, file }))
        ];

        // Load in parallel but with concurrency limit
        const concurrencyLimit = 4;
        for (let i = 0; i < allAssets.length; i += concurrencyLimit) {
            const batch = allAssets.slice(i, i + concurrencyLimit);
            await Promise.all(
                batch.map(asset => this.preloadGLB(asset.path, asset.file))
            );
        }

        console.log('[AssetPreloader] Background preload complete!');
    }

    isPreloaded(basePath: string, filename: string): boolean {
        return this.preloadedUrls.has(`${basePath}${filename}`);
    }

    dispose(): void {
        if (this.nullScene) {
            this.nullScene.dispose();
            this.nullScene = null;
        }
        if (this.nullEngine) {
            this.nullEngine.dispose();
            this.nullEngine = null;
        }
    }
}

// Singleton instance
export const assetPreloader = new AssetPreloader();
