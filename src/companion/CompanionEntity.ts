/**
 * CompanionEntity.ts
 * 3D spectral representation of the Spirit of the Dungeon.
 * A ghostly orb made of particles with glow, following the player with smooth lerp.
 */

import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

export class CompanionEntity {
    private scene: Scene;
    private rootNode: TransformNode;
    private emitterMesh: AbstractMesh;
    private coreParticles: ParticleSystem | null = null;
    private auraParticles: ParticleSystem | null = null;
    private playerTarget: TransformNode | null = null;

    // Movement parameters
    private readonly followDistance = 2.0;   // Stay 2 units away from player
    private readonly followHeight = 2.5;     // Float above ground
    private readonly lerpSpeed = 0.03;       // Smooth follow speed
    private readonly bobAmplitude = 0.15;    // Vertical bobbing amount
    private readonly bobFrequency = 1.5;     // Bobbing speed

    // Offset angle for orbiting around player
    private orbitAngle: number = Math.PI * 0.75; // Start to the left-behind
    private readonly orbitSpeed = 0.3; // Slow orbit

    private time: number = 0;
    private isVisible: boolean = true;

    constructor(scene: Scene) {
        this.scene = scene;

        // Root node for positioning
        this.rootNode = new TransformNode('companionRoot', scene);

        // Emitter mesh (invisible, used as particle origin)
        this.emitterMesh = MeshBuilder.CreateSphere('companionEmitter', {
            diameter: 0.1
        }, scene);
        this.emitterMesh.parent = this.rootNode;
        this.emitterMesh.isVisible = false;
        this.emitterMesh.isPickable = false;

        // No PointLight here - would break the light culling system.
        // The glow comes from additive-blend particles only.

        this.createParticles();
        this.startUpdateLoop();
    }

    private createParticles(): void {
        // Create particle texture (soft glowing circle)
        const particleTexture = this.createGlowTexture();

        // === Core particles (dense, bright center) ===
        this.coreParticles = new ParticleSystem('companionCore', 60, this.scene);
        this.coreParticles.particleTexture = particleTexture;
        this.coreParticles.emitter = this.emitterMesh;

        // Small emission area
        this.coreParticles.minEmitBox = new Vector3(-0.05, -0.05, -0.05);
        this.coreParticles.maxEmitBox = new Vector3(0.05, 0.05, 0.05);

        // Small bright particles
        this.coreParticles.minSize = 0.08;
        this.coreParticles.maxSize = 0.2;

        this.coreParticles.minLifeTime = 0.3;
        this.coreParticles.maxLifeTime = 0.8;
        this.coreParticles.emitRate = 40;

        // Blue-white spectral colors
        this.coreParticles.color1 = new Color4(0.5, 0.8, 1.0, 1.0);
        this.coreParticles.color2 = new Color4(0.3, 0.5, 1.0, 0.8);
        this.coreParticles.colorDead = new Color4(0.1, 0.2, 0.6, 0.0);

        // Gentle drift
        this.coreParticles.direction1 = new Vector3(-0.2, 0.3, -0.2);
        this.coreParticles.direction2 = new Vector3(0.2, 0.5, 0.2);
        this.coreParticles.minEmitPower = 0.1;
        this.coreParticles.maxEmitPower = 0.3;
        this.coreParticles.gravity = new Vector3(0, 0.1, 0);

        // Additive blending for glow
        this.coreParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
        this.coreParticles.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;

        this.coreParticles.start();

        // === Aura particles (wider, fainter, ethereal trails) ===
        this.auraParticles = new ParticleSystem('companionAura', 30, this.scene);
        this.auraParticles.particleTexture = particleTexture;
        this.auraParticles.emitter = this.emitterMesh;

        // Wider emission
        this.auraParticles.minEmitBox = new Vector3(-0.2, -0.2, -0.2);
        this.auraParticles.maxEmitBox = new Vector3(0.2, 0.2, 0.2);

        // Larger, fainter particles
        this.auraParticles.minSize = 0.15;
        this.auraParticles.maxSize = 0.4;

        this.auraParticles.minLifeTime = 0.5;
        this.auraParticles.maxLifeTime = 1.5;
        this.auraParticles.emitRate = 15;

        // Fainter blue
        this.auraParticles.color1 = new Color4(0.2, 0.4, 0.8, 0.5);
        this.auraParticles.color2 = new Color4(0.1, 0.3, 0.7, 0.3);
        this.auraParticles.colorDead = new Color4(0.05, 0.1, 0.4, 0.0);

        // More spread
        this.auraParticles.direction1 = new Vector3(-0.5, -0.2, -0.5);
        this.auraParticles.direction2 = new Vector3(0.5, 0.5, 0.5);
        this.auraParticles.minEmitPower = 0.05;
        this.auraParticles.maxEmitPower = 0.2;
        this.auraParticles.gravity = new Vector3(0, 0.05, 0);

        this.auraParticles.blendMode = ParticleSystem.BLENDMODE_ADD;
        this.auraParticles.billboardMode = ParticleSystem.BILLBOARDMODE_ALL;

        this.auraParticles.start();
    }

    private createGlowTexture(): Texture {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;

        // Radial gradient for soft glow
        const gradient = ctx.createRadialGradient(
            size / 2, size / 2, 0,
            size / 2, size / 2, size / 2
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(200, 220, 255, 0.8)');
        gradient.addColorStop(0.6, 'rgba(100, 150, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(50, 80, 200, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        return new Texture(canvas.toDataURL(), this.scene, false, false);
    }

    /**
     * Set the player to follow
     */
    setPlayerTarget(target: TransformNode): void {
        this.playerTarget = target;
        // Initialize position near player
        const playerPos = target.position;
        this.rootNode.position = new Vector3(
            playerPos.x + this.followDistance,
            playerPos.y + this.followHeight,
            playerPos.z
        );
    }

    private startUpdateLoop(): void {
        this.scene.onBeforeRenderObservable.add(() => {
            if (this.scene.metadata?.isPaused || !this.isVisible) return;
            this.update();
        });
    }

    private update(): void {
        if (!this.playerTarget) return;

        const dt = this.scene.getEngine().getDeltaTime() / 1000;
        this.time += dt;

        // Calculate target position (orbit around player)
        this.orbitAngle += this.orbitSpeed * dt;
        const playerPos = this.playerTarget.position;

        const targetX = playerPos.x + Math.cos(this.orbitAngle) * this.followDistance;
        const targetZ = playerPos.z + Math.sin(this.orbitAngle) * this.followDistance;
        const bobOffset = Math.sin(this.time * this.bobFrequency * Math.PI * 2) * this.bobAmplitude;
        const targetY = playerPos.y + this.followHeight + bobOffset;

        // Smooth follow with lerp
        const currentPos = this.rootNode.position;
        currentPos.x += (targetX - currentPos.x) * this.lerpSpeed;
        currentPos.y += (targetY - currentPos.y) * this.lerpSpeed;
        currentPos.z += (targetZ - currentPos.z) * this.lerpSpeed;
    }

    /**
     * Get the position of the companion (for UI bubble attachment)
     */
    get position(): Vector3 {
        return this.rootNode.position;
    }

    get transformNode(): TransformNode {
        return this.rootNode;
    }

    /**
     * Flash the companion when speaking (intensify particles briefly)
     */
    flashOnSpeak(): void {
        if (!this.coreParticles) return;

        const originalRate = this.coreParticles.emitRate;
        const originalMinSize = this.coreParticles.minSize;
        const originalMaxSize = this.coreParticles.maxSize;

        // Intensify
        this.coreParticles.emitRate = 80;
        this.coreParticles.minSize = 0.12;
        this.coreParticles.maxSize = 0.3;

        // Return to normal after 500ms
        setTimeout(() => {
            if (this.coreParticles) {
                this.coreParticles.emitRate = originalRate;
                this.coreParticles.minSize = originalMinSize;
                this.coreParticles.maxSize = originalMaxSize;
            }
        }, 500);
    }

    /**
     * Show/hide the companion
     */
    setVisible(visible: boolean): void {
        this.isVisible = visible;
        if (this.coreParticles) {
            if (visible) this.coreParticles.start();
            else this.coreParticles.stop();
        }
        if (this.auraParticles) {
            if (visible) this.auraParticles.start();
            else this.auraParticles.stop();
        }
    }

    dispose(): void {
        this.coreParticles?.dispose();
        this.auraParticles?.dispose();
        this.emitterMesh.dispose();
        this.rootNode.dispose();
    }
}
