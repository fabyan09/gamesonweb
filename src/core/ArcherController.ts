import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Ray } from '@babylonjs/core/Culling/ray';
import '@babylonjs/loaders/glTF';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { GameSettings } from './GameSettings';
import { CharacterController } from './CharacterClass';

export interface ArcherConfig {
    position?: Vector3;
    scale?: number;
    rotationSpeed?: number;
    walkSpeed?: number;
    runSpeed?: number;
    meshYOffset?: number;
}

interface ArcherAnimationSet {
    idle: AnimationGroup | null;
    idle2: AnimationGroup | null;
    walk: AnimationGroup | null;
    run: AnimationGroup | null;
    // Bow animations
    drawArrow: AnimationGroup | null;
    aimOverdraw: AnimationGroup | null;
    aimRecoil: AnimationGroup | null;
    // Aim walk animations
    aimWalkForward: AnimationGroup | null;
    aimWalkBack: AnimationGroup | null;
    aimWalkLeft: AnimationGroup | null;
    aimWalkRight: AnimationGroup | null;
    // Other
    block: AnimationGroup | null;
    death: AnimationGroup | null;
    dodge: AnimationGroup | null;
}

type ArcherAnimationName = keyof ArcherAnimationSet;

// Root nodes to exclude from animations (to prevent root motion)
const ROOT_MOTION_NODES = ['Armature', 'Hips', 'mixamorig:Hips'];

export class ArcherController implements CharacterController {
    private scene: Scene;
    private mesh: AbstractMesh | null = null;
    private rootNode: TransformNode | null = null;
    private colliderMesh: Mesh | null = null;
    private animations: ArcherAnimationSet = {
        idle: null,
        idle2: null,
        walk: null,
        run: null,
        drawArrow: null,
        aimOverdraw: null,
        aimRecoil: null,
        aimWalkForward: null,
        aimWalkBack: null,
        aimWalkLeft: null,
        aimWalkRight: null,
        block: null,
        death: null,
        dodge: null
    };
    private currentAnimation: AnimationGroup | null = null;
    private currentAnimationName: ArcherAnimationName | null = null;

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

    private config: Required<ArcherConfig>;
    private velocity: Vector3 = Vector3.Zero();
    private isAiming = false;
    private isDrawingArrow = false;
    private isShooting = false;
    private isBlocking = false;
    private isDead = false;
    private isCrouching = false;
    private camera: ThirdPersonCamera | null = null;
    private skeleton: Skeleton | null = null;
    private transformNodes: Map<string, TransformNode> = new Map();
    private settings: GameSettings;

    // Mesh Y offset
    private readonly standingMeshY = -0.08;
    private readonly standingEllipsoid = new Vector3(0.4, 0.9, 0.4);

    // Attack callback
    private attackHitCallback: ((position: Vector3, range: number) => void) | null = null;
    private readonly attackRange = 15; // Archers have longer range

    // Crosshair element
    private crosshairElement: HTMLElement | null = null;

    constructor(scene: Scene, config: ArcherConfig = {}) {
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
        // Load character mesh (Erika Archer)
        const characterResult = await SceneLoader.ImportMeshAsync(
            '',
            basePath,
            'Erika Archer With Bow Arrow.glb',
            this.scene
        );

        // Create a simple collider mesh for collision detection
        this.colliderMesh = MeshBuilder.CreateBox('archerCollider', {
            width: 0.1,
            height: 0.1,
            depth: 0.1
        }, this.scene);
        this.colliderMesh.position = this.config.position.clone();
        this.colliderMesh.isVisible = false;
        this.colliderMesh.checkCollisions = true;
        this.colliderMesh.ellipsoid = new Vector3(0.4, 0.9, 0.4);
        this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);

        // Create a root node for proper rotation control
        this.rootNode = new TransformNode('archerRoot', this.scene);
        this.rootNode.position = this.config.position.clone();

        this.mesh = characterResult.meshes[0];
        this.mesh.parent = this.rootNode;
        this.mesh.position = new Vector3(0, this.standingMeshY, 0);
        this.mesh.scaling.setAll(this.config.scale);

        // Get skeleton
        this.skeleton = characterResult.skeletons[0] || null;
        console.log(`[ArcherController] Skeleton: ${this.skeleton?.name}, bones: ${this.skeleton?.bones.length}`);

        // Store all transform nodes for animation retargeting
        characterResult.transformNodes.forEach(node => {
            this.transformNodes.set(node.name, node);
        });
        console.log(`[ArcherController] Stored ${this.transformNodes.size} transform nodes`);

        // Make all meshes visible
        characterResult.meshes.forEach(mesh => {
            mesh.isVisible = true;
        });

        console.log(`[ArcherController] Loaded ${characterResult.meshes.length} meshes, scale: ${this.config.scale}`);

        // Load animations
        await this.loadAnimation(basePath, 'standing idle 01.glb', 'idle', 'full');
        await this.loadAnimation(basePath, 'standing idle 02 looking.glb', 'idle2', 'full');
        await this.loadAnimation(basePath, 'standing walk forward.glb', 'walk', 'full');
        await this.loadAnimation(basePath, 'standing run forward.glb', 'run', 'full');
        await this.loadAnimation(basePath, 'standing draw arrow.glb', 'drawArrow', 'full');
        await this.loadAnimation(basePath, 'standing aim overdraw.glb', 'aimOverdraw', 'full');
        await this.loadAnimation(basePath, 'standing aim recoil.glb', 'aimRecoil', 'full');
        await this.loadAnimation(basePath, 'standing aim walk forward.glb', 'aimWalkForward', 'full');
        await this.loadAnimation(basePath, 'standing aim walk back.glb', 'aimWalkBack', 'full');
        await this.loadAnimation(basePath, 'standing aim walk left.glb', 'aimWalkLeft', 'full');
        await this.loadAnimation(basePath, 'standing aim walk right.glb', 'aimWalkRight', 'full');
        await this.loadAnimation(basePath, 'standing block.glb', 'block', 'full');
        await this.loadAnimation(basePath, 'standing death backward 01.glb', 'death', 'none');
        await this.loadAnimation(basePath, 'standing dodge backward.glb', 'dodge', 'full');

        // Start with idle animation
        this.playAnimation('idle', true);

        // Setup input handlers
        this.setupInput();

        // Register update loop
        this.scene.onBeforeRenderObservable.add(() => this.update());

        // Get crosshair element
        this.crosshairElement = document.getElementById('crosshair');

        console.log('[ArcherController] Archer loaded successfully');
    }

    private async loadAnimation(basePath: string, filename: string, name: ArcherAnimationName, rootMotionMode: 'full' | 'horizontal' | 'none' = 'none'): Promise<void> {
        if (this.transformNodes.size === 0) {
            console.warn(`[ArcherController] No transform nodes to retarget animation ${name}`);
            return;
        }

        try {
            console.log(`[ArcherController] Loading animation file: ${filename}`);
            const result = await SceneLoader.ImportMeshAsync('', basePath, filename, this.scene);

            const sourceAnimGroup = result.animationGroups[0];

            if (!sourceAnimGroup) {
                console.warn(`[ArcherController] No animation group in ${filename}`);
                result.meshes.forEach(mesh => mesh.dispose());
                return;
            }

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
                            continue;
                        } else if (rootMotionMode === 'horizontal') {
                            const anim = targetedAnim.animation;
                            const keys = anim.getKeys();
                            if (keys.length > 0) {
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

            if (retargetedCount > 0) {
                this.animations[name] = newAnimGroup;
                console.log(`[ArcherController] Animation ${name} ready (${retargetedCount} tracks)`);
            } else {
                console.warn(`[ArcherController] No animations retargeted for ${name}`);
                newAnimGroup.dispose();
            }

            // Dispose source animation group
            sourceAnimGroup.dispose();

            // Remove the loaded meshes, transform nodes and skeletons
            result.transformNodes.forEach(node => node.dispose());
            result.meshes.forEach(mesh => mesh.dispose());
            result.skeletons.forEach(skeleton => skeleton.dispose());

        } catch (error) {
            console.warn(`[ArcherController] Failed to load animation ${name}:`, error);
        }
    }

    private playAnimation(name: ArcherAnimationName, loop: boolean = true): void {
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
        console.log(`[ArcherController] onMouseDown(${button})`);
        if (button === 0 && !this.isAiming && !this.isShooting) {
            // Left click - start aiming sequence
            this.startAiming();
        } else if (button === 2 && !this.isBlocking) {
            // Right click - block (limited, just the animation)
            this.triggerBlock();
        }
    }

    onMouseUp(button: number): void {
        console.log(`[ArcherController] onMouseUp(${button})`);
        if (button === 0 && this.isAiming) {
            // Release left click - shoot arrow
            this.shootArrow();
        }
    }

    private showCrosshair(aiming: boolean = false): void {
        if (this.crosshairElement) {
            this.crosshairElement.classList.add('visible');
            if (aiming) {
                this.crosshairElement.classList.add('aiming');
            } else {
                this.crosshairElement.classList.remove('aiming');
            }
        }
    }

    private hideCrosshair(): void {
        if (this.crosshairElement) {
            this.crosshairElement.classList.remove('visible', 'aiming');
        }
    }

    private startAiming(): void {
        if (this.isAiming || this.isDrawingArrow || this.isShooting || this.isBlocking) return;

        this.isDrawingArrow = true;
        this.showCrosshair(false);
        this.playAnimation('drawArrow', false);

        const drawAnim = this.animations.drawArrow;
        if (drawAnim) {
            // Safety timeout
            const safetyTimeout = setTimeout(() => {
                if (this.isDrawingArrow) {
                    console.warn('[ArcherController] Draw arrow animation timeout');
                    this.isDrawingArrow = false;
                    this.isAiming = true;
                    this.showCrosshair(true);
                }
            }, 2000);

            drawAnim.onAnimationEndObservable.addOnce(() => {
                clearTimeout(safetyTimeout);
                this.isDrawingArrow = false;
                this.isAiming = true;
                this.showCrosshair(true);
                // Now loop the aim overdraw animation
                this.playAnimation('aimOverdraw', true);
            });
        } else {
            this.isDrawingArrow = false;
            this.isAiming = true;
            this.showCrosshair(true);
            this.playAnimation('aimOverdraw', true);
        }
    }

    private shootArrow(): void {
        if (!this.isAiming || this.isShooting) return;

        this.isAiming = false;
        this.isShooting = true;
        this.hideCrosshair();
        this.playAnimation('aimRecoil', false);

        // Trigger hit detection at animation midpoint
        const recoilAnim = this.animations.aimRecoil;
        if (recoilAnim) {
            const hitFrame = (recoilAnim.from + recoilAnim.to) / 3; // Early in the animation
            let hitTriggered = false;

            const checkHit = () => {
                if (!hitTriggered && recoilAnim.animatables[0]) {
                    const currentFrame = recoilAnim.animatables[0].masterFrame;
                    if (currentFrame >= hitFrame) {
                        hitTriggered = true;
                        this.triggerArrowHit();
                    }
                }
            };

            const observer = this.scene.onBeforeRenderObservable.add(checkHit);

            // Safety timeout
            const safetyTimeout = setTimeout(() => {
                if (this.isShooting) {
                    console.warn('[ArcherController] Aim recoil animation timeout');
                    this.isShooting = false;
                    this.scene.onBeforeRenderObservable.remove(observer);
                }
            }, 2000);

            recoilAnim.onAnimationEndObservable.addOnce(() => {
                clearTimeout(safetyTimeout);
                this.isShooting = false;
                this.scene.onBeforeRenderObservable.remove(observer);
            });
        } else {
            this.isShooting = false;
        }
    }

    private triggerArrowHit(): void {
        if (!this.rootNode || !this.attackHitCallback) return;

        // Calculate attack position using raycast from archer forward
        const forward = new Vector3(
            Math.sin(this.rootNode.rotation.y + Math.PI),
            0,
            Math.cos(this.rootNode.rotation.y + Math.PI)
        );

        // Raycast to find what we hit
        const rayOrigin = this.rootNode.position.clone();
        rayOrigin.y += 1.5; // Chest height

        const ray = new Ray(rayOrigin, forward, this.attackRange);
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            // Only hit enemies (meshes with collision that aren't the player)
            return mesh.checkCollisions && mesh !== this.colliderMesh;
        });

        if (hit?.pickedPoint) {
            // Hit something - deal damage at that point
            this.attackHitCallback(hit.pickedPoint, 2.0);
        } else {
            // No hit - use max range position
            const maxRangePosition = rayOrigin.add(forward.scale(this.attackRange));
            this.attackHitCallback(maxRangePosition, 2.0);
        }
    }

    private triggerBlock(): void {
        if (this.isBlocking || this.isAiming || this.isShooting) return;

        this.isBlocking = true;
        this.playAnimation('block', false);

        const blockAnim = this.animations.block;
        if (blockAnim) {
            // Safety timeout
            const safetyTimeout = setTimeout(() => {
                if (this.isBlocking) {
                    console.warn('[ArcherController] Block animation timeout');
                    this.isBlocking = false;
                }
            }, 2000);

            blockAnim.onAnimationEndObservable.addOnce(() => {
                clearTimeout(safetyTimeout);
                this.isBlocking = false;
                // Return to idle
                this.playAnimation(this.getRandomIdleAnim(), true);
            });
        } else {
            this.isBlocking = false;
        }
    }

    private getRandomIdleAnim(): ArcherAnimationName {
        return Math.random() < 0.8 ? 'idle' : 'idle2';
    }

    onAttackHit(callback: (position: Vector3, range: number) => void): void {
        this.attackHitCallback = callback;
    }

    private update(): void {
        if (!this.rootNode || !this.colliderMesh || this.isDead) return;

        // Don't update if game is paused
        if (this.scene.metadata?.isPaused) return;

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

        // Apply movement (slower when aiming)
        if (isMoving && !this.isBlocking) {
            const inputAngle = Math.atan2(moveX, moveZ);
            const moveAngle = cameraAngle + inputAngle;

            // Rotate character to face movement direction (unless aiming)
            if (!this.isAiming) {
                this.rootNode.rotation.y = moveAngle + Math.PI;
            }

            // Slower movement when aiming
            const actualSpeed = this.isAiming ? speed * 0.5 : speed;

            // Calculate movement velocity
            const velocity = new Vector3(
                Math.sin(moveAngle) * actualSpeed,
                0,
                Math.cos(moveAngle) * actualSpeed
            );

            // Move with collision detection
            this.colliderMesh.moveWithCollisions(velocity);

            // Sync rootNode position with collider
            this.rootNode.position.x = this.colliderMesh.position.x;
            this.rootNode.position.z = this.colliderMesh.position.z;
        }

        // Keep collider synced with player position
        this.colliderMesh.position.copyFrom(this.rootNode.position);

        // Update animation based on state
        if (!this.isDrawingArrow && !this.isShooting && !this.isBlocking) {
            if (this.isAiming) {
                // Aiming animations based on movement
                if (isMoving) {
                    // Determine which aim walk animation to use based on relative movement
                    if (this.keys.forward && !this.keys.backward) {
                        this.playAnimation('aimWalkForward', true);
                    } else if (this.keys.backward && !this.keys.forward) {
                        this.playAnimation('aimWalkBack', true);
                    } else if (this.keys.left && !this.keys.right) {
                        this.playAnimation('aimWalkLeft', true);
                    } else if (this.keys.right && !this.keys.left) {
                        this.playAnimation('aimWalkRight', true);
                    } else {
                        this.playAnimation('aimWalkForward', true);
                    }
                } else {
                    this.playAnimation('aimOverdraw', true);
                }
            } else if (isMoving) {
                this.playAnimation(this.keys.run ? 'run' : 'walk', true);
            } else {
                // Only switch to idle if not already in an idle animation
                const isInIdle = this.currentAnimationName === 'idle' || this.currentAnimationName === 'idle2';
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

    get crouching(): boolean {
        return this.isCrouching;
    }

    dispose(): void {
        Object.values(this.animations).forEach(anim => anim?.dispose());
        this.mesh?.dispose();
        this.colliderMesh?.dispose();
    }
}
