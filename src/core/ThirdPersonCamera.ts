import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

export interface ThirdPersonCameraConfig {
    distance?: number;
    heightOffset?: number;
    rotationSensibility?: number;
    lowerRadiusLimit?: number;
    upperRadiusLimit?: number;
}

export class ThirdPersonCamera {
    private camera: ArcRotateCamera;
    private target: AbstractMesh | null = null;
    private heightOffset: number;

    constructor(scene: Scene, canvas: HTMLCanvasElement, config: ThirdPersonCameraConfig = {}) {
        const distance = config.distance ?? 5;
        this.heightOffset = config.heightOffset ?? 1.5;

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

    setTarget(mesh: AbstractMesh): void {
        this.target = mesh;
    }

    update(): void {
        if (this.target) {
            // Follow target position with height offset
            this.camera.target.copyFrom(this.target.position);
            this.camera.target.y += this.heightOffset;
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
