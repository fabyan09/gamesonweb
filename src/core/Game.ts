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
        // Read level from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const levelParam = urlParams.get('level');
        const levelIndex = levelParam ? parseInt(levelParam, 10) : 0;

        this.currentScene = new DungeonScene(this.engine, this.canvas);
        await this.currentScene.init(levelIndex);
    }

    run(): void {
        this.engine.runRenderLoop(() => {
            this.currentScene?.render();
        });
    }
}
