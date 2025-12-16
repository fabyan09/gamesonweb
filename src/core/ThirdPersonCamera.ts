import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

export interface ThirdPersonCameraConfig {
    distance?: number;
    heightOffset?: number;
    rotationSensibility?: number;
    lowerRadiusLimit?: number;
    upperRadiusLimit?: number;
    followSpeed?: number;
}

export class ThirdPersonCamera {
    private camera: ArcRotateCamera;
    private target: TransformNode | null = null;
    private heightOffset: number;
    private followSpeed: number;
    private currentTarget: Vector3 = Vector3.Zero();

    constructor(scene: Scene, canvas: HTMLCanvasElement, config: ThirdPersonCameraConfig = {}) {
        const distance = config.distance ?? 5;
        this.heightOffset = config.heightOffset ?? 1.5;
        this.followSpeed = config.followSpeed ?? 0.1;

        // Create arc rotate camera
        this.camera = new ArcRotateCamera(
            'thirdPersonCamera',
            -Math.PI / 2,  // alpha (horizontal rotation)
            Math.PI / 3,   // beta (vertical angle)
            distance,       // radius (distance from target)
            new Vector3(0, this.heightOffset, 0),
            scene
        );

        this.camera.attachControl(canvas, true);

        // Camera settings
        this.camera.lowerRadiusLimit = config.lowerRadiusLimit ?? 2;
        this.camera.upperRadiusLimit = config.upperRadiusLimit ?? 10;
        this.camera.lowerBetaLimit = 0.1;
        this.camera.upperBetaLimit = Math.PI / 2.2;
        this.camera.angularSensibilityX = config.rotationSensibility ?? 500;
        this.camera.angularSensibilityY = config.rotationSensibility ?? 500;
        this.camera.panningSensibility = 0; // Disable panning
        this.camera.inertia = 0.7;
        this.camera.minZ = 0.1;

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
            // Calculate desired target position
            const desiredTarget = this.target.position.clone();
            desiredTarget.y += this.heightOffset;

            // Smoothly interpolate to desired position
            this.currentTarget = Vector3.Lerp(this.currentTarget, desiredTarget, this.followSpeed);
            this.camera.target.copyFrom(this.currentTarget);
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
}
