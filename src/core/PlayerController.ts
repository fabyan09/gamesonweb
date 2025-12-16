import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import '@babylonjs/loaders/glTF';
import { ThirdPersonCamera } from './ThirdPersonCamera';

export interface PlayerConfig {
    position?: Vector3;
    scale?: number;
    rotationSpeed?: number;
    walkSpeed?: number;
    runSpeed?: number;
}

interface AnimationSet {
    idle: AnimationGroup | null;
    walk: AnimationGroup | null;
    run: AnimationGroup | null;
    attack: AnimationGroup | null;
    block: AnimationGroup | null;
    jump: AnimationGroup | null;
    death: AnimationGroup | null;
}

type AnimationName = keyof AnimationSet;

export class PlayerController {
    private scene: Scene;
    private mesh: AbstractMesh | null = null;
    private animations: AnimationSet = {
        idle: null,
        walk: null,
        run: null,
        attack: null,
        block: null,
        jump: null,
        death: null
    };
    private currentAnimation: AnimationGroup | null = null;
    private currentAnimationName: AnimationName | null = null;

    private keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        run: false,
        attack: false,
        block: false,
        jump: false
    };

    private config: Required<PlayerConfig>;
    private velocity: Vector3 = Vector3.Zero();
    private isAttacking = false;
    private isBlocking = false;
    private isJumping = false;
    private camera: ThirdPersonCamera | null = null;
    private skeleton: Skeleton | null = null;
    private transformNodes: Map<string, TransformNode> = new Map();

    constructor(scene: Scene, config: PlayerConfig = {}) {
        this.scene = scene;
        this.config = {
            position: config.position ?? new Vector3(0, 0, 0),
            scale: config.scale ?? 0.01,
            rotationSpeed: config.rotationSpeed ?? 0.05,
            walkSpeed: config.walkSpeed ?? 0.05,
            runSpeed: config.runSpeed ?? 0.1
        };
    }

    async load(basePath: string): Promise<void> {
        // Load character mesh
        const characterResult = await SceneLoader.ImportMeshAsync(
            '',
            basePath,
            'Paladin WProp J Nordstrom.glb',
            this.scene
        );

        this.mesh = characterResult.meshes[0];
        this.mesh.position = this.config.position.clone();
        this.mesh.scaling.setAll(this.config.scale);

        // Get skeleton
        this.skeleton = characterResult.skeletons[0] || null;
        console.log(`[PlayerController] Skeleton: ${this.skeleton?.name}, bones: ${this.skeleton?.bones.length}`);

        // Store all transform nodes for animation retargeting
        characterResult.transformNodes.forEach(node => {
            this.transformNodes.set(node.name, node);
        });
        console.log(`[PlayerController] Stored ${this.transformNodes.size} transform nodes`);

        // Make all meshes visible
        characterResult.meshes.forEach(mesh => {
            mesh.isVisible = true;
        });

        console.log(`[PlayerController] Loaded ${characterResult.meshes.length} meshes, scale: ${this.config.scale}`);

        // Store character animation groups (idle from the character file itself if any)
        if (characterResult.animationGroups.length > 0) {
            console.log(`[PlayerController] Character has ${characterResult.animationGroups.length} built-in animations`);
        }

        // Load animations
        await this.loadAnimation(basePath, 'sword and shield idle.glb', 'idle');
        await this.loadAnimation(basePath, 'sword and shield walk.glb', 'walk');
        await this.loadAnimation(basePath, 'sword and shield run.glb', 'run');
        await this.loadAnimation(basePath, 'sword and shield attack.glb', 'attack');
        await this.loadAnimation(basePath, 'sword and shield block.glb', 'block');
        await this.loadAnimation(basePath, 'sword and shield jump.glb', 'jump');
        await this.loadAnimation(basePath, 'sword and shield death.glb', 'death');

        // Start with idle animation
        this.playAnimation('idle', true);

        // Setup input handlers
        this.setupInput();

        // Register update loop
        this.scene.onBeforeRenderObservable.add(() => this.update());

        console.log('[PlayerController] Player loaded successfully');
    }

    private async loadAnimation(basePath: string, filename: string, name: AnimationName): Promise<void> {
        if (this.transformNodes.size === 0) {
            console.warn(`[PlayerController] No transform nodes to retarget animation ${name}`);
            return;
        }

        try {
            console.log(`[PlayerController] Loading animation file: ${filename}`);
            const result = await SceneLoader.ImportMeshAsync('', basePath, filename, this.scene);

            console.log(`[PlayerController] Animation file loaded - animGroups: ${result.animationGroups.length}, transformNodes: ${result.transformNodes.length}`);

            // Get the animation group from the loaded file
            const sourceAnimGroup = result.animationGroups[0];

            if (!sourceAnimGroup) {
                console.warn(`[PlayerController] No animation group in ${filename}`);
                result.meshes.forEach(mesh => mesh.dispose());
                return;
            }

            console.log(`[PlayerController] Source anim group has ${sourceAnimGroup.targetedAnimations.length} targeted animations`);

            sourceAnimGroup.stop();

            // Create a new animation group for our character
            const newAnimGroup = new AnimationGroup(name, this.scene);
            let retargetedCount = 0;

            // Retarget animations to our character's transform nodes
            for (const targetedAnim of sourceAnimGroup.targetedAnimations) {
                const sourceNode = targetedAnim.target;
                if (sourceNode && sourceNode.name) {
                    // Find matching transform node in our character
                    const targetNode = this.transformNodes.get(sourceNode.name);
                    if (targetNode) {
                        newAnimGroup.addTargetedAnimation(targetedAnim.animation, targetNode);
                        retargetedCount++;
                    }
                }
            }

            console.log(`[PlayerController] Retargeted ${retargetedCount}/${sourceAnimGroup.targetedAnimations.length} animations for ${name}`);

            if (retargetedCount > 0) {
                this.animations[name] = newAnimGroup;
                console.log(`[PlayerController] Animation ${name} ready`);
            } else {
                console.warn(`[PlayerController] No animations retargeted for ${name}`);
                newAnimGroup.dispose();
            }

            // Dispose source animation group
            sourceAnimGroup.dispose();

            // Remove the loaded meshes, transform nodes and skeletons
            result.transformNodes.forEach(node => node.dispose());
            result.meshes.forEach(mesh => mesh.dispose());
            result.skeletons.forEach(skeleton => skeleton.dispose());

        } catch (error) {
            console.warn(`[PlayerController] Failed to load animation ${name}:`, error);
        }
    }

    private playAnimation(name: AnimationName, loop: boolean = true): void {
        const anim = this.animations[name];
        if (!anim || this.currentAnimationName === name) return;

        // Stop current animation
        if (this.currentAnimation) {
            this.currentAnimation.stop();
        }

        // Play new animation
        anim.start(loop, 1.0, anim.from, anim.to, false);
        this.currentAnimation = anim;
        this.currentAnimationName = name;
    }

    private setupInput(): void {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    private onKeyDown(e: KeyboardEvent): void {
        switch (e.code) {
            case 'KeyW':
            case 'KeyZ':
            case 'ArrowUp':
                this.keys.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = true;
                break;
            case 'KeyA':
            case 'KeyQ':
            case 'ArrowLeft':
                this.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.run = true;
                break;
            case 'Space':
                if (!this.isJumping) {
                    this.keys.jump = true;
                    this.triggerJump();
                }
                break;
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        switch (e.code) {
            case 'KeyW':
            case 'KeyZ':
            case 'ArrowUp':
                this.keys.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = false;
                break;
            case 'KeyA':
            case 'KeyQ':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.run = false;
                break;
        }
    }

    onMouseDown(button: number): void {
        if (button === 0 && !this.isAttacking) {
            this.triggerAttack();
        } else if (button === 2 && !this.isBlocking) {
            this.triggerBlock(true);
        }
    }

    onMouseUp(button: number): void {
        if (button === 2) {
            this.triggerBlock(false);
        }
    }

    private triggerAttack(): void {
        if (this.isAttacking) return;

        this.isAttacking = true;
        this.playAnimation('attack', false);

        if (this.animations.attack) {
            this.animations.attack.onAnimationEndObservable.addOnce(() => {
                this.isAttacking = false;
            });
        }
    }

    private triggerBlock(active: boolean): void {
        this.isBlocking = active;
    }

    private triggerJump(): void {
        if (this.isJumping) return;

        this.isJumping = true;
        this.playAnimation('jump', false);

        if (this.animations.jump) {
            this.animations.jump.onAnimationEndObservable.addOnce(() => {
                this.isJumping = false;
                this.keys.jump = false;
            });
        }
    }

    private update(): void {
        if (!this.mesh) return;

        const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
        const speed = this.keys.run ? this.config.runSpeed : this.config.walkSpeed;

        // Calculate movement direction relative to camera
        let moveX = 0;
        let moveZ = 0;

        if (this.keys.forward) moveZ += 1;
        if (this.keys.backward) moveZ -= 1;
        if (this.keys.left) moveX -= 1;
        if (this.keys.right) moveX += 1;

        // Apply movement relative to camera orientation
        if (isMoving) {
            // Get camera angle for relative movement
            const cameraAngle = this.camera ? -this.camera.alpha - Math.PI / 2 : 0;
            const inputAngle = Math.atan2(moveX, moveZ);
            const finalAngle = cameraAngle + inputAngle;

            // Rotate character to face movement direction
            this.mesh.rotation.y = finalAngle;

            // Move in that direction
            this.mesh.position.x += Math.sin(finalAngle) * speed;
            this.mesh.position.z += Math.cos(finalAngle) * speed;
        }

        // Update animation based on state
        if (!this.isAttacking && !this.isJumping) {
            if (this.isBlocking) {
                this.playAnimation('block', true);
            } else if (isMoving) {
                this.playAnimation(this.keys.run ? 'run' : 'walk', true);
            } else {
                this.playAnimation('idle', true);
            }
        }
    }

    get position(): Vector3 {
        return this.mesh?.position ?? Vector3.Zero();
    }

    get rootMesh(): AbstractMesh | null {
        return this.mesh;
    }

    setCamera(camera: ThirdPersonCamera): void {
        this.camera = camera;
    }

    dispose(): void {
        Object.values(this.animations).forEach(anim => anim?.dispose());
        this.mesh?.dispose();
    }
}
