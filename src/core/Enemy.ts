import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import '@babylonjs/loaders/glTF';
import { EnemyTypeName, EnemyTypeConfig, getEnemyTypeConfig } from './EnemyTypes';

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

type EnemyAnimationName = 'idle' | 'walk' | 'attack' | 'death' | 'celebrate';

interface EnemyAnimationSet {
    idle: AnimationGroup | null;
    walk: AnimationGroup | null;
    attack: AnimationGroup | null;
    death: AnimationGroup | null;
    celebrate: AnimationGroup | null;
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
        attack: null,
        death: null,
        celebrate: null
    };
    private currentAnimation: AnimationGroup | null = null;
    private currentAnimationName: EnemyAnimationName | null = null;

    private config: Required<Omit<EnemyConfig, 'type'>> & { type: string };
    private typeConfig: EnemyTypeConfig;
    private health: number;
    private maxHealth: number;
    private state: EnemyState = 'idle';
    private target: TransformNode | null = null;
    private lastAttackTime: number = 0;
    private isAttacking: boolean = false;

    private onDeathCallback: (() => void) | null = null;
    private onPlayerHitCallback: ((damage: number) => void) | null = null;

    // Health bar GUI elements
    private healthBarMesh: Mesh | null = null;
    private healthBarTexture: AdvancedDynamicTexture | null = null;
    private healthBarFill: Rectangle | null = null;
    private healthBarBackground: Rectangle | null = null;
    private healthBarGlow: Rectangle | null = null;

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
        await this.loadAnimation(basePath, 'mutant swiping.glb', 'attack');
        await this.loadAnimation(basePath, 'mutant dying.glb', 'death');
        await this.loadAnimation(basePath, 'mutant jumping.glb', 'celebrate');

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

        if (!this.target) {
            this.playAnimation('idle', true);
            return;
        }

        const distanceToTarget = Vector3.Distance(this.rootNode.position, this.target.position);

        // State machine
        if (distanceToTarget <= this.config.attackRange) {
            // In attack range
            this.state = 'attacking';
            this.faceTarget();
            this.tryAttack();
        } else if (distanceToTarget <= this.config.detectionRange) {
            // Chase the player
            this.state = 'chasing';
            this.chaseTarget();
        } else {
            // Too far, idle
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
        if (!this.rootNode || !this.target || this.isAttacking || !this.colliderMesh) return;

        this.faceTarget();

        // Move towards target
        const direction = this.target.position.subtract(this.rootNode.position);
        direction.y = 0;
        direction.normalize();

        // Use moveWithCollisions for collision detection
        const velocity = direction.scale(this.config.moveSpeed);
        this.colliderMesh.moveWithCollisions(velocity);

        // Sync rootNode with collider
        this.rootNode.position.x = this.colliderMesh.position.x;
        this.rootNode.position.z = this.colliderMesh.position.z;

        this.playAnimation('walk', true);
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
            this.animations.attack.onAnimationEndObservable.addOnce(() => {
                // Deal damage at end of attack animation
                if (this.state !== 'dead' && this.target) {
                    const dist = Vector3.Distance(this.rootNode!.position, this.target.position);
                    if (dist <= this.config.attackRange * 1.5) {
                        this.onPlayerHitCallback?.(this.config.damage);
                    }
                }
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

    takeDamage(damage: number): void {
        if (this.state === 'dead') return;

        this.health -= damage;
        console.log(`[Enemy] Took ${damage} damage, health: ${this.health}`);

        // Update health bar
        this.updateHealthBar();

        if (this.health <= 0) {
            this.die();
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
