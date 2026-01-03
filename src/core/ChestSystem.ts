/**
 * Chest System
 * Handles tomb chests that contain potions and arrows
 * Items spawn on the ground when chest is opened (Fortnite-style)
 */

import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Animation } from '@babylonjs/core/Animations/animation';
import { PlayerInventory, PotionType } from './PlayerInventory';
import { AudioManager } from './AudioManager';

export interface ChestData {
    mesh: AbstractMesh;
    position: Vector3;
    isOpen: boolean;
    originalMeshName: string;
    parentNode: TransformNode | null;
}

export interface ChestContents {
    potions: PotionType[];
    arrows: number;
}

export interface DroppedItem {
    mesh: TransformNode;
    type: 'potion' | 'arrows';
    potionType?: PotionType;
    arrowCount?: number;
    position: Vector3;
    bobOffset: number;
}

export class ChestSystem {
    private scene: Scene;
    private chests: ChestData[] = [];
    private playerInventory: PlayerInventory;
    private playerTarget: TransformNode | null = null;
    private isArcherMode: boolean = false;
    private interactionRange: number = 2.5;
    private itemPickupRange: number = 1.5;
    private audioManager: AudioManager;

    // Template meshes for items
    private potionTemplates: Map<PotionType, TransformNode> = new Map();
    private arrowTemplate: TransformNode | null = null;

    // Template for open tomb (stored as AbstractMesh for cloning)
    private tombBTemplate: AbstractMesh | null = null;

    // Dropped items on the ground
    private droppedItems: DroppedItem[] = [];
    private bobTime: number = 0;

    // UI callbacks
    private onChestNearbyCallback: ((nearby: boolean, chest: ChestData | null) => void) | null = null;
    private onChestOpenCallback: ((contents: ChestContents) => void) | null = null;
    private onItemNearbyCallback: ((nearby: boolean, item: DroppedItem | null) => void) | null = null;

    constructor(scene: Scene, inventory: PlayerInventory, isArcher: boolean = false) {
        this.scene = scene;
        this.playerInventory = inventory;
        this.isArcherMode = isArcher;
        this.audioManager = AudioManager.getInstance();
    }

    /**
     * Load required assets for the chest system (using simple lightweight meshes)
     */
    async loadAssets(_basePath: string): Promise<void> {
        console.log('[ChestSystem] Creating lightweight item templates...');

        // Create simple potion templates using primitives (much faster than GLB)
        // Colors for each potion type
        const potionColors: Record<PotionType, Color3> = {
            'p1': new Color3(1, 0.5, 0),    // Orange - small heal
            'p2': new Color3(0, 0.5, 1),    // Blue - medium heal
            'p3': new Color3(0, 1, 0),      // Green - large heal
            'p4': new Color3(1, 0, 0.3)     // Red/Pink - full heal
        };

        for (const [type, color] of Object.entries(potionColors) as [PotionType, Color3][]) {
            // Create a simple potion bottle shape (cylinder + sphere top)
            const container = new TransformNode(`potion_template_${type}`, this.scene);

            // Bottle body (cylinder)
            const bottle = MeshBuilder.CreateCylinder(`potion_${type}_bottle`, {
                height: 0.3,
                diameterTop: 0.1,
                diameterBottom: 0.15,
                tessellation: 8
            }, this.scene);
            bottle.parent = container;

            // Bottle cork (small cylinder on top)
            const cork = MeshBuilder.CreateCylinder(`potion_${type}_cork`, {
                height: 0.08,
                diameter: 0.08,
                tessellation: 6
            }, this.scene);
            cork.position.y = 0.19;
            cork.parent = container;

            // Create materials
            const bottleMat = new StandardMaterial(`potion_${type}_mat`, this.scene);
            bottleMat.diffuseColor = color;
            bottleMat.emissiveColor = color.scale(0.3); // Slight glow
            bottleMat.alpha = 0.8;
            bottle.material = bottleMat;

            const corkMat = new StandardMaterial(`potion_${type}_cork_mat`, this.scene);
            corkMat.diffuseColor = new Color3(0.4, 0.25, 0.1); // Brown cork
            cork.material = corkMat;

            container.setEnabled(false);
            this.potionTemplates.set(type, container);
        }

        // Create simple arrow template for archer
        if (this.isArcherMode) {
            const container = new TransformNode('arrow_template', this.scene);

            // Arrow shaft
            const shaft = MeshBuilder.CreateCylinder('arrow_shaft', {
                height: 0.6,
                diameter: 0.03,
                tessellation: 6
            }, this.scene);
            shaft.rotation.x = Math.PI / 2;
            shaft.parent = container;

            // Arrow head
            const head = MeshBuilder.CreateCylinder('arrow_head', {
                height: 0.12,
                diameterTop: 0,
                diameterBottom: 0.06,
                tessellation: 4
            }, this.scene);
            head.rotation.x = Math.PI / 2;
            head.position.z = 0.36;
            head.parent = container;

            // Fletching (feathers)
            const fletch = MeshBuilder.CreateBox('arrow_fletch', {
                width: 0.1,
                height: 0.08,
                depth: 0.01
            }, this.scene);
            fletch.position.z = -0.25;
            fletch.parent = container;

            // Materials
            const shaftMat = new StandardMaterial('arrow_shaft_mat', this.scene);
            shaftMat.diffuseColor = new Color3(0.5, 0.35, 0.2); // Wood color
            shaft.material = shaftMat;

            const headMat = new StandardMaterial('arrow_head_mat', this.scene);
            headMat.diffuseColor = new Color3(0.3, 0.3, 0.35); // Metal color
            head.material = headMat;

            const fletchMat = new StandardMaterial('arrow_fletch_mat', this.scene);
            fletchMat.diffuseColor = new Color3(1, 1, 1); // White feathers
            fletch.material = fletchMat;

            container.setEnabled(false);
            this.arrowTemplate = container;
        }

        console.log(`[ChestSystem] Templates created: ${this.potionTemplates.size} potion types, arrow: ${!!this.arrowTemplate}`);
    }

    /**
     * Find and store the tomb_B template for later cloning
     */
    private findTombBTemplate(): void {
        // Find a tomb_B mesh to use as template (store the mesh directly, not parent)
        const tombB = this.scene.meshes.find(m => {
            const name = m.name.toLowerCase();
            return name.includes('tomb_b') && !name.includes('collider');
        });

        if (tombB) {
            this.tombBTemplate = tombB;
            console.log(`[ChestSystem] Found tomb_B template: ${tombB.name}, enabled=${tombB.isEnabled()}, visible=${tombB.isVisible}`);
        } else {
            console.warn('[ChestSystem] No tomb_B template found in scene');
        }
    }

    /**
     * Scan the scene for tomb meshes and register them as chests
     */
    registerChests(): void {
        // First find the tomb_B template
        this.findTombBTemplate();

        // Find all tomb_A and tomb_C meshes (closed chests)
        const tombMeshes = this.scene.meshes.filter(mesh => {
            const name = mesh.name.toLowerCase();
            return (name.includes('tomb_a') || name.includes('tomb_c')) &&
                   !name.includes('collider');
        });

        console.log(`[ChestSystem] Found ${tombMeshes.length} tomb meshes to register:`);

        for (const mesh of tombMeshes) {
            // Calculate world position
            mesh.computeWorldMatrix(true);
            const worldPos = mesh.getAbsolutePosition().clone();

            // Get the parent node that contains the whole tomb
            const parentNode = mesh.parent as TransformNode || null;

            console.log(`[ChestSystem]   - "${mesh.name}" at world position ${worldPos}, parent: ${parentNode?.name || 'none'}`);

            this.chests.push({
                mesh: mesh,
                position: worldPos,
                isOpen: false,
                originalMeshName: mesh.name,
                parentNode: parentNode
            });
        }

        console.log(`[ChestSystem] Registered ${this.chests.length} chests total`);
    }

    /**
     * Set the player target for distance checking
     */
    setPlayerTarget(target: TransformNode): void {
        this.playerTarget = target;
    }

    /**
     * Set callback for when player is near a chest
     */
    onChestNearby(callback: (nearby: boolean, chest: ChestData | null) => void): void {
        this.onChestNearbyCallback = callback;
    }

    /**
     * Set callback for when a chest is opened
     */
    onChestOpen(callback: (contents: ChestContents) => void): void {
        this.onChestOpenCallback = callback;
    }

    /**
     * Set callback for when player is near an item
     */
    onItemNearby(callback: (nearby: boolean, item: DroppedItem | null) => void): void {
        this.onItemNearbyCallback = callback;
    }

    /**
     * Check for nearby chests and items (call each frame)
     */
    update(): void {
        if (!this.playerTarget) return;

        const playerPos = this.playerTarget.position;

        // Check for nearby chests
        let nearestChest: ChestData | null = null;
        let nearestChestDistance = this.interactionRange;

        for (const chest of this.chests) {
            if (chest.isOpen) continue;

            const distance = Vector3.Distance(playerPos, chest.position);
            if (distance < nearestChestDistance) {
                nearestChestDistance = distance;
                nearestChest = chest;
            }
        }

        if (this.onChestNearbyCallback) {
            this.onChestNearbyCallback(nearestChest !== null, nearestChest);
        }

        // Check for nearby items
        let nearestItem: DroppedItem | null = null;
        let nearestItemDistance = this.itemPickupRange;

        for (const item of this.droppedItems) {
            const distance = Vector3.Distance(playerPos, item.position);
            if (distance < nearestItemDistance) {
                nearestItemDistance = distance;
                nearestItem = item;
            }
        }

        if (this.onItemNearbyCallback) {
            this.onItemNearbyCallback(nearestItem !== null, nearestItem);
        }

        // Animate dropped items (bobbing effect)
        this.bobTime += 0.05;
        for (const item of this.droppedItems) {
            const bobHeight = Math.sin(this.bobTime + item.bobOffset) * 0.1;
            item.mesh.position.y = item.position.y + 0.5 + bobHeight;
            item.mesh.rotation.y += 0.02; // Rotate slowly
        }
    }

    /**
     * Try to open the nearest chest
     * @returns the contents if a chest was opened, null otherwise
     */
    tryOpenChest(): ChestContents | null {
        if (!this.playerTarget) {
            console.log('[ChestSystem] tryOpenChest: No player target');
            return null;
        }

        const playerPos = this.playerTarget.position;
        console.log(`[ChestSystem] tryOpenChest: Player at ${playerPos}, checking ${this.chests.length} chests`);

        // Find nearest unopened chest
        let nearestChest: ChestData | null = null;
        let nearestDistance = this.interactionRange;

        for (const chest of this.chests) {
            const distance = Vector3.Distance(playerPos, chest.position);
            console.log(`[ChestSystem]   - Chest "${chest.mesh.name}" at ${chest.position}, distance=${distance.toFixed(2)}, isOpen=${chest.isOpen}`);

            if (chest.isOpen) continue;

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestChest = chest;
            }
        }

        if (!nearestChest) {
            console.log(`[ChestSystem] No chest in range (range=${this.interactionRange})`);
            return null;
        }

        console.log(`[ChestSystem] Found nearest chest: "${nearestChest.mesh.name}" at distance ${nearestDistance.toFixed(2)}`);

        // Open the chest
        return this.openChest(nearestChest);
    }

    /**
     * Try to pick up the nearest item
     * @returns true if an item was picked up
     */
    tryPickupItem(): boolean {
        if (!this.playerTarget) return false;

        const playerPos = this.playerTarget.position;

        // Find nearest item
        let nearestItem: DroppedItem | null = null;
        let nearestIndex = -1;
        let nearestDistance = this.itemPickupRange;

        for (let i = 0; i < this.droppedItems.length; i++) {
            const item = this.droppedItems[i];
            const distance = Vector3.Distance(playerPos, item.position);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestItem = item;
                nearestIndex = i;
            }
        }

        if (!nearestItem || nearestIndex === -1) {
            return false;
        }

        // Pick up the item
        if (nearestItem.type === 'potion' && nearestItem.potionType) {
            if (this.playerInventory.addPotion(nearestItem.potionType)) {
                this.removeItem(nearestIndex);
                this.audioManager.playPotionPickupSound(); // bottle.wav
                return true;
            }
        } else if (nearestItem.type === 'arrows' && nearestItem.arrowCount) {
            const added = this.playerInventory.addArrows(nearestItem.arrowCount);
            if (added > 0) {
                this.removeItem(nearestIndex);
                this.audioManager.playArrowPickupSound(); // wood.wav
                return true;
            }
        }

        return false;
    }

    /**
     * Remove an item from the dropped items list
     */
    private removeItem(index: number): void {
        const item = this.droppedItems[index];
        if (item) {
            item.mesh.dispose();
            this.droppedItems.splice(index, 1);
        }
    }

    /**
     * Open a specific chest and generate its contents
     */
    private openChest(chest: ChestData): ChestContents {
        console.log(`[ChestSystem] Opening chest: "${chest.mesh.name}" (already open: ${chest.isOpen})`);

        if (chest.isOpen) {
            console.warn(`[ChestSystem] Chest "${chest.mesh.name}" is already open! Skipping.`);
            return { potions: [], arrows: 0 };
        }

        chest.isOpen = true;

        // Generate random contents based on class
        const contents = this.generateChestContents();
        console.log(`[ChestSystem] Generated contents for chest: ${contents.potions.length} potions (${contents.potions.join(', ')}), ${contents.arrows} arrows`);

        // Visual: swap mesh to open tomb (tomb_B)
        this.swapToOpenedMesh(chest);

        // Spawn items on the ground in front of the player
        this.spawnItems(chest, contents);

        // Play chest open sound
        this.audioManager.playChestOpenSound();

        console.log(`[ChestSystem] Opened chest! Total dropped items now: ${this.droppedItems.length}`);

        if (this.onChestOpenCallback) {
            this.onChestOpenCallback(contents);
        }

        return contents;
    }

    /**
     * Spawn items on the ground near the chest
     */
    private spawnItems(chest: ChestData, contents: ChestContents): void {
        if (!this.playerTarget) {
            console.warn('[ChestSystem] Cannot spawn items - no player target');
            return;
        }

        // Calculate spawn position (between chest and player)
        const chestPos = chest.position;
        const playerPos = this.playerTarget.position;
        const direction = playerPos.subtract(chestPos).normalize();

        console.log(`[ChestSystem] Spawning items at chest pos ${chestPos}, player pos ${playerPos}`);

        let offsetIndex = 0;
        const spacing = 0.6;

        // Spawn potions
        for (const potionType of contents.potions) {
            const template = this.potionTemplates.get(potionType);
            if (!template) {
                console.warn(`[ChestSystem] No template for potion type ${potionType}`);
                continue;
            }

            const spawnPos = chestPos.add(direction.scale(1.5 + offsetIndex * spacing));
            spawnPos.y = chestPos.y;

            console.log(`[ChestSystem] Spawning potion ${potionType} at ${spawnPos}`);
            const item = this.createDroppedItem(template, spawnPos, 'potion', potionType);
            if (item) {
                this.droppedItems.push(item);
                this.animateItemSpawn(item);
                console.log(`[ChestSystem] Created potion item, total items: ${this.droppedItems.length}`);
            } else {
                console.warn(`[ChestSystem] Failed to create potion item for ${potionType}`);
            }
            offsetIndex++;
        }

        // Spawn arrows (as a pack)
        if (contents.arrows > 0 && this.arrowTemplate) {
            const spawnPos = chestPos.add(direction.scale(1.5 + offsetIndex * spacing));
            spawnPos.y = chestPos.y;

            console.log(`[ChestSystem] Spawning ${contents.arrows} arrows at ${spawnPos}`);
            const item = this.createDroppedItem(this.arrowTemplate, spawnPos, 'arrows', undefined, contents.arrows);
            if (item) {
                this.droppedItems.push(item);
                this.animateItemSpawn(item);
                console.log(`[ChestSystem] Created arrows item, total items: ${this.droppedItems.length}`);
            } else {
                console.warn('[ChestSystem] Failed to create arrows item');
            }
        } else if (contents.arrows > 0 && !this.arrowTemplate) {
            console.warn('[ChestSystem] Has arrows but no arrow template loaded');
        }
    }

    /**
     * Create a dropped item from a template
     */
    private createDroppedItem(
        template: TransformNode,
        position: Vector3,
        type: 'potion' | 'arrows',
        potionType?: PotionType,
        arrowCount?: number
    ): DroppedItem | null {
        // Clone the template
        const clone = template.clone(`dropped_${type}_${Date.now()}`, null);
        if (!clone) return null;

        clone.position = position.clone();
        clone.position.y += 0.5; // Slightly above ground
        clone.setEnabled(true);

        // Enable all child meshes
        clone.getChildMeshes().forEach(mesh => {
            mesh.setEnabled(true);
        });

        // Scale based on item type - arrows are much larger in the GLB so scale them down
        if (type === 'arrows') {
            clone.scaling = new Vector3(0.8, 0.8, 0.8); // Arrow is huge, scale way down
        } else {
            clone.scaling = new Vector3(1, 1, 1); // Potions at normal scale
        }

        return {
            mesh: clone,
            type,
            potionType,
            arrowCount,
            position: position.clone(),
            bobOffset: Math.random() * Math.PI * 2
        };
    }

    /**
     * Animate item spawning (pop-up effect)
     */
    private animateItemSpawn(item: DroppedItem): void {
        const startY = item.position.y;
        const peakY = startY + 1.5;

        // Create animation
        const animation = new Animation(
            'itemSpawn',
            'position.y',
            60,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CONSTANT
        );

        const keys = [
            { frame: 0, value: startY },
            { frame: 15, value: peakY },
            { frame: 30, value: startY + 0.5 }
        ];

        animation.setKeys(keys);
        item.mesh.animations = [animation];
        this.scene.beginAnimation(item.mesh, 0, 30, false);
    }

    /**
     * Generate random contents for a chest based on player class
     */
    private generateChestContents(): ChestContents {
        const contents: ChestContents = {
            potions: [],
            arrows: 0
        };

        // Archer: always 1 potion + 3 arrows
        // Knight: always 1 potion

        // Always give 1 potion - random type (weighted: more common = smaller heal)
        const rand = Math.random();
        let potionType: PotionType;
        if (rand < 0.4) {
            potionType = 'p1'; // 40% small
        } else if (rand < 0.7) {
            potionType = 'p2'; // 30% medium
        } else if (rand < 0.9) {
            potionType = 'p3'; // 20% large
        } else {
            potionType = 'p4'; // 10% full
        }
        contents.potions.push(potionType);

        // Archer always gets arrows
        if (this.isArcherMode) {
            contents.arrows = 3; // Pack of 3 arrows
        }

        return contents;
    }

    /**
     * Swap the closed tomb mesh with an open one (tomb_B)
     * Only hides the visual mesh - colliders remain active
     */
    private swapToOpenedMesh(chest: ChestData): void {
        console.log(`[ChestSystem] Swapping chest mesh: ${chest.mesh.name} at world position ${chest.position}`);

        // ONLY hide the visual mesh - do NOT touch colliders!
        // Using isVisible = false keeps collisions but hides the visual
        chest.mesh.isVisible = false;

        // Use the stored tomb_B template (found during registerChests)
        if (this.tombBTemplate) {
            console.log(`[ChestSystem] Using tomb_B template: ${this.tombBTemplate.name}`);
            console.log(`[ChestSystem] Template position: ${this.tombBTemplate.position}, rotation: ${this.tombBTemplate.rotation}`);
            console.log(`[ChestSystem] Chest mesh position: ${chest.mesh.position}, rotation: ${chest.mesh.rotation}`);

            // Clone just this single mesh
            const cloneName = `opened_tomb_${Date.now()}`;
            const cloned = this.tombBTemplate.clone(cloneName, null);
            if (cloned) {
                // IMPORTANT: Reset the clone's transform first (clone inherits template's transform)
                cloned.position.set(0, 0, 0);
                cloned.rotation.set(0, 0, 0);
                cloned.rotationQuaternion = null; // Clear quaternion to use euler angles
                cloned.scaling.set(1, 1, 1);

                // Now apply the chest's transform
                // Use LOCAL position and rotation from the chest mesh (not world position)
                cloned.position = chest.mesh.position.clone();
                cloned.scaling = chest.mesh.scaling.clone();

                // Copy rotation and compensate for tomb_B's 90° offset vs tomb_A/C
                // Always use euler angles to avoid Quaternion import issues
                cloned.rotationQuaternion = null; // Force euler angles mode
                if (chest.mesh.rotationQuaternion) {
                    // Convert quaternion to euler angles
                    const euler = chest.mesh.rotationQuaternion.toEulerAngles();
                    cloned.rotation.x = euler.x;
                    cloned.rotation.y = euler.y + Math.PI / 2; // Add 90° compensation
                    cloned.rotation.z = euler.z;
                } else {
                    cloned.rotation = chest.mesh.rotation.clone();
                    // Add 90° (PI/2) to Y rotation to compensate
                    cloned.rotation.y += Math.PI / 2;
                }

                cloned.isVisible = true;
                cloned.setEnabled(true);

                // Make sure cloned mesh doesn't have collision (it's just visual)
                cloned.checkCollisions = false;

                console.log(`[ChestSystem] Created open tomb "${cloneName}" at position ${cloned.position}, rotation ${cloned.rotation}`);
            }
        } else {
            console.warn('[ChestSystem] No tomb_B template found - listing available meshes with "tomb":');
            this.scene.meshes.forEach(m => {
                if (m.name.toLowerCase().includes('tomb')) {
                    console.log(`  - ${m.name} (enabled=${m.isEnabled()}, visible=${m.isVisible})`);
                }
            });
        }
    }

    /**
     * Get all chests
     */
    getChests(): ChestData[] {
        return this.chests;
    }

    /**
     * Get count of unopened chests
     */
    getUnopenedCount(): number {
        return this.chests.filter(c => !c.isOpen).length;
    }

    /**
     * Get all dropped items
     */
    getDroppedItems(): DroppedItem[] {
        return this.droppedItems;
    }

    /**
     * Check if there are any nearby items to pick up
     */
    hasNearbyItem(): boolean {
        if (!this.playerTarget) return false;
        const playerPos = this.playerTarget.position;

        for (const item of this.droppedItems) {
            if (Vector3.Distance(playerPos, item.position) < this.itemPickupRange) {
                return true;
            }
        }
        return false;
    }

    dispose(): void {
        this.potionTemplates.forEach(node => node.dispose());
        this.potionTemplates.clear();
        this.arrowTemplate?.dispose();
        this.droppedItems.forEach(item => item.mesh.dispose());
        this.droppedItems = [];
        this.chests = [];
    }
}
