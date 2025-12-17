import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import '@babylonjs/loaders/glTF';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { GameSettings } from './GameSettings';

export interface PlayerConfig {
    position?: Vector3;
    scale?: number;
    rotationSpeed?: number;
    walkSpeed?: number;
    runSpeed?: number;
    /** Offset vertical du mesh par rapport au rootNode (pour aligner les pieds au sol) */
    meshYOffset?: number;
}

interface AnimationSet {
    idle: AnimationGroup | null;
    walk: AnimationGroup | null;
    run: AnimationGroup | null;
    attack: AnimationGroup | null;
    block: AnimationGroup | null;
    blockIdle: AnimationGroup | null;
    jump: AnimationGroup | null;
    death: AnimationGroup | null;
}

type AnimationName = keyof AnimationSet;

// Root nodes to exclude from animations (to prevent root motion)
const ROOT_MOTION_NODES = ['Armature', 'Hips', 'mixamorig:Hips'];

export class PlayerController {
    private scene: Scene;
    private mesh: AbstractMesh | null = null;
    private rootNode: TransformNode | null = null;
    private colliderMesh: Mesh | null = null;
    private animations: AnimationSet = {
        idle: null,
        walk: null,
        run: null,
        attack: null,
        block: null,
        blockIdle: null,
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
    private isDead = false;
    private camera: ThirdPersonCamera | null = null;
    private skeleton: Skeleton | null = null;
    private transformNodes: Map<string, TransformNode> = new Map();
    private settings: GameSettings;

    // Physics
    private verticalVelocity = 0;
    private readonly gravity = -0.006;
    private readonly jumpForce = 0.14;
    private groundY = 0;

    // Attack callback
    private attackHitCallback: ((position: Vector3, range: number) => void) | null = null;
    private readonly attackRange = 2.5;

    constructor(scene: Scene, config: PlayerConfig = {}) {
        this.scene = scene;
        this.settings = GameSettings.getInstance();
        this.config = {
            position: config.position ?? new Vector3(0, 0, 0),
            scale: config.scale ?? 0.01,
            rotationSpeed: config.rotationSpeed ?? 0.05,
            walkSpeed: config.walkSpeed ?? 0.05,
            runSpeed: config.runSpeed ?? 0.1,
            meshYOffset: config.meshYOffset ?? 0
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

        // Create a simple collider mesh for collision detection
        // Using a box as the collision proxy - the ellipsoid is what matters for moveWithCollisions
        this.colliderMesh = MeshBuilder.CreateBox('playerCollider', {
            width: 0.1,
            height: 0.1,
            depth: 0.1
        }, this.scene);
        this.colliderMesh.position = this.config.position.clone();
        this.colliderMesh.isVisible = false;
        this.colliderMesh.checkCollisions = true;
        // Ellipsoid defines the collision volume (radius X, half-height Y, radius Z)
        this.colliderMesh.ellipsoid = new Vector3(0.4, 0.9, 0.4);
        // Offset so the ellipsoid is centered on the player's body, not feet
        this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);

        // Create a root node for proper rotation control
        this.rootNode = new TransformNode('playerRoot', this.scene);
        this.rootNode.position = this.config.position.clone();

        this.mesh = characterResult.meshes[0];
        this.mesh.parent = this.rootNode;
        this.mesh.position = Vector3.Zero(); // Reset position since parent handles it
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

        // Load animations ('full' = remove all root motion, 'horizontal' = remove only X/Z, 'none' = keep all)
        await this.loadAnimation(basePath, 'sword and shield idle.glb', 'idle', 'full');
        await this.loadAnimation(basePath, 'sword and shield walk.glb', 'walk', 'full');
        await this.loadAnimation(basePath, 'sword and shield run.glb', 'run', 'full');
        await this.loadAnimation(basePath, 'sword and shield attack (4).glb', 'attack', 'full');
        await this.loadAnimation(basePath, 'sword and shield block.glb', 'block', 'full');
        await this.loadAnimation(basePath, 'sword and shield block idle.glb', 'blockIdle', 'full');
        await this.loadAnimation(basePath, 'sword and shield jump.glb', 'jump', 'full');
        await this.loadAnimation(basePath, 'sword and shield death (2).glb', 'death', 'none');

        // Start with idle animation
        this.playAnimation('idle', true);

        // Setup input handlers
        this.setupInput();

        // Register update loop
        this.scene.onBeforeRenderObservable.add(() => this.update());

        console.log('[PlayerController] Player loaded successfully');
    }

    private async loadAnimation(basePath: string, filename: string, name: AnimationName, rootMotionMode: 'full' | 'horizontal' | 'none' = 'none'): Promise<void> {
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
                    const isRootNode = ROOT_MOTION_NODES.some(rootName =>
                        sourceNode.name.includes(rootName)
                    );
                    const isPositionAnim = targetedAnim.animation.targetProperty === 'position';

                    // Skip based on root motion mode
                    if (isRootNode && isPositionAnim) {
                        if (rootMotionMode === 'full') {
                            continue; // Skip all position animations on root
                        } else if (rootMotionMode === 'horizontal') {
                            // Filter out X and Z movement, keep only Y (vertical)
                            const anim = targetedAnim.animation;
                            const keys = anim.getKeys();
                            if (keys.length > 0) {
                                // Use first frame's X and Z as base, only animate Y
                                const baseX = keys[0].value.x;
                                const baseZ = keys[0].value.z;
                                const filteredKeys = keys.map(key => ({
                                    frame: key.frame,
                                    value: new Vector3(baseX, key.value.y, baseZ)
                                }));
                                anim.setKeys(filteredKeys);
                            }
                        }
                    }

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
        if (this.settings.isKeyBound('forward', e.code)) {
            this.keys.forward = true;
        }
        if (this.settings.isKeyBound('backward', e.code)) {
            this.keys.backward = true;
        }
        if (this.settings.isKeyBound('left', e.code)) {
            this.keys.left = true;
        }
        if (this.settings.isKeyBound('right', e.code)) {
            this.keys.right = true;
        }
        if (this.settings.isKeyBound('run', e.code)) {
            this.keys.run = true;
        }
        if (this.settings.isKeyBound('jump', e.code)) {
            if (!this.isJumping) {
                this.keys.jump = true;
                this.triggerJump();
            }
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        if (this.settings.isKeyBound('forward', e.code)) {
            this.keys.forward = false;
        }
        if (this.settings.isKeyBound('backward', e.code)) {
            this.keys.backward = false;
        }
        if (this.settings.isKeyBound('left', e.code)) {
            this.keys.left = false;
        }
        if (this.settings.isKeyBound('right', e.code)) {
            this.keys.right = false;
        }
        if (this.settings.isKeyBound('run', e.code)) {
            this.keys.run = false;
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
        if (this.isAttacking || !this.rootNode) return;

        this.isAttacking = true;
        this.playAnimation('attack', false);

        if (this.animations.attack) {
            // Trigger hit detection at animation midpoint
            const hitFrame = (this.animations.attack.from + this.animations.attack.to) / 2;
            let hitTriggered = false;

            const checkHit = () => {
                if (!hitTriggered && this.animations.attack!.animatables[0]) {
                    const currentFrame = this.animations.attack!.animatables[0].masterFrame;
                    if (currentFrame >= hitFrame) {
                        hitTriggered = true;
                        this.triggerAttackHit();
                    }
                }
            };

            const observer = this.scene.onBeforeRenderObservable.add(checkHit);

            this.animations.attack.onAnimationEndObservable.addOnce(() => {
                this.isAttacking = false;
                this.scene.onBeforeRenderObservable.remove(observer);
            });
        }
    }

    private triggerAttackHit(): void {
        if (!this.rootNode || !this.attackHitCallback) return;

        // Calculate attack position (in front of player)
        const forward = new Vector3(
            Math.sin(this.rootNode.rotation.y + Math.PI),
            0,
            Math.cos(this.rootNode.rotation.y + Math.PI)
        );
        const attackPosition = this.rootNode.position.add(forward.scale(1.5));
        attackPosition.y += 1; // Adjust to chest height

        this.attackHitCallback(attackPosition, this.attackRange);
    }

    onAttackHit(callback: (position: Vector3, range: number) => void): void {
        this.attackHitCallback = callback;
    }

    private triggerBlock(active: boolean): void {
        if (active && !this.isBlocking) {
            this.isBlocking = true;
            // Play block animation once, then switch to blockIdle
            this.playAnimation('block', false);

            if (this.animations.block) {
                this.animations.block.onAnimationEndObservable.addOnce(() => {
                    // Only switch to blockIdle if still blocking
                    if (this.isBlocking) {
                        this.playAnimation('blockIdle', true);
                    }
                });
            }
        } else if (!active) {
            this.isBlocking = false;
        }
    }

    private triggerJump(): void {
        if (this.isJumping || !this.rootNode) return;

        this.isJumping = true;
        this.verticalVelocity = this.jumpForce; // Apply jump force
        this.groundY = this.rootNode.position.y; // Remember ground level
        this.playAnimation('jump', false);
    }

    private update(): void {
        if (!this.rootNode || !this.colliderMesh || this.isDead) return;

        // Don't update if game is paused
        if (this.scene.metadata?.isPaused) return;

        // Apply gravity and vertical movement
        if (this.isJumping) {
            this.verticalVelocity += this.gravity;
            this.rootNode.position.y += this.verticalVelocity;

            // Check if landed
            if (this.rootNode.position.y <= this.groundY) {
                this.rootNode.position.y = this.groundY;
                this.verticalVelocity = 0;
                this.isJumping = false;
                this.keys.jump = false;
            }
        }

        const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
        const speed = this.keys.run ? this.config.runSpeed : this.config.walkSpeed;

        // Get camera angle for movement
        const cameraAngle = this.camera ? -this.camera.alpha - Math.PI / 2 : 0;

        // Calculate movement direction relative to camera
        let moveX = 0;
        let moveZ = 0;

        if (this.keys.forward) moveZ += 1;
        if (this.keys.backward) moveZ -= 1;
        if (this.keys.left) moveX -= 1;
        if (this.keys.right) moveX += 1;

        // Apply movement relative to camera orientation
        if (isMoving && !this.isBlocking) {
            const inputAngle = Math.atan2(moveX, moveZ);
            const moveAngle = cameraAngle + inputAngle;

            // Rotate character to face movement direction (flip 180° so character faces forward)
            this.rootNode.rotation.y = moveAngle + Math.PI;

            // Calculate movement velocity
            const velocity = new Vector3(
                Math.sin(moveAngle) * speed,
                0,
                Math.cos(moveAngle) * speed
            );

            // Move with collision detection
            this.colliderMesh.moveWithCollisions(velocity);

            // Sync rootNode position with collider
            this.rootNode.position.x = this.colliderMesh.position.x;
            this.rootNode.position.z = this.colliderMesh.position.z;
        }

        // Keep collider synced with player position (for Y position during jumps)
        this.colliderMesh.position.copyFrom(this.rootNode.position);

        // Update animation based on state
        if (!this.isAttacking && !this.isJumping && !this.isBlocking) {
            if (isMoving) {
                this.playAnimation(this.keys.run ? 'run' : 'walk', true);
            } else {
                this.playAnimation('idle', true);
            }
        }
    }

    get position(): Vector3 {
        return this.rootNode?.position ?? Vector3.Zero();
    }

    get rootMesh(): TransformNode | null {
        return this.rootNode;
    }

    get isCurrentlyBlocking(): boolean {
        return this.isBlocking;
    }

    setCamera(camera: ThirdPersonCamera): void {
        this.camera = camera;
    }

    /**
     * Play death animation and return a Promise that resolves when complete
     */
    playDeath(): Promise<void> {
        return new Promise((resolve) => {
            if (this.isDead) {
                resolve();
                return;
            }

            this.isDead = true;
            this.playAnimation('death', false);

            if (this.animations.death) {
                this.animations.death.onAnimationEndObservable.addOnce(() => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    get isPlayerDead(): boolean {
        return this.isDead;
    }

    dispose(): void {
        Object.values(this.animations).forEach(anim => anim?.dispose());
        this.mesh?.dispose();
        this.colliderMesh?.dispose();
    }
}
