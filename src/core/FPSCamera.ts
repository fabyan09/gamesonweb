import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';

export interface FPSCameraConfig {
    position?: Vector3;
    speed?: number;
    angularSensibility?: number;
    inertia?: number;
}

export class FPSCamera {
    private camera: UniversalCamera;
    private canvas: HTMLCanvasElement;

    constructor(scene: Scene, canvas: HTMLCanvasElement, config: FPSCameraConfig = {}) {
        this.canvas = canvas;

        const position = config.position ?? new Vector3(0, 2, -5);
        this.camera = new UniversalCamera('fpsCamera', position, scene);

        this.camera.attachControl(canvas, true);
        this.camera.speed = config.speed ?? 0.3;
        this.camera.angularSensibility = config.angularSensibility ?? 800;
        this.camera.inertia = config.inertia ?? 0.7;
        this.camera.minZ = 0.1;

        this.setupControls();
        this.setupPointerLock();
    }

    private setupControls(): void {
        // ZQSD + WASD + Arrows
        this.camera.keysUp = [90, 87, 38];      // Z, W, ArrowUp
        this.camera.keysDown = [83, 40];         // S, ArrowDown
        this.camera.keysLeft = [81, 65, 37];     // Q, A, ArrowLeft
        this.camera.keysRight = [68, 39];        // D, ArrowRight
        this.camera.keysUpward = [32];           // Space
        this.camera.keysDownward = [16];         // Shift
    }

    private setupPointerLock(): void {
        this.canvas.addEventListener('click', () => {
            this.canvas.requestPointerLock();
        });
    }

    get instance(): UniversalCamera {
        return this.camera;
    }

    setPosition(position: Vector3): void {
        this.camera.position = position;
    }

    lookAt(target: Vector3): void {
        this.camera.setTarget(target);
    }
}
