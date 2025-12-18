import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { GameSettings } from './GameSettings';

export interface ThirdPersonCameraConfig {
    distance?: number;
    heightOffset?: number;
    rotationSensibility?: number;
    lowerRadiusLimit?: number;
    upperRadiusLimit?: number;
    followSpeed?: number;
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
    private readonly shoulderOffsetY = 1.6;  // Hauteur de l'épaule

    constructor(scene: Scene, canvas: HTMLCanvasElement, config: ThirdPersonCameraConfig = {}) {
        const distance = config.distance ?? 3;  // Encore plus proche
        this.heightOffset = config.heightOffset ?? 1.6;
        this.followSpeed = config.followSpeed ?? 0.15;  // Plus réactif

        // Get sensitivity from settings
        const settings = GameSettings.getInstance();
        const sensitivity = config.rotationSensibility ?? settings.cameraSensitivity;

        // Create arc rotate camera
        this.camera = new ArcRotateCamera(
            'thirdPersonCamera',
            -Math.PI / 2,  // alpha (horizontal rotation)
            Math.PI / 2.8, // beta - angle plus horizontal pour OTS
            distance,
            new Vector3(0, this.heightOffset, 0),
            scene
        );

        this.camera.attachControl(canvas, true);

        // Camera settings - Style Over The Shoulder
        this.camera.lowerRadiusLimit = config.lowerRadiusLimit ?? 2.5;
        this.camera.upperRadiusLimit = config.upperRadiusLimit ?? 5;
        this.camera.lowerBetaLimit = Math.PI / 6;     // Limite angle vers le haut (30°) - permet de regarder plus vers le bas
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

    setTarget(node: TransformNode): void {
        this.target = node;
        // Initialize current target to avoid camera jumping from origin
        this.currentTarget = node.position.clone();
        this.currentTarget.y += this.heightOffset;
    }

    update(): void {
        if (this.target) {
            // Calculate desired target position (at shoulder height)
            const desiredTarget = this.target.position.clone();
            desiredTarget.y += this.shoulderOffsetY;

            // Smoothly interpolate to desired position
            this.currentTarget = Vector3.Lerp(this.currentTarget, desiredTarget, this.followSpeed);
            this.camera.target.copyFrom(this.currentTarget);

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
}
