/**
 * Door System
 * Handles interactive doors that can be opened with a kick animation
 */

import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Animation } from '@babylonjs/core/Animations/animation';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { AudioManager } from './AudioManager';
import { InteractiveDoorData } from './LevelData';
import { LoadedAssets } from './AssetLoader';

export interface InteractiveDoor {
    frameNode: TransformNode | null;
    leftDoor: AbstractMesh | null;
    rightDoor: AbstractMesh | null;
    position: Vector3;
    rotation: number;
    isOpen: boolean;
    collider: Mesh | null;
}

export class DoorSystem {
    private scene: Scene;
    private doors: InteractiveDoor[] = [];
    private playerTarget: TransformNode | null = null;
    private interactionRange: number = 3.0;
    private audioManager: AudioManager;
    private assets: LoadedAssets | null = null;
    private doorCounter: number = 0;

    // UI callbacks
    private onDoorNearbyCallback: ((nearby: boolean, door: InteractiveDoor | null) => void) | null = null;
    private onDoorOpenCallback: (() => void) | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
        this.audioManager = AudioManager.getInstance();
    }

    /**
     * Set the assets to use for cloning door meshes
     */
    setAssets(assets: LoadedAssets): void {
        this.assets = assets;
    }

    /**
     * Register interactive doors from level data
     */
    registerDoorsFromLevelData(doorsData: InteractiveDoorData[]): void {
        for (const doorData of doorsData) {
            const position = new Vector3(doorData.position.x, doorData.position.y, doorData.position.z);
            const rotation = (doorData.rotation || 0) * Math.PI / 180;
            this.registerInteractiveDoor(position, rotation);
        }
    }

    /**
     * Clone a door group and attach it to a parent, keeping original relative position
     */
    private cloneDoorToParent(groupName: string, doorId: number, parent: TransformNode): TransformNode | null {
        // Find the original group in the scene
        const groupNode = this.scene.getTransformNodeByName(groupName);

        if (groupNode) {
            // Clone the transform node with the door frame as parent
            const clone = groupNode.clone(`${groupName}_${doorId}`, parent) as TransformNode;
            if (clone) {
                // Keep the original local position/rotation from the GLB
                // (relative to door_framebig_A)
                clone.position = groupNode.position.clone();
                clone.rotation = groupNode.rotation.clone();
                clone.scaling = groupNode.scaling.clone();

                // Make all child meshes visible
                clone.getChildMeshes().forEach(child => {
                    child.isVisible = true;
                });

                return clone;
            }
        }

        console.warn(`[DoorSystem] Could not find group: ${groupName}`);
        return null;
    }

    /**
     * Register a door frame as interactive
     */
    registerInteractiveDoor(position: Vector3, rotation: number = 0): void {
        const doorId = this.doorCounter++;

        // Find the frame mesh at this position (already placed by level loader)
        let frameNode: AbstractMesh | null = null;
        for (const mesh of this.scene.meshes) {
            const meshPos = mesh.getAbsolutePosition();
            if (Math.abs(meshPos.x - position.x) < 1 &&
                Math.abs(meshPos.z - position.z) < 1 &&
                mesh.name.includes('door_framebig')) {
                frameNode = mesh;
                break;
            }
        }

        if (!frameNode) {
            console.warn(`[DoorSystem] Could not find door frame at position (${position.x}, ${position.z})`);
            return;
        }

        // Clone the door groups and parent them to the door frame
        // They will use their original positions from the GLB (relative to the frame)
        const leftDoorNode = this.cloneDoorToParent('door_bigleft', doorId, frameNode);
        const rightDoorNode = this.cloneDoorToParent('door_bigright', doorId, frameNode);

        // Create a collider for the closed door
        const collider = MeshBuilder.CreateBox(`door_collider_${doorId}`, {
            width: rotation === 0 ? 3.0 : 0.5,
            height: 4.0,
            depth: rotation === 0 ? 0.5 : 3.0
        }, this.scene);
        collider.position = position.clone();
        collider.position.y = 2;
        collider.isVisible = false;
        collider.checkCollisions = true;

        const door: InteractiveDoor = {
            frameNode,
            leftDoor: leftDoorNode as AbstractMesh | null,
            rightDoor: rightDoorNode as AbstractMesh | null,
            position: position.clone(),
            rotation,
            isOpen: false,
            collider
        };

        this.doors.push(door);
        console.log(`[DoorSystem] Registered interactive door at (${position.x}, ${position.z}) - left: ${!!leftDoorNode}, right: ${!!rightDoorNode}, frame: ${!!frameNode}`);
    }

    setPlayerTarget(target: TransformNode): void {
        this.playerTarget = target;
    }

    onDoorNearby(callback: (nearby: boolean, door: InteractiveDoor | null) => void): void {
        this.onDoorNearbyCallback = callback;
    }

    onDoorOpen(callback: () => void): void {
        this.onDoorOpenCallback = callback;
    }

    getNearbyDoor(): InteractiveDoor | null {
        if (!this.playerTarget) return null;

        const playerPos = this.playerTarget.getAbsolutePosition();

        for (const door of this.doors) {
            if (door.isOpen) continue;

            const distance = Vector3.Distance(playerPos, door.position);
            if (distance <= this.interactionRange) {
                return door;
            }
        }

        return null;
    }

    /**
     * Try to open the nearest door
     * @returns true if a door was opened
     */
    tryOpenDoor(): boolean {
        const door = this.getNearbyDoor();
        if (!door || door.isOpen) return false;

        this.openDoor(door);
        return true;
    }

    private openDoor(door: InteractiveDoor): void {
        door.isOpen = true;

        // Play door open sound
        this.audioManager.playDoorOpenSound();

        // Animate doors opening (rotate outward based on door orientation)
        const animationDuration = 20; // frames (faster animation)
        const openAngle = Math.PI * 0.6; // ~108 degrees for dramatic effect

        if (door.leftDoor) {
            // Left door opens to the right (positive angle) - inverted for 180° rotation
            this.animateDoorOpen(door.leftDoor, openAngle, animationDuration);
        }

        if (door.rightDoor) {
            // Right door opens to the left (negative angle) - inverted for 180° rotation
            this.animateDoorOpen(door.rightDoor, -openAngle, animationDuration);
        }

        // Remove collider after a short delay
        setTimeout(() => {
            if (door.collider) {
                door.collider.dispose();
                door.collider = null;
                console.log('[DoorSystem] Door collider removed');
            }
        }, 300);

        // Notify callback
        if (this.onDoorOpenCallback) {
            this.onDoorOpenCallback();
        }

        console.log('[DoorSystem] Door opened!');
    }

    private animateDoorOpen(doorMesh: AbstractMesh, targetAngle: number, duration: number): void {
        const startRotation = doorMesh.rotation.y;
        const endRotation = startRotation + targetAngle;

        const animation = new Animation(
            'doorOpen',
            'rotation.y',
            30,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CONSTANT
        );

        animation.setKeys([
            { frame: 0, value: startRotation },
            { frame: duration, value: endRotation }
        ]);

        doorMesh.animations = [animation];
        this.scene.beginAnimation(doorMesh, 0, duration, false);
    }

    update(): void {
        if (!this.playerTarget) return;

        const nearbyDoor = this.getNearbyDoor();

        if (this.onDoorNearbyCallback) {
            this.onDoorNearbyCallback(nearbyDoor !== null, nearbyDoor);
        }
    }

    dispose(): void {
        this.doors = [];
        this.onDoorNearbyCallback = null;
        this.onDoorOpenCallback = null;
    }
}
