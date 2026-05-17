import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Ray } from '@babylonjs/core/Culling/ray';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import '@babylonjs/loaders/glTF';
import { ThirdPersonCamera } from '../core/ThirdPersonCamera';
import { GameSettings } from '../core/GameSettings';
import { CharacterController } from './CharacterClass';
import { PlayerProgressionModifiers } from './CharacterClass';
import { AudioManager } from '../systems/AudioManager';
import { GamepadManager, GamepadButton } from '../core/GamepadManager';

export interface WizardConfig {
    position?: Vector3;
    scale?: number;
    rotationSpeed?: number;
    walkSpeed?: number;
    runSpeed?: number;
    meshYOffset?: number;
}

interface WizardAnimationSet {
    idle: AnimationGroup | null;
    idle2: AnimationGroup | null;
    idle3: AnimationGroup | null;
    walk: AnimationGroup | null;
    run: AnimationGroup | null;
    jump: AnimationGroup | null;
    // Magic animations
    castSpell: AnimationGroup | null;
    magicAttack1: AnimationGroup | null;
    magicAttack2: AnimationGroup | null;
    magicAttack3: AnimationGroup | null;
    areaAttack: AnimationGroup | null;
    doorOpen: AnimationGroup | null;
    // Block
    blockStart: AnimationGroup | null;
    blockIdle: AnimationGroup | null;
    blockEnd: AnimationGroup | null;
    // Crouch
    crouchIdle: AnimationGroup | null;
    crouchWalk: AnimationGroup | null;
    standToCrouch: AnimationGroup | null;
    crouchToStand: AnimationGroup | null;
    // Death
    death: AnimationGroup | null;
}

type WizardAnimationName = keyof WizardAnimationSet;

// Root nodes to exclude from animations (to prevent root motion)
const ROOT_MOTION_NODES = ['Armature', 'Hips', 'mixamorig:Hips'];

// Magic projectile interface
interface MagicProjectile {
    mesh: AbstractMesh;
    particles: ParticleSystem;
    direction: Vector3;
    speed: number;
    distanceTraveled: number;
    maxDistance: number;
    hasHit: boolean;
}

// Magic color palette for variety
interface MagicColor {
    emissive: Color3;
    diffuse: Color3;
    particle1: Color4;
    particle2: Color4;
    particleDead: Color4;
}

const MAGIC_COLORS: MagicColor[] = [
    // Blue (arcane)
    {
        emissive: new Color3(0.3, 0.5, 1.0),
        diffuse: new Color3(0.2, 0.4, 0.9),
        particle1: new Color4(0.4, 0.6, 1, 1),
        particle2: new Color4(0.6, 0.3, 1, 1),
        particleDead: new Color4(0.2, 0.1, 0.5, 0)
    },
    // Purple (void)
    {
        emissive: new Color3(0.7, 0.2, 1.0),
        diffuse: new Color3(0.5, 0.1, 0.8),
        particle1: new Color4(0.8, 0.3, 1, 1),
        particle2: new Color4(0.5, 0.1, 0.9, 1),
        particleDead: new Color4(0.3, 0.0, 0.4, 0)
    },
    // Green (nature)
    {
        emissive: new Color3(0.2, 1.0, 0.4),
        diffuse: new Color3(0.1, 0.8, 0.3),
        particle1: new Color4(0.3, 1, 0.5, 1),
        particle2: new Color4(0.1, 0.9, 0.3, 1),
        particleDead: new Color4(0.0, 0.4, 0.1, 0)
    },
    // Orange (fire)
    {
        emissive: new Color3(1.0, 0.5, 0.1),
        diffuse: new Color3(0.9, 0.4, 0.0),
        particle1: new Color4(1, 0.6, 0.2, 1),
        particle2: new Color4(1, 0.3, 0.0, 1),
        particleDead: new Color4(0.5, 0.1, 0.0, 0)
    },
    // Cyan (ice)
    {
        emissive: new Color3(0.2, 0.9, 1.0),
        diffuse: new Color3(0.1, 0.8, 0.9),
        particle1: new Color4(0.4, 1, 1, 1),
        particle2: new Color4(0.2, 0.8, 1, 1),
        particleDead: new Color4(0.1, 0.4, 0.5, 0)
    },
    // Pink (chaos)
    {
        emissive: new Color3(1.0, 0.3, 0.6),
        diffuse: new Color3(0.9, 0.2, 0.5),
        particle1: new Color4(1, 0.5, 0.7, 1),
        particle2: new Color4(1, 0.2, 0.5, 1),
        particleDead: new Color4(0.5, 0.1, 0.3, 0)
    }
];

export class WizardController implements CharacterController {
    private scene: Scene;
    private mesh: AbstractMesh | null = null;
    private rootNode: TransformNode | null = null;
    private colliderMesh: Mesh | null = null;
    private animations: WizardAnimationSet = {
        idle: null,
        idle2: null,
        idle3: null,
        walk: null,
        run: null,
        jump: null,
        castSpell: null,
        magicAttack1: null,
        magicAttack2: null,
        magicAttack3: null,
        areaAttack: null,
        doorOpen: null,
        blockStart: null,
        blockIdle: null,
        blockEnd: null,
        crouchIdle: null,
        crouchWalk: null,
        standToCrouch: null,
        crouchToStand: null,
        death: null
    };
    private currentAnimation: AnimationGroup | null = null;
    private currentAnimationName: WizardAnimationName | null = null;

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

    private config: Required<WizardConfig>;
    private velocity: Vector3 = Vector3.Zero();
    private isCasting = false;
    private isBlocking = false;
    private isDead = false;
    private isCrouching = false;
    private isJumping = false;
    private verticalVelocity = 0;
    private readonly jumpForce = 0.15;
    private readonly gravity = 0.008;
    private camera: ThirdPersonCamera | null = null;
    private skeleton: Skeleton | null = null;
    private transformNodes: Map<string, TransformNode> = new Map();
    private settings: GameSettings;

    // Stamina system
    private stamina: number = 100;
    private readonly baseMaxStamina: number = 100;
    private readonly baseStaminaRegenRate: number = 8; // per second
    private readonly baseRunStaminaDrain: number = 15; // per second while running
    private readonly baseBlockStaminaDrain: number = 10; // per second while blocking
    private readonly baseCastStaminaCost: number = 25; // per cast
    private movementMultiplier: number = 1;
    private maxStaminaBonus: number = 0;
    private staminaRegenBonus: number = 0;
    private staminaDrainMultiplier: number = 1;
    private attackCostMultiplier: number = 1;

    // Mesh Y offset
    private readonly standingMeshY = -0.06;
    private readonly crouchMeshOffset = -0.45;  // Additional offset when crouching
    private readonly standingEllipsoid = new Vector3(0.4, 0.9, 0.4);
    private readonly crouchingEllipsoid = new Vector3(0.4, 0.5, 0.4);
    private targetMeshY = -0.08;  // Target Y position for smooth crouch transition
    private readonly crouchTransitionSpeed = 0.09;  // How fast to interpolate

    // Attack callback
    private attackHitCallback: ((position: Vector3, range: number) => void) | null = null;
    private readonly attackRange = 20; // Wizards have the longest range

    // Crosshair element
    private crosshairElement: HTMLElement | null = null;

    // Magic projectile system
    private activeProjectiles: MagicProjectile[] = [];
    private readonly projectileSpeed = 1.5;
    private magicTexture: Texture | null = null;

    // Attack cooldown
    private canAttack = true;
    private attackCooldown = 800; // ms between attacks

    private audioManager: AudioManager;
    private gamepadManager: GamepadManager;

    // Store magic trajectory for hit detection
    private lastMagicTrajectory: { origin: Vector3; direction: Vector3; maxDistance: number } | null = null;

    constructor(scene: Scene, config: WizardConfig = {}) {
        this.scene = scene;
        this.settings = GameSettings.getInstance();
        this.audioManager = AudioManager.getInstance();
        this.gamepadManager = GamepadManager.getInstance();
        this.stamina = this.baseMaxStamina;
        this.config = {
            position: config.position ?? new Vector3(0, 0, 0),
            scale: config.scale ?? 0.01,
            rotationSpeed: config.rotationSpeed ?? 0.05,
            walkSpeed: config.walkSpeed ?? 0.045,
            runSpeed: config.runSpeed ?? 0.09,
            meshYOffset: config.meshYOffset ?? 0
        };
    }

    async load(basePath: string): Promise<void> {
        // Load character mesh
        const characterResult = await SceneLoader.ImportMeshAsync(
            '',
            basePath,
            'Wizard.glb',
            this.scene
        );

        // Create a simple collider mesh for collision detection
        this.colliderMesh = MeshBuilder.CreateBox('wizardCollider', {
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
        this.rootNode = new TransformNode('wizardRoot', this.scene);
        this.rootNode.position = this.config.position.clone();

        this.mesh = characterResult.meshes[0];
        this.mesh.parent = this.rootNode;
        this.mesh.position = new Vector3(0, this.standingMeshY, 0);
        this.mesh.scaling.setAll(this.config.scale);

        // Get skeleton
        this.skeleton = characterResult.skeletons[0] || null;
        console.log(`[WizardController] Skeleton: ${this.skeleton?.name}, bones: ${this.skeleton?.bones.length}`);

        // Store all transform nodes for animation retargeting
        characterResult.transformNodes.forEach(node => {
            this.transformNodes.set(node.name, node);
        });
        console.log(`[WizardController] Stored ${this.transformNodes.size} transform nodes`);

        // Make all meshes visible
        characterResult.meshes.forEach(mesh => {
            mesh.isVisible = true;
        });

        console.log(`[WizardController] Loaded ${characterResult.meshes.length} meshes, scale: ${this.config.scale}`);

        // Create magic texture for particles
        this.createMagicTexture();

        // Load animations
        await this.loadAnimation(basePath, 'standing idle.glb', 'idle', 'full');
        await this.loadAnimation(basePath, 'standing idle 02.glb', 'idle2', 'full');
        await this.loadAnimation(basePath, 'Standing Idle 03.glb', 'idle3', 'full');
        await this.loadAnimation(basePath, 'Standing Walk Forward.glb', 'walk', 'full');
        await this.loadAnimation(basePath, 'Standing Run Forward.glb', 'run', 'full');
        await this.loadAnimation(basePath, 'Standing Jump.glb', 'jump', 'none');
        await this.loadAnimation(basePath, 'Standing 2H Cast Spell 01.glb', 'castSpell', 'full');
        await this.loadAnimation(basePath, 'Standing 2H Magic Attack 01.glb', 'magicAttack1', 'full');
        await this.loadAnimation(basePath, 'Standing 2H Magic Attack 02.glb', 'magicAttack2', 'full');
        await this.loadAnimation(basePath, 'Standing 2H Magic Attack 03.glb', 'magicAttack3', 'full');
        await this.loadAnimation(basePath, 'Standing 2H Magic Area Attack 01.glb', 'areaAttack', 'full');
        await this.loadAnimation(basePath, 'Standing 1H Magic Attack 03.glb', 'doorOpen', 'full');
        await this.loadAnimation(basePath, 'Standing Block Start.glb', 'blockStart', 'full');
        await this.loadAnimation(basePath, 'Standing Block Idle.glb', 'blockIdle', 'full');
        await this.loadAnimation(basePath, 'Standing Block End.glb', 'blockEnd', 'full');
        await this.loadAnimation(basePath, 'Crouch Idle.glb', 'crouchIdle', 'full');
        await this.loadAnimation(basePath, 'Crouch Walk Forward.glb', 'crouchWalk', 'full');
        await this.loadAnimation(basePath, 'Standing Idle To Crouch.glb', 'standToCrouch', 'full');
        await this.loadAnimation(basePath, 'Crouch To Standing Idle.glb', 'crouchToStand', 'full');
        await this.loadAnimation(basePath, 'Standing React Death Forward.glb', 'death', 'none');

        // Start with idle animation
        this.playAnimation('idle', true);

        // Setup input handlers
        this.setupInput();

        // Register update loop
        this.scene.onBeforeRenderObservable.add(() => this.update());

        // Get crosshair element
        this.crosshairElement = document.getElementById('crosshair');

        console.log('[WizardController] Wizard loaded successfully');
    }

    private createMagicTexture(): void {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // Create radial gradient for magic glow
        const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(50, 150, 255, 0.8)');
        gradient.addColorStop(0.6, 'rgba(100, 50, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(50, 0, 150, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        this.magicTexture = new Texture(canvas.toDataURL(), this.scene, false, false);
    }

    private async loadAnimation(basePath: string, filename: string, name: WizardAnimationName, rootMotionMode: 'full' | 'horizontal' | 'none' = 'none'): Promise<void> {
        if (this.transformNodes.size === 0) {
            console.warn(`[WizardController] No transform nodes to retarget animation ${name}`);
            return;
        }

        try {
            console.log(`[WizardController] Loading animation file: ${filename}`);
            const result = await SceneLoader.ImportMeshAsync('', basePath, filename, this.scene);

            const sourceAnimGroup = result.animationGroups[0];

            if (!sourceAnimGroup) {
                console.warn(`[WizardController] No animation group in ${filename}`);
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
                console.log(`[WizardController] Animation ${name} ready (${retargetedCount} tracks)`);
            } else {
                console.warn(`[WizardController] No animations retargeted for ${name}`);
                newAnimGroup.dispose();
            }

            // Dispose source animation group
            sourceAnimGroup.dispose();

            // Remove the loaded meshes, transform nodes and skeletons
            result.transformNodes.forEach(node => node.dispose());
            result.meshes.forEach(mesh => mesh.dispose());
            result.skeletons.forEach(skeleton => skeleton.dispose());

        } catch (error) {
            console.warn(`[WizardController] Failed to load animation ${name}:`, error);
        }
    }

    private playAnimation(name: WizardAnimationName, loop: boolean = true): void {
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

        // Setup gamepad button callbacks
        this.setupGamepadInput();
    }

    private setupGamepadInput(): void {
        // Button press callbacks
        this.gamepadManager.onButtonPress((button) => {
            if (!this.settings.gamepadEnabled || this.isDead) return;

            switch (button) {
                case GamepadButton.A: // Jump
                    this.keys.jump = true;
                    this.tryJump();
                    break;
                case GamepadButton.X: // Attack
                    if (!this.isCasting) {
                        this.castMagic();
                    }
                    break;
                case GamepadButton.B: // Block
                    if (!this.isBlocking) {
                        this.startBlock();
                    }
                    break;
                case GamepadButton.LB: // Run (hold)
                    this.keys.run = true;
                    break;
                case GamepadButton.RT: // Attack (trigger)
                    if (!this.isCasting) {
                        this.castMagic();
                    }
                    break;
            }
        });

        // Button release callbacks
        this.gamepadManager.onButtonRelease((button) => {
            if (!this.settings.gamepadEnabled) return;

            switch (button) {
                case GamepadButton.LB: // Stop running
                    this.keys.run = false;
                    break;
                case GamepadButton.B: // Stop blocking
                    if (this.isBlocking) {
                        this.endBlock();
                    }
                    break;
            }
        });
    }

    private updateFromGamepad(): void {
        if (!this.settings.gamepadEnabled || !this.gamepadManager.isConnected()) return;

        const leftStick = this.gamepadManager.getLeftStick();

        // Update movement keys based on stick direction
        this.keys.forward = leftStick.y < -0.1;
        this.keys.backward = leftStick.y > 0.1;
        this.keys.left = leftStick.x < -0.1;
        this.keys.right = leftStick.x > 0.1;
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
            this.keys.jump = true;
            this.tryJump();
        }
        if (this.settings.isKeyBound('crouch', e.code)) {
            this.keys.crouch = true;
            this.handleCrouchInput(true);
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
        if (this.settings.isKeyBound('jump', e.code)) {
            this.keys.jump = false;
        }
        if (this.settings.isKeyBound('crouch', e.code)) {
            this.keys.crouch = false;
            this.handleCrouchInput(false);
        }
    }

    private handleCrouchInput(pressed: boolean): void {
        if (this.isDead || this.isJumping || this.isCasting) return;

        const crouchMode = this.settings.crouchMode;

        if (crouchMode === 'toggle') {
            if (pressed) {
                // Toggle crouch state
                if (this.isCrouching) {
                    this.standUp();
                } else {
                    this.crouch();
                }
            }
        } else {
            // Hold mode
            if (pressed && !this.isCrouching) {
                this.crouch();
            } else if (!pressed && this.isCrouching) {
                this.standUp();
            }
        }
    }

    private crouch(): void {
        if (this.isCrouching || this.isJumping || this.isCasting) return;

        // Update camera height immediately for first-person mode
        this.camera?.setCrouching(true);

        this.isCrouching = true;
        this.updateCrouchMetadata();
        this.playAnimation('standToCrouch', false);

        // Set target mesh Y for smooth transition (move mesh down to keep feet on ground)
        setTimeout(() => {
            this.targetMeshY = this.standingMeshY + this.crouchMeshOffset;
        }, 10);

        // Reduce collider size for crouching
        if (this.colliderMesh) {
            this.colliderMesh.ellipsoid = this.crouchingEllipsoid.clone();
            this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.5, 0);
        }

        const transitionAnim = this.animations.standToCrouch;
        if (transitionAnim) {
            transitionAnim.onAnimationEndObservable.addOnce(() => {
                if (this.isCrouching) {
                    this.playAnimation('crouchIdle', true);
                }
            });
        } else {
            this.playAnimation('crouchIdle', true);
        }
    }

    private standUp(): void {
        if (!this.isCrouching) return;

        // Update camera height immediately for first-person mode
        this.camera?.setCrouching(false);

        this.playAnimation('crouchToStand', false);

        // Set target mesh Y back to standing position
        setTimeout(() => {
            this.targetMeshY = this.standingMeshY;
        }, 100);

        // Restore collider size for standing
        if (this.colliderMesh) {
            this.colliderMesh.ellipsoid = this.standingEllipsoid.clone();
            this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
        }

        const transitionAnim = this.animations.crouchToStand;
        if (transitionAnim) {
            transitionAnim.onAnimationEndObservable.addOnce(() => {
                this.isCrouching = false;
                this.updateCrouchMetadata();
                this.playAnimation(this.getRandomIdleAnim(), true);
            });
        } else {
            this.isCrouching = false;
            this.updateCrouchMetadata();
            this.playAnimation(this.getRandomIdleAnim(), true);
        }
    }

    private tryJump(): void {
        if (this.isJumping || this.isCasting || this.isBlocking || this.isCrouching) {
            return;
        }

        this.isJumping = true;
        this.verticalVelocity = this.jumpForce;
        this.playAnimation('jump', false);

        const jumpAnim = this.animations.jump;
        if (jumpAnim) {
            jumpAnim.onAnimationEndObservable.addOnce(() => {
                // Animation ended but might still be in air - handled by update()
            });
        }
    }

    onMouseDown(button: number): void {
        console.log(`[WizardController] onMouseDown(${button})`);
        if (button === 0 && !this.isCasting && this.canAttack) {
            // Left click - cast magic
            this.castMagic();
        } else if (button === 2 && !this.isBlocking) {
            // Right click - block
            this.startBlock();
        }
    }

    onMouseUp(button: number): void {
        console.log(`[WizardController] onMouseUp(${button})`);
        if (button === 2 && this.isBlocking) {
            // Release right click - end block
            this.endBlock();
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

    private castMagic(): void {
        if (this.isCasting || this.isBlocking || !this.canAttack) return;

        // Require stamina to cast
        if (this.stamina < this.getCastStaminaCost()) {
            console.warn('[WizardController] Not enough stamina to cast');
            return;
        }

        // Consume stamina immediately
        this.stamina = Math.max(0, this.stamina - this.getCastStaminaCost());

        this.isCasting = true;
        this.canAttack = false;
        this.showCrosshair(true);

        // Pick a random attack animation
        const attacks: WizardAnimationName[] = ['magicAttack1', 'magicAttack2', 'magicAttack3'];
        const randomAttack = attacks[Math.floor(Math.random() * attacks.length)];

        this.playAnimation(randomAttack, false);

        const attackAnim = this.animations[randomAttack];
        if (attackAnim) {
            // Trigger projectile at animation midpoint
            const hitFrame = (attackAnim.from + attackAnim.to) / 2;
            let hitTriggered = false;

            const checkHit = () => {
                if (!hitTriggered && attackAnim.animatables[0]) {
                    const currentFrame = attackAnim.animatables[0].masterFrame;
                    if (currentFrame >= hitFrame) {
                        hitTriggered = true;
                        this.fireMagicProjectile();
                    }
                }
            };

            const observer = this.scene.onBeforeRenderObservable.add(checkHit);

            // Safety timeout
            const safetyTimeout = setTimeout(() => {
                if (this.isCasting) {
                    console.warn('[WizardController] Magic attack animation timeout');
                    this.isCasting = false;
                    this.hideCrosshair();
                    this.scene.onBeforeRenderObservable.remove(observer);
                }
            }, 3000);

            attackAnim.onAnimationEndObservable.addOnce(() => {
                clearTimeout(safetyTimeout);
                this.isCasting = false;
                this.hideCrosshair();
                this.scene.onBeforeRenderObservable.remove(observer);
            });
        } else {
            this.isCasting = false;
            this.hideCrosshair();
        }

        // Reset attack cooldown
        setTimeout(() => {
            this.canAttack = true;
        }, this.attackCooldown);
    }

    private fireMagicProjectile(): void {
        if (!this.rootNode || !this.camera) return;

        // Get camera direction (where the crosshair is pointing)
        const cameraInstance = this.camera.instance;
        const cameraForward = cameraInstance.getForwardRay().direction.clone();
        const cameraPosition = cameraInstance.position.clone();

        // Find where the crosshair points in the world
        const cameraRay = new Ray(cameraPosition, cameraForward, this.attackRange + 50);
        const cameraHit = this.scene.pickWithRay(cameraRay, (mesh) => {
            return mesh.checkCollisions && mesh !== this.colliderMesh && mesh.name !== 'wizardCollider';
        });

        // Determine the target point
        let targetPoint: Vector3;
        if (cameraHit?.pickedPoint) {
            targetPoint = cameraHit.pickedPoint;
        } else {
            targetPoint = cameraPosition.add(cameraForward.scale(this.attackRange + 50));
        }

        // Magic starts from the wizard's hands (chest height)
        const magicOrigin = this.rootNode.position.clone();
        magicOrigin.y += 1.3; // Chest/hand height

        // Calculate direction from wizard to target
        const magicDirection = targetPoint.subtract(magicOrigin);
        const distanceToTarget = magicDirection.length();
        magicDirection.normalize();

        // Store trajectory info
        this.lastMagicTrajectory = {
            origin: magicOrigin.clone(),
            direction: magicDirection.clone(),
            maxDistance: Math.min(distanceToTarget, this.attackRange)
        };

        // Pick a random magic color
        const magicColor = MAGIC_COLORS[Math.floor(Math.random() * MAGIC_COLORS.length)];

        // Create magic projectile with color
        const projectileMesh = this.createMagicOrb('magicOrb_' + Date.now(), magicColor);
        projectileMesh.position = magicOrigin.clone();

        // Create particle trail with matching color
        const particles = this.createMagicParticles(projectileMesh, magicColor);

        // Add to active projectiles
        this.activeProjectiles.push({
            mesh: projectileMesh,
            particles: particles,
            direction: magicDirection.clone(),
            speed: this.projectileSpeed,
            distanceTraveled: 0,
            maxDistance: Math.min(distanceToTarget, this.attackRange),
            hasHit: false
        });

        console.log(`[WizardController] Magic projectile created, flying towards target at distance ${distanceToTarget.toFixed(1)}`);

        // Play spell sound
        this.audioManager.playSpellSound();

        // Delay hit detection to match projectile flight time
        const flightDistance = Math.min(distanceToTarget, this.attackRange);
        const flightFrames = flightDistance / this.projectileSpeed;
        const flightTimeMs = flightFrames * 16.67;

        if (this.attackHitCallback) {
            const callback = this.attackHitCallback;
            const trajectoryMidpoint = magicOrigin.add(magicDirection.scale(flightDistance / 2));

            setTimeout(() => {
                callback(trajectoryMidpoint, flightDistance / 2 + 1.5);
            }, flightTimeMs);
        }
    }

    private createMagicOrb(name: string, color: MagicColor): Mesh {
        const orb = MeshBuilder.CreateSphere(name, {
            diameter: 0.3,
            segments: 8
        }, this.scene);

        const material = new StandardMaterial(name + '_mat', this.scene);
        material.emissiveColor = color.emissive;
        material.diffuseColor = color.diffuse;
        material.alpha = 0.8;
        orb.material = material;

        return orb;
    }

    private createMagicParticles(emitter: AbstractMesh, color: MagicColor): ParticleSystem {
        const particles = new ParticleSystem('magicTrail', 100, this.scene);

        if (this.magicTexture) {
            particles.particleTexture = this.magicTexture;
        }

        particles.emitter = emitter;
        particles.minEmitBox = new Vector3(-0.1, -0.1, -0.1);
        particles.maxEmitBox = new Vector3(0.1, 0.1, 0.1);

        particles.minSize = 0.1;
        particles.maxSize = 0.25;

        particles.minLifeTime = 0.2;
        particles.maxLifeTime = 0.5;

        particles.emitRate = 50;

        particles.color1 = color.particle1;
        particles.color2 = color.particle2;
        particles.colorDead = color.particleDead;

        particles.direction1 = new Vector3(-0.2, -0.2, -0.2);
        particles.direction2 = new Vector3(0.2, 0.2, 0.2);
        particles.minEmitPower = 0.1;
        particles.maxEmitPower = 0.3;

        particles.gravity = Vector3.Zero();
        particles.blendMode = ParticleSystem.BLENDMODE_ADD;

        particles.start();
        return particles;
    }

    /**
     * Check if a point is close to the last magic trajectory
     */
    isPointOnMagicTrajectory(point: Vector3, tolerance: number = 1.0): boolean {
        if (!this.lastMagicTrajectory) return false;

        const { origin, direction, maxDistance } = this.lastMagicTrajectory;
        const toPoint = point.subtract(origin);
        const projectionLength = Vector3.Dot(toPoint, direction);

        if (projectionLength < 0 || projectionLength > maxDistance) {
            return false;
        }

        const closestPointOnLine = origin.add(direction.scale(projectionLength));
        const perpendicularDistance = Vector3.Distance(point, closestPointOnLine);

        return perpendicularDistance <= tolerance;
    }

    /**
     * Get the last magic trajectory for external collision checks
     */
    getMagicTrajectory(): { origin: Vector3; direction: Vector3; maxDistance: number } | null {
        return this.lastMagicTrajectory;
    }

    private updateProjectiles(): void {
        for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
            const projectile = this.activeProjectiles[i];

            // Move the projectile
            const movement = projectile.direction.scale(projectile.speed);
            projectile.mesh.position.addInPlace(movement);
            projectile.distanceTraveled += projectile.speed;

            // Check if reached max distance or has hit something
            if (projectile.distanceTraveled >= projectile.maxDistance || projectile.hasHit) {
                projectile.particles.stop();
                projectile.particles.dispose();
                projectile.mesh.dispose();
                this.activeProjectiles.splice(i, 1);
            }
        }
    }

    /**
     * Mark the most recent projectile as having hit a target
     */
    markProjectileHit(): void {
        if (this.activeProjectiles.length > 0) {
            this.activeProjectiles[this.activeProjectiles.length - 1].hasHit = true;
        }
    }

    private startBlock(): void {
        if (this.isBlocking || this.isCasting) return;

        this.isBlocking = true;
        this.playAnimation('blockStart', false);

        const blockStartAnim = this.animations.blockStart;
        if (blockStartAnim) {
            blockStartAnim.onAnimationEndObservable.addOnce(() => {
                if (this.isBlocking) {
                    this.playAnimation('blockIdle', true);
                }
            });
        } else {
            this.playAnimation('blockIdle', true);
        }
    }

    private endBlock(): void {
        if (!this.isBlocking) return;

        this.playAnimation('blockEnd', false);

        const blockEndAnim = this.animations.blockEnd;
        if (blockEndAnim) {
            blockEndAnim.onAnimationEndObservable.addOnce(() => {
                this.isBlocking = false;
                this.playAnimation(this.getRandomIdleAnim(), true);
            });
        } else {
            this.isBlocking = false;
            this.playAnimation(this.getRandomIdleAnim(), true);
        }
    }

    private getRandomIdleAnim(): WizardAnimationName {
        const rand = Math.random();
        if (rand < 0.6) return 'idle';
        if (rand < 0.8) return 'idle2';
        return 'idle3';
    }

    onAttackHit(callback: (position: Vector3, range: number) => void): void {
        this.attackHitCallback = callback;
    }

    private update(): void {
        // Always update projectiles
        this.updateProjectiles();

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

        // Update gamepad input
        this.updateFromGamepad();

        // Stamina updates
        const delta = this.scene.getEngine().getDeltaTime() / 1000;
        const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
        if (this.keys.run && isMoving && !this.isCrouching && this.stamina > 0) {
            const drain = this.getRunStaminaDrain() * delta;
            this.stamina = Math.max(0, this.stamina - drain);
            if (this.stamina <= 0) this.keys.run = false;
        }
        if (this.isBlocking && this.stamina > 0) {
            const drain = this.getBlockStaminaDrain() * delta;
            this.stamina = Math.max(0, this.stamina - drain);
            if (this.stamina <= 0) this.endBlock();
        }
        if ((!this.keys.run || !isMoving) && !this.isBlocking) {
            this.stamina = Math.min(this.getMaxStamina(), this.stamina + this.getStaminaRegenRate() * delta);
        }

        // Crouch speed is much slower (60% of walk speed)
        const speed = (this.isCrouching
            ? this.config.walkSpeed * 0.6
            : (this.keys.run ? this.config.runSpeed : this.config.walkSpeed)) * this.movementMultiplier;

        // Get camera angle for movement
        const cameraAngle = this.camera ? -this.camera.alpha - Math.PI / 2 : 0;

        // Calculate movement direction relative to camera
        let moveX = 0;
        let moveZ = 0;

        if (this.keys.forward) moveZ += 1;
        if (this.keys.backward) moveZ -= 1;
        if (this.keys.left) moveX -= 1;
        if (this.keys.right) moveX += 1;

        // Apply movement (allow movement while casting, but not while blocking)
        if (isMoving && !this.isBlocking) {
            const inputAngle = Math.atan2(moveX, moveZ);
            const moveAngle = cameraAngle + inputAngle;

            // Only rotate character to face movement direction if not casting
            // (when casting, rotation is handled separately to face camera)
            if (!this.isCasting) {
                this.rootNode.rotation.y = moveAngle + Math.PI;
            }

            // Calculate movement velocity (slower while casting)
            const castingSpeedMult = this.isCasting ? 0.5 : 1.0;
            const velocity = new Vector3(
                Math.sin(moveAngle) * speed * castingSpeedMult,
                0,
                Math.cos(moveAngle) * speed * castingSpeedMult
            );

            // Move with collision detection
            this.colliderMesh.moveWithCollisions(velocity);

            // Sync rootNode position with collider
            this.rootNode.position.x = this.colliderMesh.position.x;
            this.rootNode.position.z = this.colliderMesh.position.z;
        }

        // Handle jumping and gravity
        if (this.isJumping || this.verticalVelocity !== 0) {
            this.verticalVelocity -= this.gravity;
            this.rootNode.position.y += this.verticalVelocity;

            if (this.rootNode.position.y <= 0) {
                this.rootNode.position.y = 0;
                this.verticalVelocity = 0;
                this.isJumping = false;
            }
        }

        // Keep collider synced with player position
        this.colliderMesh.position.copyFrom(this.rootNode.position);

        // When casting, rotate character to face camera direction
        if (this.isCasting && this.camera) {
            const targetRotation = cameraAngle + Math.PI;
            const currentRotation = this.rootNode.rotation.y;
            const rotationDiff = targetRotation - currentRotation;
            const normalizedDiff = Math.atan2(Math.sin(rotationDiff), Math.cos(rotationDiff));
            this.rootNode.rotation.y += normalizedDiff * 0.15;
        }

        // Update animation based on state
        if (!this.isCasting && !this.isBlocking && !this.isJumping) {
            if (this.isCrouching) {
                // Crouch animations
                if (isMoving) {
                    this.playAnimation('crouchWalk', true);
                } else {
                    const isInCrouchIdle = this.currentAnimationName === 'crouchIdle';
                    if (!isInCrouchIdle) {
                        this.playAnimation('crouchIdle', true);
                    }
                }
            } else if (isMoving) {
                this.playAnimation(this.keys.run ? 'run' : 'walk', true);
            } else {
                const isInIdle = this.currentAnimationName === 'idle' ||
                                 this.currentAnimationName === 'idle2' ||
                                 this.currentAnimationName === 'idle3';
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
     * Play kick animation (used for opening doors) - wizard uses 1H magic attack
     */
    playKick(): void {
        if (this.isDead || this.isCasting) return;

        this.isCasting = true;
        this.playAnimation('doorOpen', false);

        if (this.animations.doorOpen) {
            this.animations.doorOpen.onAnimationEndObservable.addOnce(() => {
                this.isCasting = false;
                this.playAnimation('idle', true);
            });
        } else {
            this.isCasting = false;
        }
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

    // Stamina accessors
    getStamina(): number {
        return Math.round(this.stamina);
    }

    getMaxStamina(): number {
        return this.baseMaxStamina + this.maxStaminaBonus;
    }

    applyProgressionModifiers(modifiers: PlayerProgressionModifiers): void {
        const previousMaxStamina = this.getMaxStamina();
        this.movementMultiplier = modifiers.movementMultiplier;
        this.maxStaminaBonus = modifiers.maxStaminaBonus;
        this.staminaRegenBonus = modifiers.staminaRegenBonus;
        this.staminaDrainMultiplier = modifiers.staminaDrainMultiplier;
        this.attackCostMultiplier = modifiers.attackCostMultiplier;

        const newMaxStamina = this.getMaxStamina();
        if (newMaxStamina !== previousMaxStamina) {
            this.stamina = Math.min(newMaxStamina, this.stamina + Math.max(0, newMaxStamina - previousMaxStamina));
        }
    }

    private getStaminaRegenRate(): number {
        return this.baseStaminaRegenRate + this.staminaRegenBonus;
    }

    private getRunStaminaDrain(): number {
        return this.baseRunStaminaDrain * this.staminaDrainMultiplier;
    }

    private getBlockStaminaDrain(): number {
        return this.baseBlockStaminaDrain * this.staminaDrainMultiplier;
    }

    private getCastStaminaCost(): number {
        return this.baseCastStaminaCost * this.attackCostMultiplier;
    }

    get crouching(): boolean {
        return this.isCrouching;
    }

    dispose(): void {
        // Dispose all active projectiles
        for (const projectile of this.activeProjectiles) {
            projectile.particles.stop();
            projectile.particles.dispose();
            projectile.mesh.dispose();
        }
        this.activeProjectiles = [];

        if (this.magicTexture) {
            this.magicTexture.dispose();
        }

        Object.values(this.animations).forEach(anim => anim?.dispose());
        this.mesh?.dispose();
        this.colliderMesh?.dispose();
    }

    private updateCrouchMetadata(): void {
        if (!this.scene.metadata) {
            this.scene.metadata = {};
        }
        this.scene.metadata.playerCrouching = this.isCrouching;
        // Update camera height for first-person mode
        this.camera?.setCrouching(this.isCrouching);
    }

    /**
     * Get the world position of the character's head bone for first-person camera
     */
    getHeadWorldPosition(): Vector3 | null {
        if (!this.skeleton || !this.mesh) return null;

        // Try common head bone names
        const headBoneNames = ['Head', 'head', 'mixamorig:Head', 'Bip001 Head', 'Bone_Head'];
        let headBone = null;

        for (const name of headBoneNames) {
            headBone = this.skeleton.bones.find(b => b.name === name || b.name.toLowerCase().includes('head'));
            if (headBone) break;
        }

        if (!headBone) {
            // Fallback: use mesh position with height offset
            return this.rootNode ? new Vector3(
                this.rootNode.position.x,
                this.rootNode.position.y + 1.7,
                this.rootNode.position.z
            ) : null;
        }

        // Get bone world position
        const worldMatrix = headBone.getWorldMatrix();
        return new Vector3(
            worldMatrix.m[12],
            worldMatrix.m[13],
            worldMatrix.m[14]
        );
    }
}
