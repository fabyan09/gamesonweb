/**
 * Healing Effect
 * Creates floating green "+" particles when the player drinks a potion
 */

import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';

export class HealingEffect {
    private scene: Scene;
    private emitterMesh: AbstractMesh;
    private plusTexture: Texture | null = null;
    private playerTarget: TransformNode | AbstractMesh | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
        // Create invisible emitter mesh
        this.emitterMesh = MeshBuilder.CreateBox("healingEmitter", { size: 0.1 }, scene);
        this.emitterMesh.isVisible = false;
        this.emitterMesh.isPickable = false;

        // Pre-create the texture
        this.createPlusTexture();
    }

    /**
     * Create a procedural "+" texture
     */
    private createPlusTexture(): Texture {
        if (this.plusTexture) {
            return this.plusTexture;
        }

        const size = 128; // Larger texture for better quality
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // Clear with transparent background
        ctx.clearRect(0, 0, size, size);

        const center = size / 2;
        const thickness = 24;
        const length = 100;

        // Draw shadow/glow first
        ctx.shadowColor = 'rgba(0, 255, 0, 1)';
        ctx.shadowBlur = 15;
        ctx.fillStyle = 'rgba(50, 255, 50, 1)';

        // Horizontal bar
        ctx.fillRect(
            center - length / 2,
            center - thickness / 2,
            length,
            thickness
        );

        // Vertical bar
        ctx.fillRect(
            center - thickness / 2,
            center - length / 2,
            thickness,
            length
        );

        // Draw brighter center
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(150, 255, 150, 1)';
        const innerThickness = 12;
        const innerLength = 80;

        ctx.fillRect(
            center - innerLength / 2,
            center - innerThickness / 2,
            innerLength,
            innerThickness
        );
        ctx.fillRect(
            center - innerThickness / 2,
            center - innerLength / 2,
            innerThickness,
            innerLength
        );

        // White highlight in center
        ctx.fillStyle = 'rgba(220, 255, 220, 1)';
        const highlightThickness = 6;
        const highlightLength = 60;

        ctx.fillRect(
            center - highlightLength / 2,
            center - highlightThickness / 2,
            highlightLength,
            highlightThickness
        );
        ctx.fillRect(
            center - highlightThickness / 2,
            center - highlightLength / 2,
            highlightThickness,
            highlightLength
        );

        this.plusTexture = new Texture(canvas.toDataURL(), this.scene, false, false);
        return this.plusTexture;
    }

    /**
     * Set the player to follow
     */
    setPlayerTarget(target: TransformNode | AbstractMesh): void {
        this.playerTarget = target;
    }

    /**
     * Play the healing effect (call this when potion is consumed)
     */
    play(): void {
        if (!this.playerTarget) {
            console.warn('[HealingEffect] No player target set');
            return;
        }

        console.log('[HealingEffect] Playing healing effect');

        // Update emitter position to player
        const pos = this.playerTarget.getAbsolutePosition();
        this.emitterMesh.position.copyFrom(pos);
        this.emitterMesh.position.y += 1; // Start at chest height

        // Create particle system for this burst
        const particleSystem = new ParticleSystem("healingParticles", 50, this.scene);
        particleSystem.particleTexture = this.createPlusTexture();

        // Emit from player position
        particleSystem.emitter = this.emitterMesh;

        // Small emission area around player
        particleSystem.minEmitBox = new Vector3(-0.3, 0, -0.3);
        particleSystem.maxEmitBox = new Vector3(0.3, 0.3, 0.3);

        // LARGER particle size for visibility
        particleSystem.minSize = 0.3;
        particleSystem.maxSize = 0.5;

        // Lifetime
        particleSystem.minLifeTime = 1.0;
        particleSystem.maxLifeTime = 2.0;

        // Emit rate - continuous for the burst duration
        particleSystem.emitRate = 20;

        // Bright green colors
        particleSystem.color1 = new Color4(0.2, 1, 0.2, 1);
        particleSystem.color2 = new Color4(0.4, 1, 0.4, 1);
        particleSystem.colorDead = new Color4(0.1, 0.8, 0.1, 0);

        // Float upward
        particleSystem.direction1 = new Vector3(-0.5, 2, -0.5);
        particleSystem.direction2 = new Vector3(0.5, 3, 0.5);
        particleSystem.minEmitPower = 0.5;
        particleSystem.maxEmitPower = 1.5;

        // Upward gravity
        particleSystem.gravity = new Vector3(0, 1, 0);

        // Additive blending for glow
        particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;

        // Billboard mode - always face camera
        particleSystem.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;

        // Start the effect
        particleSystem.start();

        // Stop emission after short burst
        setTimeout(() => {
            particleSystem.stop();
        }, 500);

        // Dispose after all particles are gone
        setTimeout(() => {
            particleSystem.dispose();
        }, 3000);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        if (this.plusTexture) {
            this.plusTexture.dispose();
            this.plusTexture = null;
        }
        this.emitterMesh.dispose();
    }
}
