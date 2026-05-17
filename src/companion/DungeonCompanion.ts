/**
 * DungeonCompanion.ts
 * Main facade that ties together CompanionEntity, CompanionUI, and CompanionAI.
 * This is the single class that DungeonScene interacts with.
 */

import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CompanionEntity } from './CompanionEntity';
import { CompanionUI } from './CompanionUI';
import { CompanionAI, GameContext } from './CompanionAI';
import { TriggerType } from './CompanionDialogues';

export class DungeonCompanion {
    private entity: CompanionEntity;
    private ui: CompanionUI;
    private ai: CompanionAI;
    private scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
        this.entity = new CompanionEntity(scene);
        this.ui = new CompanionUI();
        this.ai = new CompanionAI();

        // Connect AI message output to UI display + entity flash
        this.ai.onMessage((text: string, duration: number) => {
            this.ui.showMessage(text, duration);
            this.entity.flashOnSpeak();
        });
    }

    /**
     * Set the player to follow. Must be called after player is loaded.
     */
    setPlayerTarget(target: TransformNode): void {
        this.entity.setPlayerTarget(target);
    }

    /**
     * Update game context (call from DungeonScene render loop or events)
     */
    updateContext(context: Partial<GameContext>): void {
        this.ai.updateContext(context);
    }

    /**
     * Trigger a companion reaction to a game event
     */
    trigger(type: TriggerType): void {
        this.ai.trigger(type);
    }

    /**
     * Record an enemy kill (for multi-kill tracking)
     */
    recordKill(): void {
        this.ai.recordKill();
    }

    /**
     * Check health-based triggers after HP changes
     */
    checkHealthTriggers(currentHealth: number): void {
        this.ai.checkHealthTriggers(currentHealth);
    }

    /**
     * Check inventory-based triggers
     */
    checkInventoryTriggers(potionCount: number, arrowCount: number): void {
        this.ai.checkInventoryTriggers(potionCount, arrowCount);
    }

    /**
     * Notify the AI of player action (for idle detection)
     */
    notifyPlayerAction(): void {
        this.ai.notifyPlayerAction();
    }

    /**
     * Show/hide the companion
     */
    setVisible(visible: boolean): void {
        this.entity.setVisible(visible);
        if (!visible) {
            this.ui.hide();
        }
    }

    /**
     * Make the companion display a specific message immediately (bypassing AI queue ideally, or straight to UI)
     */
    showMessageDirectly(text: string, duration: number = 3000): void {
        this.ui.showMessage(text, duration);
        this.entity.flashOnSpeak();
    }

    dispose(): void {
        this.ai.dispose();
        this.ui.dispose();
        this.entity.dispose();
    }
}
