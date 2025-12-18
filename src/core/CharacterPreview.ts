import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF';

import { CharacterClassName } from './CharacterClass';

const ROOT_MOTION_NODES = ['Armature', 'Hips', 'mixamorig:Hips'];

export class CharacterPreview {
    private engine: Engine;
    private scene: Scene;
    private canvas: HTMLCanvasElement;
    private rootNode: TransformNode | null = null;
    private currentAnimation: AnimationGroup | null = null;
    private isDisposed = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.engine = new Engine(canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true,
            alpha: true
        });

        this.scene = new Scene(this.engine);
        this.scene.clearColor = new Color4(0, 0, 0, 0); // Transparent background

        this.setupCamera();
        this.setupLighting();

        // Start render loop
        this.engine.runRenderLoop(() => {
            if (!this.isDisposed) {
                this.scene.render();
            }
        });
    }

    private setupCamera(): void {
        const camera = new ArcRotateCamera(
            'previewCamera',
            Math.PI / 2 + 0.3, // Slight angle for better view
            Math.PI / 2.2,
            3,
            new Vector3(0, 0.8, 0),
            this.scene
        );
        camera.minZ = 0.1;
        camera.lowerRadiusLimit = 2;
        camera.upperRadiusLimit = 5;

        // Disable user input - just for display
        camera.inputs.clear();
    }

    private setupLighting(): void {
        // Soft ambient light
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.7;

        // Key light from front-right
        const keyLight = new DirectionalLight('key', new Vector3(-0.5, -0.5, -1), this.scene);
        keyLight.intensity = 0.8;

        // Fill light from left
        const fillLight = new DirectionalLight('fill', new Vector3(1, 0, -0.5), this.scene);
        fillLight.intensity = 0.3;
    }

    async loadCharacter(characterClass: CharacterClassName): Promise<void> {
        const basePath = `${import.meta.env.BASE_URL}assets/`;

        let modelPath: string;
        let modelFile: string;
        let idleFile: string;
        let scale: number;

        if (characterClass === 'archer') {
            modelPath = `${basePath}Pro Longbow Pack/`;
            modelFile = 'Erika Archer With Bow Arrow.glb';
            idleFile = 'standing idle 03 examine.glb';
            scale = 1;
        } else {
            modelPath = `${basePath}Sword and Shield Pack/`;
            modelFile = 'Paladin WProp J Nordstrom.glb';
            idleFile = 'sword and shield idle.glb';
            scale = 1;
        }

        try {
            // Load character mesh
            const result = await SceneLoader.ImportMeshAsync('', modelPath, modelFile, this.scene);

            this.rootNode = new TransformNode('characterRoot', this.scene);
            // Rotate to face the camera
            this.rootNode.rotation.y = Math.PI;

            const mesh = result.meshes[0];
            mesh.parent = this.rootNode;
            mesh.position = new Vector3(0, 0, 0);
            mesh.scaling.setAll(scale);

            // Make all meshes visible
            result.meshes.forEach(m => {
                m.isVisible = true;
            });

            // Store transform nodes for animation retargeting
            const transformNodes = new Map<string, TransformNode>();
            result.transformNodes.forEach(node => {
                transformNodes.set(node.name, node);
            });

            // Load idle animation
            await this.loadAnimation(modelPath, idleFile, transformNodes);

        } catch (error) {
            console.error(`[CharacterPreview] Failed to load ${characterClass}:`, error);
        }
    }

    private async loadAnimation(
        basePath: string,
        filename: string,
        transformNodes: Map<string, TransformNode>
    ): Promise<void> {
        try {
            const result = await SceneLoader.ImportMeshAsync('', basePath, filename, this.scene);
            const sourceAnimGroup = result.animationGroups[0];

            if (!sourceAnimGroup) {
                result.meshes.forEach(mesh => mesh.dispose());
                return;
            }

            sourceAnimGroup.stop();

            // Create retargeted animation group
            const newAnimGroup = new AnimationGroup('idle', this.scene);

            for (const targetedAnim of sourceAnimGroup.targetedAnimations) {
                const sourceNode = targetedAnim.target;
                if (sourceNode && sourceNode.name) {
                    // Skip root motion
                    const isRootNode = ROOT_MOTION_NODES.some(rootName =>
                        sourceNode.name.includes(rootName)
                    );
                    const isPositionAnim = targetedAnim.animation.targetProperty === 'position';

                    if (isRootNode && isPositionAnim) {
                        continue;
                    }

                    const targetNode = transformNodes.get(sourceNode.name);
                    if (targetNode) {
                        newAnimGroup.addTargetedAnimation(targetedAnim.animation, targetNode);
                    }
                }
            }

            // Dispose source
            sourceAnimGroup.dispose();
            result.transformNodes.forEach(node => node.dispose());
            result.meshes.forEach(mesh => mesh.dispose());
            result.skeletons.forEach(skeleton => skeleton.dispose());

            // Play the animation
            newAnimGroup.start(true, 1.0);
            this.currentAnimation = newAnimGroup;

        } catch (error) {
            console.error('[CharacterPreview] Failed to load animation:', error);
        }
    }

    resize(): void {
        this.engine.resize();
    }

    dispose(): void {
        this.isDisposed = true;
        this.currentAnimation?.dispose();
        this.scene.dispose();
        this.engine.dispose();
    }
}

export async function createCharacterPreviews(): Promise<{ knight: CharacterPreview; archer: CharacterPreview }> {
    const knightCanvas = document.getElementById('knight-preview-canvas') as HTMLCanvasElement;
    const archerCanvas = document.getElementById('archer-preview-canvas') as HTMLCanvasElement;

    const knightPreview = new CharacterPreview(knightCanvas);
    const archerPreview = new CharacterPreview(archerCanvas);

    await Promise.all([
        knightPreview.loadCharacter('knight'),
        archerPreview.loadCharacter('archer')
    ]);

    return { knight: knightPreview, archer: archerPreview };
}
