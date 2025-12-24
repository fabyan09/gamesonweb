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
import { AudioManager } from './AudioManager';

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
    idle2: AnimationGroup | null;
    idle3: AnimationGroup | null;
    idle4: AnimationGroup | null;
    walk: AnimationGroup | null;
    run: AnimationGroup | null;
    attack: AnimationGroup | null;
    attack2: AnimationGroup | null;  // slash
    attack3: AnimationGroup | null;  // slash (3)
    kick: AnimationGroup | null;
    crouchAttack: AnimationGroup | null;  // slash (5)
    block: AnimationGroup | null;
    blockIdle: AnimationGroup | null;
    blockEnd: AnimationGroup | null;  // block (2) - transition back to idle
    jump: AnimationGroup | null;
    death: AnimationGroup | null;
    crouch: AnimationGroup | null;
    crouchIdle: AnimationGroup | null;
    crouchBlock: AnimationGroup | null;
    crouchBlockIdle: AnimationGroup | null;
    crouchStandUp: AnimationGroup | null;
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
        idle2: null,
        idle3: null,
        idle4: null,
        walk: null,
        run: null,
        attack: null,
        attack2: null,
        attack3: null,
        kick: null,
        crouchAttack: null,
        block: null,
        blockIdle: null,
        blockEnd: null,
        jump: null,
        death: null,
        crouch: null,
        crouchIdle: null,
        crouchBlock: null,
        crouchBlockIdle: null,
        crouchStandUp: null
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
        jump: false,
        crouch: false
    };

    private config: Required<PlayerConfig>;
    private velocity: Vector3 = Vector3.Zero();
    private isAttacking = false;
    private isBlocking = false;
    private isBlockEnding = false;  // True while playing block end transition
    private isJumping = false;
    private isDead = false;
    private isCrouching = false;
    private isCrouchTransitioning = false;
    private camera: ThirdPersonCamera | null = null;
    private skeleton: Skeleton | null = null;
    private transformNodes: Map<string, TransformNode> = new Map();
    private settings: GameSettings;
    private audioManager: AudioManager;

    // Physics
    private verticalVelocity = 0;
    private readonly gravity = -0.006;
    private readonly jumpForce = 0.14;
    private groundY = 0;

    // Mesh Y offsets
    private readonly standingMeshY = -0.08;  // Slight offset to plant feet on ground
    private readonly crouchMeshOffset = -0.5;  // Additional offset when crouching
    private readonly standingEllipsoid = new Vector3(0.4, 0.9, 0.4);
    private readonly crouchingEllipsoid = new Vector3(0.4, 0.5, 0.4);
    private targetMeshY = -0.08;  // Target Y position for smooth crouch transition
    private readonly crouchTransitionSpeed = 0.09;  // How fast to interpolate (0-1 per frame)

    // Attack callback
    private attackHitCallback: ((position: Vector3, range: number) => void) | null = null;
    private readonly attackRange = 2.5;

    constructor(scene: Scene, config: PlayerConfig = {}) {
        this.scene = scene;
        this.settings = GameSettings.getInstance();
        this.audioManager = AudioManager.getInstance();
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
        this.mesh.position = new Vector3(0, this.standingMeshY, 0); // Slight Y offset to plant feet on ground
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
        await this.loadAnimation(basePath, 'sword and shield idle (2).glb', 'idle2', 'full');
        await this.loadAnimation(basePath, 'sword and shield idle (3).glb', 'idle3', 'full');
        await this.loadAnimation(basePath, 'sword and shield idle (4).glb', 'idle4', 'full');
        await this.loadAnimation(basePath, 'sword and shield walk.glb', 'walk', 'full');
        await this.loadAnimation(basePath, 'sword and shield run.glb', 'run', 'full');
        await this.loadAnimation(basePath, 'sword and shield attack (4).glb', 'attack', 'full');
        await this.loadAnimation(basePath, 'sword and shield slash.glb', 'attack2', 'full');
        await this.loadAnimation(basePath, 'sword and shield slash (3).glb', 'attack3', 'full');
        await this.loadAnimation(basePath, 'sword and shield kick.glb', 'kick', 'full');
        await this.loadAnimation(basePath, 'sword and shield slash (5).glb', 'crouchAttack', 'full');
        await this.loadAnimation(basePath, 'sword and shield block.glb', 'block', 'full');
        await this.loadAnimation(basePath, 'sword and shield block idle.glb', 'blockIdle', 'full');
        await this.loadAnimation(basePath, 'sword and shield block (2).glb', 'blockEnd', 'full');
        await this.loadAnimation(basePath, 'sword and shield jump.glb', 'jump', 'full');
        await this.loadAnimation(basePath, 'sword and shield death (2).glb', 'death', 'none');

        // Crouch animations
        await this.loadAnimation(basePath, 'sword and shield crouch.glb', 'crouch', 'full');
        await this.loadAnimation(basePath, 'sword and shield crouch idle.glb', 'crouchIdle', 'full');
        await this.loadAnimation(basePath, 'sword and shield crouch block.glb', 'crouchBlock', 'full');
        await this.loadAnimation(basePath, 'sword and shield crouch block idle.glb', 'crouchBlockIdle', 'full');
        await this.loadAnimation(basePath, 'sword and shield crouching.glb', 'crouchStandUp', 'full');

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
        if (this.settings.isKeyBound('crouch', e.code)) {
            if (this.settings.crouchMode === 'toggle') {
                // Toggle mode: pressing toggles crouch
                if (!this.isCrouchTransitioning) {
                    this.toggleCrouch();
                }
            } else {
                // Hold mode: pressing starts crouch
                if (!this.isCrouching && !this.isCrouchTransitioning) {
                    this.startCrouch();
                }
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
        if (this.settings.isKeyBound('crouch', e.code)) {
            // Hold mode: releasing ends crouch
            if (this.settings.crouchMode === 'hold' && this.isCrouching && !this.isCrouchTransitioning) {
                this.endCrouch();
            }
        }
    }

    onMouseDown(button: number): void {
        console.log(`[PlayerController] onMouseDown(${button}) - isAttacking: ${this.isAttacking}, isBlocking: ${this.isBlocking}`);
        if (button === 0 && !this.isAttacking) {
            console.log(`[PlayerController] -> Triggering attack`);
            this.triggerAttack();
        } else if (button === 2 && !this.isBlocking) {
            console.log(`[PlayerController] -> Triggering block`);
            this.triggerBlock(true);
        }
    }

    onMouseUp(button: number): void {
        console.log(`[PlayerController] onMouseUp(${button})`);
        if (button === 2) {
            console.log(`[PlayerController] -> Ending block`);
            this.triggerBlock(false);
        }
    }

    private triggerAttack(): void {
        if (this.isAttacking || !this.rootNode) return;

        this.isAttacking = true;

        // Play sword swing sound
        this.audioManager.playSwordSheathSound();

        // Choose attack animation based on state and randomness
        let attackAnim: AnimationName;
        if (this.isCrouching) {
            // Crouch attack always uses slash (5)
            attackAnim = 'crouchAttack';
        } else {
            // Random attack: 30% attack(4), 30% slash, 30% slash(3), 10% kick
            const rand = Math.random();
            if (rand < 0.3) {
                attackAnim = 'attack';      // 30%
            } else if (rand < 0.6) {
                attackAnim = 'attack2';     // 30% (slash)
            } else if (rand < 0.9) {
                attackAnim = 'attack3';     // 30% (slash 3)
            } else {
                attackAnim = 'kick';        // 10%
            }
        }

        this.playAnimation(attackAnim, false);

        const currentAttackAnim = this.animations[attackAnim];
        if (currentAttackAnim) {
            // Trigger hit detection at animation midpoint
            const hitFrame = (currentAttackAnim.from + currentAttackAnim.to) / 2;
            let hitTriggered = false;

            const checkHit = () => {
                if (!hitTriggered && currentAttackAnim.animatables[0]) {
                    const currentFrame = currentAttackAnim.animatables[0].masterFrame;
                    if (currentFrame >= hitFrame) {
                        hitTriggered = true;
                        this.triggerAttackHit();
                    }
                }
            };

            const observer = this.scene.onBeforeRenderObservable.add(checkHit);

            // Safety timeout - reset isAttacking after 2 seconds max
            const safetyTimeout = setTimeout(() => {
                if (this.isAttacking) {
                    console.warn('[PlayerController] Attack animation timeout - forcing reset');
                    this.isAttacking = false;
                    this.scene.onBeforeRenderObservable.remove(observer);
                }
            }, 2000);

            currentAttackAnim.onAnimationEndObservable.addOnce(() => {
                clearTimeout(safetyTimeout);
                this.isAttacking = false;
                this.scene.onBeforeRenderObservable.remove(observer);
            });
        } else {
            // Animation doesn't exist - reset immediately
            console.warn(`[PlayerController] Attack animation '${attackAnim}' not found - resetting`);
            this.isAttacking = false;
        }
    }

    private triggerAttackHit(): void {
        if (!this.rootNode || !this.attackHitCallback) return;

        // Play hit sound
        this.audioManager.playHitSound();

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

    /** Get a random idle animation: 70% idle, 10% each for idle2/3/4 */
    private getRandomIdleAnim(): AnimationName {
        const rand = Math.random();
        if (rand < 0.7) {
            return 'idle';
        } else if (rand < 0.8) {
            return 'idle2';
        } else if (rand < 0.9) {
            return 'idle3';
        } else {
            return 'idle4';
        }
    }

    private triggerBlock(active: boolean): void {
        console.log(`[PlayerController] triggerBlock(${active}) - isBlocking: ${this.isBlocking}, isCrouching: ${this.isCrouching}, blockEnd exists: ${!!this.animations.blockEnd}`);

        if (active && !this.isBlocking) {
            this.isBlocking = true;
            // Play block animation once, then switch to blockIdle
            // Use crouch versions if crouching
            const blockAnim = this.isCrouching ? 'crouchBlock' : 'block';
            const blockIdleAnim = this.isCrouching ? 'crouchBlockIdle' : 'blockIdle';

            this.playAnimation(blockAnim, false);

            const anim = this.animations[blockAnim];
            if (anim) {
                // Safety timeout - switch to blockIdle after max time
                const safetyTimeout = setTimeout(() => {
                    if (this.isBlocking && this.currentAnimationName === blockAnim) {
                        console.warn('[PlayerController] Block animation timeout - switching to blockIdle');
                        this.playAnimation(blockIdleAnim, true);
                    }
                }, 2000);

                anim.onAnimationEndObservable.addOnce(() => {
                    clearTimeout(safetyTimeout);
                    // Only switch to blockIdle if still blocking
                    if (this.isBlocking) {
                        this.playAnimation(blockIdleAnim, true);
                    }
                });
            }
        } else if (!active && this.isBlocking) {
            console.log(`[PlayerController] -> Ending block, playing blockEnd animation`);
            this.isBlocking = false;

            // Play block end transition animation before returning to idle
            if (!this.isCrouching && this.animations.blockEnd) {
                this.isBlockEnding = true;  // Prevent update() from overriding
                this.playAnimation('blockEnd', false);

                // Safety timeout for blockEnd
                const safetyTimeout = setTimeout(() => {
                    if (this.isBlockEnding) {
                        console.warn('[PlayerController] BlockEnd animation timeout - forcing reset');
                        this.isBlockEnding = false;
                    }
                }, 2000);

                this.animations.blockEnd.onAnimationEndObservable.addOnce(() => {
                    clearTimeout(safetyTimeout);
                    this.isBlockEnding = false;
                    // Return to random idle after block end animation
                    if (!this.isBlocking && !this.isAttacking) {
                        this.playAnimation(this.getRandomIdleAnim(), true);
                    }
                });
            } else {
                console.log(`[PlayerController] -> blockEnd not played: isCrouching=${this.isCrouching}, blockEnd=${!!this.animations.blockEnd}`);
            }
        }
    }

    private triggerJump(): void {
        if (this.isJumping || !this.rootNode || this.isCrouching) return;

        this.isJumping = true;
        this.verticalVelocity = this.jumpForce; // Apply jump force
        this.groundY = this.rootNode.position.y; // Remember ground level
        this.playAnimation('jump', false);
    }

    private toggleCrouch(): void {
        if (this.isCrouching) {
            this.endCrouch();
        } else {
            this.startCrouch();
        }
    }

    private startCrouch(): void {
        if (this.isCrouching || this.isCrouchTransitioning || this.isJumping) return;

        this.isCrouchTransitioning = true;
        this.playAnimation('crouch', false);

        // Set target for smooth transition after small delay (wait for animation to start)
        setTimeout(() => {
            this.targetMeshY = this.standingMeshY + this.crouchMeshOffset;
        }, 200);

        // Reduce collider size for crouching
        if (this.colliderMesh) {
            this.colliderMesh.ellipsoid = this.crouchingEllipsoid.clone();
            this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.5, 0);
        }

        // Safety timeout for crouch transition
        const safetyTimeout = setTimeout(() => {
            if (this.isCrouchTransitioning) {
                console.warn('[PlayerController] Crouch animation timeout - forcing completion');
                this.isCrouching = true;
                this.isCrouchTransitioning = false;
                this.updateCrouchMetadata();
            }
        }, 2000);

        // When crouch animation ends, switch to crouch idle
        if (this.animations.crouch) {
            this.animations.crouch.onAnimationEndObservable.addOnce(() => {
                clearTimeout(safetyTimeout);
                this.isCrouching = true;
                this.isCrouchTransitioning = false;
                this.updateCrouchMetadata();
                // Play appropriate idle animation
                if (this.isBlocking) {
                    this.playAnimation('crouchBlockIdle', true);
                } else {
                    this.playAnimation('crouchIdle', true);
                }
            });
        } else {
            clearTimeout(safetyTimeout);
            this.isCrouching = true;
            this.isCrouchTransitioning = false;
            this.updateCrouchMetadata();
        }
    }

    private endCrouch(): void {
        if (!this.isCrouching || this.isCrouchTransitioning) return;

        this.isCrouchTransitioning = true;
        this.playAnimation('crouchStandUp', false);

        // Set target for smooth transition after small delay (wait for animation to start)
        setTimeout(() => {
            this.targetMeshY = this.standingMeshY;
        }, 100);

        // Restore collider size for standing
        if (this.colliderMesh) {
            this.colliderMesh.ellipsoid = this.standingEllipsoid.clone();
            this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
        }

        // Safety timeout for stand up transition
        const safetyTimeout = setTimeout(() => {
            if (this.isCrouchTransitioning) {
                console.warn('[PlayerController] StandUp animation timeout - forcing completion');
                this.isCrouching = false;
                this.isCrouchTransitioning = false;
                this.updateCrouchMetadata();
            }
        }, 2000);

        // When stand up animation ends, return to normal idle
        if (this.animations.crouchStandUp) {
            this.animations.crouchStandUp.onAnimationEndObservable.addOnce(() => {
                clearTimeout(safetyTimeout);
                this.isCrouching = false;
                this.isCrouchTransitioning = false;
                this.updateCrouchMetadata();
                if (this.isBlocking) {
                    this.playAnimation('blockIdle', true);
                } else {
                    this.playAnimation(this.getRandomIdleAnim(), true);
                }
            });
        } else {
            clearTimeout(safetyTimeout);
            this.isCrouching = false;
            this.isCrouchTransitioning = false;
            this.updateCrouchMetadata();
        }
    }

    private updateCrouchMetadata(): void {
        if (!this.scene.metadata) {
            this.scene.metadata = {};
        }
        this.scene.metadata.playerCrouching = this.isCrouching;
    }

    get crouching(): boolean {
        return this.isCrouching;
    }

    private update(): void {
        if (!this.rootNode || !this.colliderMesh || this.isDead) return;

        // Don't update if game is paused
        if (this.scene.metadata?.isPaused) return;

        // Smooth crouch transition - interpolate mesh Y position
        if (this.mesh) {
            const currentY = this.mesh.position.y;
            if (Math.abs(currentY - this.targetMeshY) > 0.001) {
                // Lerp towards target
                this.mesh.position.y = currentY + (this.targetMeshY - currentY) * this.crouchTransitionSpeed;
            } else {
                this.mesh.position.y = this.targetMeshY;
            }
        }

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
                // Play landing sound
                this.audioManager.playFallSound();
            }
        }

        const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
        // Crouch speed is much slower (30% of walk speed)
        const speed = this.isCrouching
            ? this.config.walkSpeed * 0.3
            : (this.keys.run ? this.config.runSpeed : this.config.walkSpeed);

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
        if (!this.isAttacking && !this.isJumping && !this.isBlocking && !this.isBlockEnding && !this.isCrouchTransitioning) {
            if (this.isCrouching) {
                // Crouching animations - no movement while crouching
                this.playAnimation('crouchIdle', true);
            } else if (isMoving) {
                this.playAnimation(this.keys.run ? 'run' : 'walk', true);
            } else {
                // Only switch to random idle if not already in an idle animation
                const isInIdle = this.currentAnimationName === 'idle' ||
                    this.currentAnimationName === 'idle2' ||
                    this.currentAnimationName === 'idle3' ||
                    this.currentAnimationName === 'idle4';
                if (!isInIdle) {
                    this.playAnimation(this.getRandomIdleAnim(), true);
                }
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
