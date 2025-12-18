import { Engine } from '@babylonjs/core/Engines/engine';
import { DungeonScene } from '../scenes/DungeonScene';
import { GameSettings } from './GameSettings';
import { CharacterClassName } from './CharacterClass';

export class Game {
    private engine: Engine;
    private canvas: HTMLCanvasElement;
    private currentScene: DungeonScene | null = null;
    private settings: GameSettings;
    private characterClass: CharacterClassName;

    constructor(canvas: HTMLCanvasElement, characterClass: CharacterClassName = 'knight') {
        this.canvas = canvas;
        this.characterClass = characterClass;
        this.settings = GameSettings.getInstance();

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

        this.currentScene = new DungeonScene(this.engine, this.canvas, this.characterClass);
        await this.currentScene.init(levelIndex);

        // Apply settings after scene is loaded
        this.settings.apply();
    }

    run(): void {
        this.engine.runRenderLoop(() => {
            this.currentScene?.render();
        });
    }
}
