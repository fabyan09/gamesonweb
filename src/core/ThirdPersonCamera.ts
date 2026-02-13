import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CameraMode, GameSettings } from './GameSettings';

export interface ThirdPersonCameraConfig {
    distance?: number;
    heightOffset?: number;
    rotationSensibility?: number;
    lowerRadiusLimit?: number;
    upperRadiusLimit?: number;
    followSpeed?: number;
    initialAlpha?: number;
    bounds?: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
        maxY: number;
    };
}

export class ThirdPersonCamera {
    private camera: ArcRotateCamera;
    private target: TransformNode | null = null;
    private heightOffset: number;
    private followSpeed: number;
    private currentTarget: Vector3 = Vector3.Zero();
    private bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number } | null = null;

    // Over-the-shoulder offset (right shoulder)
    private readonly shoulderOffsetX = 0.6;  // Décalage à droite
    private shoulderOffsetY = 1.6;  // Hauteur de l'épaule

    // Screen shake
    private shakeIntensity: number = 0;
    private shakeDuration: number = 0;
    private shakeElapsed: number = 0;
    private isShaking: boolean = false;

    // Camera mode tracking
    private currentMode: CameraMode = 'thirdPerson';
    private playerRoot: TransformNode | null = null;

    // Crouch state tracking for first-person mode
    private isCrouching = false;
    private readonly fpStandingHeight = 1.7;
    private readonly fpCrouchingHeight = 1.0;
    private readonly tpStandingHeight = 1.6;
    private readonly tpCrouchingHeight = 1.0;

    constructor(scene: Scene, canvas: HTMLCanvasElement, config: ThirdPersonCameraConfig = {}) {
        const distance = config.distance ?? 3;  // Encore plus proche
        this.heightOffset = config.heightOffset ?? 1.6;
        this.followSpeed = config.followSpeed ?? 0.15;  // Plus réactif

        // Get sensitivity from settings
        const settings = GameSettings.getInstance();
        const sensitivity = config.rotationSensibility ?? settings.cameraSensitivity;

        // Create arc rotate camera
        const initialAlpha = config.initialAlpha ?? -Math.PI / 2;
        this.camera = new ArcRotateCamera(
            'thirdPersonCamera',
            initialAlpha,  // alpha (horizontal rotation)
            Math.PI / 2.8, // beta - angle plus horizontal pour OTS
            distance,
            new Vector3(0, this.heightOffset, 0),
            scene
        );

        this.camera.attachControl(canvas, true);

        // Camera settings - Style Over The Shoulder
        this.camera.lowerRadiusLimit = config.lowerRadiusLimit ?? 2.5;
        this.camera.upperRadiusLimit = config.upperRadiusLimit ?? 5;
        this.camera.lowerBetaLimit = Math.PI / 3;     // Limite angle vers le haut (30°) - permet de regarder plus vers le bas
        this.camera.upperBetaLimit = Math.PI * 0.60;  // Limite angle vers le bas (~117°) - permet de viser vers le haut
        this.camera.angularSensibilityX = sensitivity;
        this.camera.angularSensibilityY = sensitivity * 1.5;  // Moins sensible verticalement
        this.camera.panningSensibility = 0;
        this.camera.inertia = 0.85;  // Plus d'inertie pour smoothness
        this.camera.minZ = 0.1;

        // Target screen offset - décale le point de visée vers la gauche
        // pour que le personnage soit à droite de l'écran
        this.camera.targetScreenOffset = new Vector2(-0.8, 0);

        // Collision de caméra
        this.camera.checkCollisions = true;
        this.camera.collisionRadius = new Vector3(0.3, 0.3, 0.3);

        // Limites de la caméra (bornes du donjon)
        if (config.bounds) {
            this.bounds = config.bounds;
        }

        // Setup pointer lock
        this.setupPointerLock(canvas);
    }

    private setupPointerLock(canvas: HTMLCanvasElement): void {
        canvas.addEventListener('click', () => {
            canvas.requestPointerLock();
        });
    }

    /**
     * Get the underlying ArcRotateCamera for post-processing effects
     */
    getCamera(): ArcRotateCamera {
        return this.camera;
    }

    setTarget(node: TransformNode): void {
        this.target = node;
        // Initialize current target to avoid camera jumping from origin
        this.currentTarget = node.position.clone();
        this.currentTarget.y += this.heightOffset;
    }

    /**
     * Trigger a screen shake effect
     * @param intensity - Maximum offset magnitude
     * @param duration - Duration in milliseconds
     */
    shake(intensity: number, duration: number): void {
        this.shakeIntensity = intensity;
        this.shakeDuration = duration;
        this.shakeElapsed = 0;
        this.isShaking = true;
    }

    update(): void {
        if (this.target) {
            // Calculate desired target position (at shoulder height)
            const desiredTarget = this.target.position.clone();
            desiredTarget.y += this.shoulderOffsetY;

            // Smoothly interpolate to desired position
            this.currentTarget = Vector3.Lerp(this.currentTarget, desiredTarget, this.followSpeed);
            this.camera.target.copyFrom(this.currentTarget);

            // Apply screen shake offset
            if (this.isShaking) {
                const dt = this.camera.getScene().getEngine().getDeltaTime();
                this.shakeElapsed += dt;
                if (this.shakeElapsed >= this.shakeDuration) {
                    this.isShaking = false;
                } else {
                    const decay = 1 - this.shakeElapsed / this.shakeDuration;
                    const offsetX = (Math.random() * 2 - 1) * this.shakeIntensity * decay;
                    const offsetY = (Math.random() * 2 - 1) * this.shakeIntensity * decay;
                    const offsetZ = (Math.random() * 2 - 1) * this.shakeIntensity * decay;
                    this.camera.target.x += offsetX;
                    this.camera.target.y += offsetY;
                    this.camera.target.z += offsetZ;
                }
            }

            // Clamp camera position to bounds
            if (this.bounds) {
                const pos = this.camera.position;
                let needsClamp = false;
                const clampedPos = pos.clone();

                if (pos.x < this.bounds.minX) {
                    clampedPos.x = this.bounds.minX;
                    needsClamp = true;
                }
                if (pos.x > this.bounds.maxX) {
                    clampedPos.x = this.bounds.maxX;
                    needsClamp = true;
                }
                if (pos.z < this.bounds.minZ) {
                    clampedPos.z = this.bounds.minZ;
                    needsClamp = true;
                }
                if (pos.z > this.bounds.maxZ) {
                    clampedPos.z = this.bounds.maxZ;
                    needsClamp = true;
                }
                if (pos.y > this.bounds.maxY) {
                    clampedPos.y = this.bounds.maxY;
                    needsClamp = true;
                }

                if (needsClamp) {
                    this.camera.setPosition(clampedPos);
                }
            }
        }
    }

    get instance(): ArcRotateCamera {
        return this.camera;
    }

    get direction(): Vector3 {
        // Get camera forward direction (for movement relative to camera)
        const forward = this.camera.getForwardRay().direction;
        forward.y = 0;
        forward.normalize();
        return forward;
    }

    get alpha(): number {
        return this.camera.alpha;
    }

    updateSensitivity(): void {
        const settings = GameSettings.getInstance();
        this.camera.angularSensibilityX = settings.cameraSensitivity;
        this.camera.angularSensibilityY = settings.cameraSensitivity * 1.5;
    }

    /**
     * Apply gamepad right stick input to camera rotation
     * @param rightStickX - Right stick X axis value (-1 to 1)
     * @param rightStickY - Right stick Y axis value (-1 to 1)
     */
    applyGamepadLook(rightStickX: number, rightStickY: number): void {
        const settings = GameSettings.getInstance();
        const sensitivity = settings.gamepadLookMultiplier;
        const invertY = settings.gamepadInvertY;

        // Apply horizontal rotation (alpha)
        this.camera.alpha -= rightStickX * sensitivity;

        // Apply vertical rotation (beta) with optional Y inversion
        const yInput = invertY ? -rightStickY : rightStickY;
        this.camera.beta += yInput * sensitivity;

        // Clamp beta to limits
        const lowerLimit = this.camera.lowerBetaLimit ?? 0.1;
        const upperLimit = this.camera.upperBetaLimit ?? Math.PI;
        if (this.camera.beta < lowerLimit) {
            this.camera.beta = lowerLimit;
        }
        if (this.camera.beta > upperLimit) {
            this.camera.beta = upperLimit;
        }
    }

    /**
     * Set camera mode (first-person or third-person)
     * @param mode - The camera mode to set
     * @param playerRoot - Optional player root mesh for visibility control
     */
    setCameraMode(mode: CameraMode, playerRoot?: TransformNode): void {
        if (playerRoot) {
            this.playerRoot = playerRoot;
        }

        if (mode === 'firstPerson') {
            // First-person mode: camera at eye level, no distance
            this.camera.lowerRadiusLimit = 0.1;
            this.camera.upperRadiusLimit = 0.1;
            this.camera.radius = 0.1;
            // Eye level - adjust for crouch state
            this.shoulderOffsetY = this.isCrouching ? this.fpCrouchingHeight : this.fpStandingHeight;
            this.camera.targetScreenOffset.set(0, 0); // Centered view
            // More vertical freedom in first-person
            this.camera.lowerBetaLimit = Math.PI / 6;  // ~30 degrees from top
            this.camera.upperBetaLimit = Math.PI * 0.85; // ~153 degrees
            this.setPlayerMeshVisibility(false);
        } else {
            // Third-person mode: over-the-shoulder camera
            this.camera.lowerRadiusLimit = 2.5;
            this.camera.upperRadiusLimit = 5;
            this.camera.radius = 3;
            // Shoulder height - adjust for crouch state
            this.shoulderOffsetY = this.isCrouching ? this.tpCrouchingHeight : this.tpStandingHeight;
            this.camera.targetScreenOffset.set(-0.8, 0); // Over-the-shoulder offset
            // Standard third-person limits
            this.camera.lowerBetaLimit = Math.PI / 3;
            this.camera.upperBetaLimit = Math.PI * 0.60;
            this.setPlayerMeshVisibility(true);
        }

        this.currentMode = mode;
    }

    /**
     * Set player mesh visibility (hide in first-person, show in third-person)
     */
    private setPlayerMeshVisibility(visible: boolean): void {
        if (!this.playerRoot) return;
        this.playerRoot.getChildMeshes(false).forEach(mesh => {
            mesh.isVisible = visible;
        });
    }

    /**
     * Check if camera is in first-person mode
     */
    get isFirstPerson(): boolean {
        return this.currentMode === 'firstPerson';
    }

    /**
     * Get current camera mode
     */
    get mode(): CameraMode {
        return this.currentMode;
    }

    /**
     * Set crouching state - adjusts camera height in first-person mode
     * @param crouching - Whether the player is crouching
     */
    setCrouching(crouching: boolean): void {
        this.isCrouching = crouching;

        if (this.currentMode === 'firstPerson') {
            this.shoulderOffsetY = crouching ? this.fpCrouchingHeight : this.fpStandingHeight;
        } else {
            this.shoulderOffsetY = crouching ? this.tpCrouchingHeight : this.tpStandingHeight;
        }
    }
}
