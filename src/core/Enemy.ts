import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Ray } from '@babylonjs/core/Culling/ray';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import '@babylonjs/loaders/glTF';
import { EnemyTypeName, EnemyTypeConfig, getEnemyTypeConfig } from './EnemyTypes';
import { AudioManager } from './AudioManager';

export interface EnemyConfig {
    position: Vector3;
    /** Enemy type (vampire, parasite, mutant, skeletonzombie, warrok) */
    type?: EnemyTypeName | string;
    /** Override default scale */
    scale?: number;
    /** Override default health */
    health?: number;
    /** Override default damage */
    damage?: number;
    /** Override default move speed */
    moveSpeed?: number;
    /** Override default attack range */
    attackRange?: number;
    /** Override default detection range */
    detectionRange?: number;
    /** Override default attack cooldown */
    attackCooldown?: number;
}

type EnemyAnimationName = 'idle' | 'walk' | 'run' | 'attack' | 'death' | 'celebrate' | 'jump' | 'roar';

interface EnemyAnimationSet {
    idle: AnimationGroup | null;
    walk: AnimationGroup | null;
    run: AnimationGroup | null;
    attack: AnimationGroup | null;
    death: AnimationGroup | null;
    celebrate: AnimationGroup | null;
    jump: AnimationGroup | null;
    roar: AnimationGroup | null;
}

export type EnemyState = 'idle' | 'chasing' | 'attacking' | 'dead' | 'celebrating';

// Root nodes to exclude from animations
const ROOT_MOTION_NODES = ['Armature', 'Hips', 'mixamorig:Hips'];

export class Enemy {
    private scene: Scene;
    private mesh: AbstractMesh | null = null;
    private rootNode: TransformNode | null = null;
    private colliderMesh: Mesh | null = null;
    private transformNodes: Map<string, TransformNode> = new Map();

    private animations: EnemyAnimationSet = {
        idle: null,
        walk: null,
        run: null,
        attack: null,
        death: null,
        celebrate: null,
        jump: null,
        roar: null
    };
    private currentAnimation: AnimationGroup | null = null;
    private currentAnimationName: EnemyAnimationName | null = null;

    // Jump over obstacles
    private isJumping: boolean = false;
    private jumpVelocityY: number = 0;
    private jumpStartY: number = 0;
    private stuckFrames: number = 0;
    private readonly jumpForce: number = 0.15;
    private readonly gravity: number = -0.008;
    private readonly maxJumpableHeight: number = 1.0; // Can only jump over obstacles up to 1m tall
    private jumpDirection: Vector3 = Vector3.Zero();

    private config: Required<Omit<EnemyConfig, 'type'>> & { type: string };
    private typeConfig: EnemyTypeConfig;
    private health: number;
    private maxHealth: number;
    private state: EnemyState = 'idle';
    private target: TransformNode | null = null;
    private lastAttackTime: number = 0;
    private isAttacking: boolean = false;

    // Enraged state (triggered when hit)
    private isEnraged: boolean = false;
    private enragedEndTime: number = 0;
    private isRoaring: boolean = false;
    private readonly enragedDuration: number = 10000; // 10 seconds
    private readonly enragedSpeedMultiplier: number = 1.8; // Run faster when enraged

    private onDeathCallback: (() => void) | null = null;
    private onPlayerHitCallback: ((damage: number) => void) | null = null;

    // Health bar GUI elements
    private healthBarMesh: Mesh | null = null;
    private healthBarTexture: AdvancedDynamicTexture | null = null;
    private healthBarFill: Rectangle | null = null;
    private healthBarBackground: Rectangle | null = null;
    private healthBarGlow: Rectangle | null = null;

    // Audio
    private audioManager: AudioManager;
    private lastGrowlTime: number = 0;
    private readonly growlInterval: number = 5000; // 5 seconds between growls

    constructor(scene: Scene, config: EnemyConfig) {
        this.scene = scene;

        // Get type configuration (defaults to vampire)
        this.typeConfig = getEnemyTypeConfig(config.type);

        // Merge type defaults with config overrides
        this.config = {
            position: config.position,
            type: config.type ?? 'vampire',
            scale: config.scale ?? this.typeConfig.scale,
            health: config.health ?? this.typeConfig.health,
            damage: config.damage ?? this.typeConfig.damage,
            moveSpeed: config.moveSpeed ?? this.typeConfig.moveSpeed,
            attackRange: config.attackRange ?? this.typeConfig.attackRange,
            detectionRange: config.detectionRange ?? this.typeConfig.detectionRange,
            attackCooldown: config.attackCooldown ?? this.typeConfig.attackCooldown
        };

        this.health = this.config.health;
        this.maxHealth = this.config.health;
        this.audioManager = AudioManager.getInstance();
    }

    async load(basePath: string): Promise<void> {
        // Load enemy mesh based on type
        const modelFile = this.typeConfig.modelFile;
        console.log(`[Enemy] Loading ${this.typeConfig.name} (${modelFile})`);

        const characterResult = await SceneLoader.ImportMeshAsync(
            '',
            basePath,
            modelFile,
            this.scene
        );

        console.log(`[Enemy] Loaded ${this.typeConfig.name} meshes:`, characterResult.meshes.map(m => m.name));
        console.log(`[Enemy] Loaded transform nodes:`, characterResult.transformNodes.map(n => n.name));

        // Create root node for movement
        this.rootNode = new TransformNode('enemyRoot', this.scene);
        this.rootNode.position = this.config.position.clone();

        // Create collider for collision detection
        this.colliderMesh = MeshBuilder.CreateBox('enemyCollider', {
            width: 0.1, height: 0.1, depth: 0.1
        }, this.scene);
        this.colliderMesh.position = this.config.position.clone();
        this.colliderMesh.isVisible = false;
        this.colliderMesh.checkCollisions = true;
        this.colliderMesh.ellipsoid = new Vector3(0.5, 0.9, 0.5);
        this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);

        // The first mesh is usually __root__, parent it to our rootNode
        this.mesh = characterResult.meshes[0];
        this.mesh.parent = this.rootNode;
        this.mesh.position = Vector3.Zero();
        this.mesh.scaling.setAll(this.config.scale);

        // Make all meshes visible
        characterResult.meshes.forEach(mesh => {
            mesh.isVisible = true;
        });

        // Store transform nodes for animation retargeting
        characterResult.transformNodes.forEach(node => {
            this.transformNodes.set(node.name, node);
        });

        console.log(`[Enemy] ${this.typeConfig.name} at ${this.rootNode.position}, Scale: ${this.config.scale}`);
        console.log(`[Enemy] Loaded ${this.typeConfig.name} with ${this.transformNodes.size} transform nodes`);

        // Load animations
        await this.loadAnimation(basePath, 'mutant idle.glb', 'idle');
        await this.loadAnimation(basePath, 'mutant walking.glb', 'walk');
        await this.loadAnimation(basePath, 'mutant run.glb', 'run');
        await this.loadAnimation(basePath, 'mutant swiping.glb', 'attack');
        await this.loadAnimation(basePath, 'mutant dying.glb', 'death');
        await this.loadAnimation(basePath, 'mutant jumping.glb', 'celebrate');
        await this.loadAnimation(basePath, 'mutant jumping.glb', 'jump');
        await this.loadAnimation(basePath, 'mutant roaring.glb', 'roar');

        // Start with idle
        this.playAnimation('idle', true);

        // Create health bar above enemy
        this.createHealthBar();

        // Register update loop
        this.scene.onBeforeRenderObservable.add(() => this.update());

        console.log(`[Enemy] ${this.typeConfig.name} loaded successfully`);
    }

    private createHealthBar(): void {
        if (!this.rootNode) return;

        // Create a plane mesh for the health bar to attach to
        this.healthBarMesh = MeshBuilder.CreatePlane('healthBarPlane', {
            width: 1.0,
            height: 0.08
        }, this.scene);
        this.healthBarMesh.parent = this.rootNode;
        this.healthBarMesh.position = new Vector3(0, this.typeConfig.healthBarHeight, 0); // Above enemy head
        this.healthBarMesh.billboardMode = Mesh.BILLBOARDMODE_ALL; // Always face camera

        // Create GUI texture on the plane
        this.healthBarTexture = AdvancedDynamicTexture.CreateForMesh(
            this.healthBarMesh,
            256,
            24,
            false
        );

        // Background (dark/empty part)
        this.healthBarBackground = new Rectangle('healthBarBg');
        this.healthBarBackground.width = '100%';
        this.healthBarBackground.height = '100%';
        this.healthBarBackground.color = '#555555';
        this.healthBarBackground.thickness = 3;
        this.healthBarBackground.background = '#1a0a0a';
        this.healthBarBackground.cornerRadius = 6;
        this.healthBarTexture.addControl(this.healthBarBackground);

        // Health fill (dark blood red)
        this.healthBarFill = new Rectangle('healthBarFill');
        this.healthBarFill.width = '100%';
        this.healthBarFill.height = '100%';
        this.healthBarFill.color = 'transparent';
        this.healthBarFill.thickness = 0;
        this.healthBarFill.background = 'linear-gradient(to right, #4a0000, #8b0000)';
        this.healthBarFill.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_LEFT;
        this.healthBarFill.cornerRadius = 4;
        this.healthBarBackground.addControl(this.healthBarFill);

        // Glow indicator at the end
        this.healthBarGlow = new Rectangle('healthBarGlow');
        this.healthBarGlow.width = '4px';
        this.healthBarGlow.height = '20px';
        this.healthBarGlow.color = 'transparent';
        this.healthBarGlow.thickness = 0;
        this.healthBarGlow.background = '#ffd700';
        this.healthBarGlow.horizontalAlignment = Rectangle.HORIZONTAL_ALIGNMENT_RIGHT;
        this.healthBarGlow.cornerRadius = 2;
        this.healthBarGlow.shadowColor = '#ffd700';
        this.healthBarGlow.shadowBlur = 15;
        this.healthBarFill.addControl(this.healthBarGlow);

        this.updateHealthBar();
    }

    private updateHealthBar(): void {
        if (!this.healthBarFill || !this.healthBarGlow) return;

        const healthPercent = Math.max(0, this.health / this.maxHealth);
        this.healthBarFill.width = `${healthPercent * 100}%`;

        // Hide glow when at full health
        this.healthBarGlow.isVisible = healthPercent < 1;

        // Use type-specific health bar color
        this.healthBarFill.background = this.typeConfig.healthBarColor;
    }

    private async loadAnimation(basePath: string, filename: string, name: EnemyAnimationName): Promise<void> {
        try {
            const result = await SceneLoader.ImportMeshAsync('', basePath, filename, this.scene);
            const sourceAnimGroup = result.animationGroups[0];

            if (!sourceAnimGroup) {
                console.warn(`[Enemy] No animation group in ${filename}`);
                result.meshes.forEach(mesh => mesh.dispose());
                return;
            }

            sourceAnimGroup.stop();

            // Create new animation group for our character
            const newAnimGroup = new AnimationGroup(name, this.scene);
            let retargetedCount = 0;

            for (const targetedAnim of sourceAnimGroup.targetedAnimations) {
                const sourceNode = targetedAnim.target;
                if (sourceNode && sourceNode.name) {
                    const isRootNode = ROOT_MOTION_NODES.some(rootName =>
                        sourceNode.name.includes(rootName)
                    );
                    const isPositionAnim = targetedAnim.animation.targetProperty === 'position';

                    // Skip root motion for all except death
                    if (isRootNode && isPositionAnim && name !== 'death') {
                        continue;
                    }

                    const targetNode = this.transformNodes.get(sourceNode.name);
                    if (targetNode) {
                        newAnimGroup.addTargetedAnimation(targetedAnim.animation, targetNode);
                        retargetedCount++;
                    }
                }
            }

            if (retargetedCount > 0) {
                this.animations[name] = newAnimGroup;
                console.log(`[Enemy] Animation ${name} ready (${retargetedCount} tracks)`);
            } else {
                newAnimGroup.dispose();
            }

            // Cleanup
            sourceAnimGroup.dispose();
            result.transformNodes.forEach(node => node.dispose());
            result.meshes.forEach(mesh => mesh.dispose());
            result.skeletons.forEach(skeleton => skeleton.dispose());

        } catch (error) {
            console.warn(`[Enemy] Failed to load animation ${name}:`, error);
        }
    }

    private playAnimation(name: EnemyAnimationName, loop: boolean = true): void {
        const anim = this.animations[name];
        if (!anim || this.currentAnimationName === name) return;

        if (this.currentAnimation) {
            this.currentAnimation.stop();
        }

        anim.start(loop, 1.0, anim.from, anim.to, false);
        this.currentAnimation = anim;
        this.currentAnimationName = name;
    }

    private update(): void {
        if (!this.rootNode || this.state === 'dead' || this.state === 'celebrating') return;

        // Don't update if game is paused
        if (this.scene.metadata?.isPaused) return;

        // Play growl sound every 5 seconds - only if player is nearby
        const now = Date.now();
        if (now - this.lastGrowlTime >= this.growlInterval && this.target) {
            const distToPlayer = Vector3.Distance(this.rootNode.position, this.target.position);
            const growlRange = 15; // Only audible within 15 units
            if (distToPlayer <= growlRange) {
                this.lastGrowlTime = now;
                this.audioManager.playBeastGrowlSound();
            }
        }

        // Don't do anything while roaring
        if (this.isRoaring) return;

        // Handle jumping physics
        if (this.isJumping) {
            this.updateJump();
            return; // Don't do normal AI while jumping
        }

        if (!this.target) {
            this.playAnimation('idle', true);
            return;
        }

        const distanceToTarget = Vector3.Distance(this.rootNode.position, this.target.position);

        // Check if enraged mode has expired
        if (this.isEnraged && Date.now() >= this.enragedEndTime) {
            this.isEnraged = false;
            console.log(`[Enemy] ${this.typeConfig.name} calmed down`);

            // Check if player is still in normal detection range
            const playerCrouching = this.scene.metadata?.playerCrouching === true;
            const effectiveDetectionRange = playerCrouching
                ? this.config.detectionRange * 0.5
                : this.config.detectionRange;

            if (distanceToTarget > effectiveDetectionRange) {
                // Player is too far, go back to idle
                this.state = 'idle';
                this.playAnimation('idle', true);
                return;
            }
            // Otherwise continue normal behavior below
        }

        // Reduce detection range when player is crouching (stealth mechanic)
        const playerCrouching = this.scene.metadata?.playerCrouching === true;
        const effectiveDetectionRange = playerCrouching
            ? this.config.detectionRange * 0.5  // 50% of normal detection when crouching
            : this.config.detectionRange;

        // State machine
        if (distanceToTarget <= this.config.attackRange) {
            // In attack range
            this.state = 'attacking';
            this.faceTarget();
            this.tryAttack();
        } else if (this.isEnraged || distanceToTarget <= effectiveDetectionRange) {
            // Chase the player (enraged = always chase, regardless of distance)
            this.state = 'chasing';
            this.chaseTarget();
        } else {
            // Too far, idle (or player is sneaking)
            this.state = 'idle';
            if (!this.isAttacking) {
                this.playAnimation('idle', true);
            }
        }
    }

    private faceTarget(): void {
        if (!this.rootNode || !this.target) return;

        const direction = this.target.position.subtract(this.rootNode.position);
        direction.y = 0;
        const angle = Math.atan2(direction.x, direction.z);
        this.rootNode.rotation.y = angle + Math.PI;
    }

    private chaseTarget(): void {
        if (!this.rootNode || !this.target || this.isAttacking || !this.colliderMesh || this.isJumping) return;

        this.faceTarget();

        // Save position before movement to detect if stuck
        const posBeforeMove = this.colliderMesh.position.clone();

        // Move towards target
        const direction = this.target.position.subtract(this.rootNode.position);
        direction.y = 0;
        direction.normalize();

        // Use faster speed when enraged
        const currentSpeed = this.isEnraged
            ? this.config.moveSpeed * this.enragedSpeedMultiplier
            : this.config.moveSpeed;

        // Use moveWithCollisions for collision detection
        const velocity = direction.scale(currentSpeed);
        this.colliderMesh.moveWithCollisions(velocity);

        // Sync rootNode with collider
        this.rootNode.position.x = this.colliderMesh.position.x;
        this.rootNode.position.z = this.colliderMesh.position.z;

        // Check if stuck (position barely changed but we're trying to move)
        const movedDistance = Vector3.Distance(posBeforeMove, this.colliderMesh.position);
        const expectedDistance = currentSpeed * 0.8; // 80% of expected movement

        if (movedDistance < expectedDistance * 0.1) {
            // Barely moved - might be stuck
            this.stuckFrames++;
            if (this.stuckFrames > 15) { // Stuck for 15+ frames, try to jump
                this.startJump(direction);
                this.stuckFrames = 0;
            }
        } else {
            this.stuckFrames = 0;
        }

        if (!this.isJumping) {
            // Use run animation when enraged, walk otherwise
            this.playAnimation(this.isEnraged ? 'run' : 'walk', true);
        }
    }

    private startJump(direction: Vector3): void {
        if (this.isJumping || !this.rootNode || !this.colliderMesh) return;

        // Check if the obstacle ahead can be jumped over using raycasts
        if (!this.canJumpOverObstacle(direction)) {
            // Obstacle is too tall - don't jump, try to go around instead
            this.stuckFrames = 0;
            return;
        }

        this.isJumping = true;
        this.jumpVelocityY = this.jumpForce;
        this.jumpStartY = this.rootNode.position.y;
        this.jumpDirection = direction.clone();
        this.playAnimation('jump', false);
    }

    private canJumpOverObstacle(direction: Vector3): boolean {
        if (!this.rootNode) return false;

        // Cast a ray forward at jump height to see if the obstacle is low enough
        const rayOrigin = this.rootNode.position.clone();
        rayOrigin.y += this.maxJumpableHeight + 0.2; // Check just above max jumpable height

        const rayDirection = direction.clone();
        rayDirection.y = 0;
        rayDirection.normalize();

        const ray = new Ray(rayOrigin, rayDirection, 2.0); // Check 2 units ahead

        // Get all meshes with collision enabled
        const collisionMeshes = this.scene.meshes.filter(mesh =>
            mesh.checkCollisions && mesh !== this.colliderMesh
        );

        // Check if ray hits anything at jump height
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            return collisionMeshes.includes(mesh);
        });

        // If we hit something at jump height, the obstacle is too tall
        if (hit?.hit) {
            return false;
        }

        // Also verify there IS an obstacle at ground level (otherwise why jump?)
        const groundRayOrigin = this.rootNode.position.clone();
        groundRayOrigin.y += 0.5; // Check at half height

        const groundRay = new Ray(groundRayOrigin, rayDirection, 1.5);
        const groundHit = this.scene.pickWithRay(groundRay, (mesh) => {
            return collisionMeshes.includes(mesh);
        });

        // Only jump if there's actually a low obstacle ahead
        return groundHit?.hit === true;
    }

    private updateJump(): void {
        if (!this.rootNode || !this.colliderMesh) return;

        // Apply gravity
        this.jumpVelocityY += this.gravity;
        this.rootNode.position.y += this.jumpVelocityY;
        this.colliderMesh.position.y = this.rootNode.position.y;

        // Move forward while jumping using collision detection
        // This prevents going through walls/pillars even while jumping
        const forwardSpeed = this.config.moveSpeed * 1.5;
        const forwardVelocity = this.jumpDirection.scale(forwardSpeed);

        // Use moveWithCollisions for horizontal movement to respect walls/pillars
        this.colliderMesh.moveWithCollisions(new Vector3(forwardVelocity.x, 0, forwardVelocity.z));

        // Sync rootNode with collider
        this.rootNode.position.x = this.colliderMesh.position.x;
        this.rootNode.position.z = this.colliderMesh.position.z;

        // Check if landed
        if (this.rootNode.position.y <= this.jumpStartY) {
            this.rootNode.position.y = this.jumpStartY;
            this.colliderMesh.position.y = this.jumpStartY;
            this.isJumping = false;
            this.jumpVelocityY = 0;
            this.playAnimation('walk', true);
        }
    }

    private tryAttack(): void {
        const now = Date.now();
        if (this.isAttacking || now - this.lastAttackTime < this.config.attackCooldown) {
            // While waiting for cooldown, play idle
            if (!this.isAttacking && this.currentAnimationName !== 'idle') {
                this.playAnimation('idle', true);
            }
            return;
        }

        this.isAttacking = true;
        this.lastAttackTime = now;
        this.playAnimation('attack', false);

        if (this.animations.attack) {
            // Deal damage at MIDPOINT of animation (when the hit visually lands)
            const hitFrame = (this.animations.attack.from + this.animations.attack.to) / 2;
            let hitTriggered = false;

            const checkHit = () => {
                if (!hitTriggered && this.animations.attack?.animatables[0]) {
                    const currentFrame = this.animations.attack.animatables[0].masterFrame;
                    if (currentFrame >= hitFrame) {
                        hitTriggered = true;
                        // Deal damage at midpoint
                        if (this.state !== 'dead' && this.target) {
                            const dist = Vector3.Distance(this.rootNode!.position, this.target.position);
                            if (dist <= this.config.attackRange * 1.5) {
                                this.onPlayerHitCallback?.(this.config.damage);
                            }
                        }
                    }
                }
            };

            const observer = this.scene.onBeforeRenderObservable.add(checkHit);

            this.animations.attack.onAnimationEndObservable.addOnce(() => {
                this.scene.onBeforeRenderObservable.remove(observer);
                this.isAttacking = false;
                // Go back to idle after attack
                if (this.state !== 'dead') {
                    this.playAnimation('idle', true);
                }
            });
        } else {
            this.isAttacking = false;
        }
    }

    setTarget(target: TransformNode): void {
        this.target = target;
    }

    /**
     * Apply damage to the enemy
     * @param damage Amount of damage to apply
     * @param isRanged Whether the damage comes from a ranged weapon (arrow, etc.)
     *                 Only ranged attacks trigger the enraged state with roaring
     */
    takeDamage(damage: number, isRanged: boolean = false): void {
        if (this.state === 'dead') return;

        this.health -= damage;
        console.log(`[Enemy] Took ${damage} damage (ranged: ${isRanged}), health: ${this.health}`);

        // Update health bar
        this.updateHealthBar();

        if (this.health <= 0) {
            this.die();
            return;
        }

        // Only trigger enraged state for ranged attacks (arrows, etc.)
        // Melee attacks (sword) don't cause the enemy to roar and become enraged
        if (isRanged && this.target && this.rootNode && !this.isRoaring) {
            const distanceToPlayer = Vector3.Distance(this.rootNode.position, this.target.position);
            const enrageRange = this.config.detectionRange * 2;

            if (distanceToPlayer <= enrageRange) {
                if (this.isEnraged) {
                    // Already enraged - just extend the timer
                    this.enragedEndTime = Date.now() + this.enragedDuration;
                } else {
                    // Not enraged yet - trigger full roar sequence
                    this.triggerEnragedState();
                }
            }
        }
    }

    private triggerEnragedState(): void {
        if (this.isRoaring || this.state === 'dead') return;

        console.log(`[Enemy] ${this.typeConfig.name} is enraged! Roaring...`);

        // Play roar animation
        this.isRoaring = true;
        this.isAttacking = false; // Cancel any current attack
        this.playAnimation('roar', false);

        // When roar finishes, start the enraged chase
        if (this.animations.roar) {
            this.animations.roar.onAnimationEndObservable.addOnce(() => {
                this.isRoaring = false;
                this.isEnraged = true;
                this.enragedEndTime = Date.now() + this.enragedDuration;
                console.log(`[Enemy] ${this.typeConfig.name} starts enraged chase for ${this.enragedDuration / 1000}s`);
            });
        } else {
            // No roar animation, just start enraged immediately
            this.isRoaring = false;
            this.isEnraged = true;
            this.enragedEndTime = Date.now() + this.enragedDuration;
        }
    }

    private die(): void {
        this.state = 'dead';
        this.playAnimation('death', false);
        console.log(`[Enemy] ${this.typeConfig.name} died`);

        // Hide health bar when dead
        if (this.healthBarMesh) {
            this.healthBarMesh.isVisible = false;
        }

        const onDeathComplete = () => {
            this.onDeathCallback?.();
            // Dispose immediately after death animation completes
            this.dispose();
        };

        if (this.animations.death) {
            this.animations.death.onAnimationEndObservable.addOnce(onDeathComplete);
        } else {
            onDeathComplete();
        }
    }

    onDeath(callback: () => void): void {
        this.onDeathCallback = callback;
    }

    onPlayerHit(callback: (damage: number) => void): void {
        this.onPlayerHitCallback = callback;
    }

    get position(): Vector3 {
        return this.rootNode?.position ?? Vector3.Zero();
    }

    get currentState(): EnemyState {
        return this.state;
    }

    get isDead(): boolean {
        return this.state === 'dead';
    }

    get rootMesh(): TransformNode | null {
        return this.rootNode;
    }

    get enemyType(): string {
        return this.config.type;
    }

    get typeName(): string {
        return this.typeConfig.name;
    }

    /**
     * Make enemy celebrate (stop attacking and play jump animation)
     */
    celebrate(): void {
        if (this.state === 'dead') return;

        this.state = 'celebrating';
        this.isAttacking = false;
        this.playAnimation('celebrate', true);
    }

    dispose(): void {
        Object.values(this.animations).forEach(anim => anim?.dispose());
        this.healthBarTexture?.dispose();
        this.healthBarMesh?.dispose();
        this.mesh?.dispose();
        this.rootNode?.dispose();
        this.colliderMesh?.dispose();
    }
}
