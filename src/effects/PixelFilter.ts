/**
 * Pixel Filter Post-Process
 * Creates a retro 16-bit style pixelated look
 */

import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { Effect } from '@babylonjs/core/Materials/effect';

// Register the custom shader
Effect.ShadersStore["pixelFilterFragmentShader"] = `
    precision highp float;

    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 screenSize;
    uniform float pixelSize;

    void main(void) {
        // Calculate the pixel grid
        vec2 pixelatedUV = floor(vUV * screenSize / pixelSize) * pixelSize / screenSize;

        // Sample the texture at the pixelated position
        vec4 color = texture2D(textureSampler, pixelatedUV);

        // Optional: Reduce color palette for more retro feel
        // Quantize to fewer colors (like 16-bit color depth)
        float colorLevels = 32.0; // 32 levels per channel = ~32k colors
        color.rgb = floor(color.rgb * colorLevels) / colorLevels;

        gl_FragColor = color;
    }
`;

export class PixelFilter {
    private scene: Scene;
    private postProcess: PostProcess | null = null;
    private pixelSize: number = 3.0; // Size of pixels (higher = more pixelated)
    private enabled: boolean = true;

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * Apply the pixel filter to a camera
     */
    applyToCamera(camera: Camera): void {
        if (this.postProcess) {
            this.postProcess.dispose();
        }

        this.postProcess = new PostProcess(
            "pixelFilter",
            "pixelFilter",
            ["screenSize", "pixelSize"], // Uniforms
            null, // Samplers
            1.0, // Ratio
            camera,
            0, // Sampling mode (NEAREST for crisp pixels)
            this.scene.getEngine(),
            false // Reusable
        );

        this.postProcess.onApply = (effect: Effect) => {
            const engine = this.scene.getEngine();
            effect.setFloat2("screenSize", engine.getRenderWidth(), engine.getRenderHeight());
            effect.setFloat("pixelSize", this.enabled ? this.pixelSize : 1.0);
        };
    }

    /**
     * Set the pixel size (higher = more pixelated)
     * Recommended values: 2-6 for subtle to heavy pixelation
     */
    setPixelSize(size: number): void {
        this.pixelSize = Math.max(1, Math.min(10, size));
    }

    /**
     * Get current pixel size
     */
    getPixelSize(): number {
        return this.pixelSize;
    }

    /**
     * Enable or disable the filter
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if filter is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Toggle the filter on/off
     */
    toggle(): boolean {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    /**
     * Dispose the post-process
     */
    dispose(): void {
        if (this.postProcess) {
            this.postProcess.dispose();
            this.postProcess = null;
        }
    }
}
