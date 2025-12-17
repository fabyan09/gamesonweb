import { Engine } from '@babylonjs/core/Engines/engine';
import { DungeonScene } from '../scenes/DungeonScene';

export class Game {
    private engine: Engine;
    private canvas: HTMLCanvasElement;
    private currentScene: DungeonScene | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new Engine(canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true
        });

        window.addEventListener('resize', () => this.engine.resize());
    }

    async init(): Promise<void> {
        // Read level from URL parameter (1-indexed for user-friendly URLs)
        const urlParams = new URLSearchParams(window.location.search);
        const levelParam = urlParams.get('level');
        // Default to level 1, convert to 0-indexed for internal use
        const levelNumber = levelParam ? parseInt(levelParam, 10) : 1;
        const levelIndex = Math.max(0, levelNumber - 1);

        this.currentScene = new DungeonScene(this.engine, this.canvas);
        await this.currentScene.init(levelIndex);
    }

    run(): void {
        this.engine.runRenderLoop(() => {
            this.currentScene?.render();
        });
    }
}
