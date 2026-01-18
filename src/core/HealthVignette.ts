/**
 * Health Vignette Post-Process
 * Creates a dark red vignette effect that intensifies as health decreases
 */

import { Scene } from '@babylonjs/core/scene';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { Effect } from '@babylonjs/core/Materials/effect';

// Register the custom shader
Effect.ShadersStore["healthVignetteFragmentShader"] = `
    precision highp float;

    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float intensity; // 0.0 = no vignette, 1.0 = max vignette

    void main(void) {
        vec4 color = texture2D(textureSampler, vUV);

        // Calculate distance from center (0,0 at center, 1 at corners)
        vec2 center = vUV - 0.5;
        float dist = length(center) * 1.414; // Normalize so corners = 1

        // Vignette shape - stronger at edges
        float vignette = smoothstep(0.2, 1.0, dist);

        // Apply vignette based on intensity (health loss)
        // Dark red color for damage
        vec3 vignetteColor = vec3(0.3, 0.0, 0.0);

        // Mix original color with vignette
        float vignetteStrength = vignette * intensity * 0.8;
        color.rgb = mix(color.rgb, vignetteColor, vignetteStrength);

        // Also darken the edges more
        float darken = 1.0 - (vignette * intensity * 0.5);
        color.rgb *= darken;

        gl_FragColor = color;
    }
`;

export class HealthVignette {
    private scene: Scene;
    private postProcess: PostProcess | null = null;
    private intensity: number = 0.0; // 0 = full health, 1 = near death

    constructor(scene: Scene) {
        this.scene = scene;
    }

    /**
     * Apply the vignette effect to a camera
     */
    applyToCamera(camera: Camera): void {
        if (this.postProcess) {
            this.postProcess.dispose();
        }

        this.postProcess = new PostProcess(
            "healthVignette",
            "healthVignette",
            ["intensity"], // Uniforms
            null, // Samplers
            1.0, // Ratio
            camera,
            1, // Sampling mode (BILINEAR)
            this.scene.getEngine(),
            false // Reusable
        );

        this.postProcess.onApply = (effect: Effect) => {
            effect.setFloat("intensity", this.intensity);
        };
    }

    /**
     * Update the vignette based on current health
     * @param currentHealth Current health points (0-100)
     * @param maxHealth Maximum health points (default 100)
     */
    updateHealth(currentHealth: number, maxHealth: number = 100): void {
        // Calculate intensity: 0 at full health, 1 at 0 health
        const healthPercent = Math.max(0, Math.min(1, currentHealth / maxHealth));

        // Inverse: more damage = more vignette
        // Use a curve so effect is subtle at high health, stronger at low health
        this.intensity = Math.pow(1 - healthPercent, 1.5);
    }

    /**
     * Set intensity directly (0-1)
     */
    setIntensity(intensity: number): void {
        this.intensity = Math.max(0, Math.min(1, intensity));
    }

    /**
     * Get current intensity
     */
    getIntensity(): number {
        return this.intensity;
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
