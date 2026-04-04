/**
 * CompanionAI.ts
 * Brain logic for the Spirit of the Dungeon companion.
 * Manages context, dialogue selection, cooldowns, priorities, and message queuing.
 */

import { TriggerType, getRandomDialogueText } from './CompanionDialogues';

export interface GameContext {
    playerHealth: number;
    maxHealth: number;
    enemiesAlive: number;
    enemiesTotal: number;
    potionCount: number;
    arrowCount: number;
    isArcher: boolean;
    isWizard: boolean;
    characterClass: string;
    levelIndex: number;
    isPaused: boolean;
    isPlayerDead: boolean;
    isLevelComplete: boolean;
}

interface QueuedMessage {
    text: string;
    trigger: TriggerType;
    priority: number;
    timestamp: number;
}

export class CompanionAI {
    private context: GameContext = {
        playerHealth: 100,
        maxHealth: 100,
        enemiesAlive: 0,
        enemiesTotal: 0,
        potionCount: 0,
        arrowCount: 0,
        isArcher: false,
        isWizard: false,
        characterClass: 'knight',
        levelIndex: 0,
        isPaused: false,
        isPlayerDead: false,
        isLevelComplete: false,
    };

    // Cooldowns per trigger type (ms)
    private cooldowns: Map<TriggerType, number> = new Map();
    private lastTriggerTime: Map<TriggerType, number> = new Map();

    // Recent dialogues to avoid repetition (per trigger type)
    private recentDialogues: Map<TriggerType, string[]> = new Map();
    private readonly maxRecentPerTrigger = 5;

    // Message queue with priority
    private messageQueue: QueuedMessage[] = [];
    private isDisplayingMessage: boolean = false;

    // Callback to display message
    private onMessageCallback: ((text: string, duration: number) => void) | null = null;

    // Kill tracking for multi-kill detection
    private recentKillTimestamps: number[] = [];
    private readonly multiKillWindow = 5000; // 5 seconds

    // Idle tracking
    private lastPlayerActionTime: number = Date.now();
    private idleCheckInterval: ReturnType<typeof setInterval> | null = null;
    private hasTriggeredIdleThisCycle: boolean = false;

    // HP tracking for state changes
    private previousHealth: number = 100;
    private hasWarnedLowHp: boolean = false;
    private hasWarnedCriticalHp: boolean = false;

    constructor() {
        this.setupCooldowns();
        this.startIdleCheck();
    }

    private setupCooldowns(): void {
        // Cooldowns in ms - how long before the same trigger can fire again
        this.cooldowns.set('level_start', 999999); // Once per level
        this.cooldowns.set('room_enter', 15000);
        this.cooldowns.set('enemy_spotted', 12000);
        this.cooldowns.set('combat_start', 15000);
        this.cooldowns.set('enemy_killed', 6000);
        this.cooldowns.set('boss_spotted', 999999);
        this.cooldowns.set('boss_killed', 999999);
        this.cooldowns.set('player_hit', 8000);
        this.cooldowns.set('player_low_hp', 20000);
        this.cooldowns.set('player_critical_hp', 15000);
        this.cooldowns.set('player_block', 10000);
        this.cooldowns.set('player_death', 999999);
        this.cooldowns.set('chest_open', 5000);
        this.cooldowns.set('item_pickup_potion', 5000);
        this.cooldowns.set('item_pickup_arrows', 5000);
        this.cooldowns.set('potion_used', 5000);
        this.cooldowns.set('door_open', 8000);
        this.cooldowns.set('exit_unsealed', 999999);
        this.cooldowns.set('victory', 999999);
        this.cooldowns.set('idle', 30000);
        this.cooldowns.set('trap_damage', 8000);
        this.cooldowns.set('enemy_enraged', 10000);
        this.cooldowns.set('player_crouch', 20000);
        this.cooldowns.set('arrow_shot', 15000);
        this.cooldowns.set('spell_cast', 15000);
        this.cooldowns.set('all_enemies_near', 15000);
        this.cooldowns.set('player_full_hp', 30000);
        this.cooldowns.set('no_potions', 30000);
        this.cooldowns.set('no_arrows', 20000);
        this.cooldowns.set('multiple_kills', 8000);
    }

    private startIdleCheck(): void {
        this.idleCheckInterval = setInterval(() => {
            if (this.context.isPaused || this.context.isPlayerDead || this.context.isLevelComplete) return;

            const now = Date.now();
            const idleTime = now - this.lastPlayerActionTime;

            if (idleTime > 20000 && !this.hasTriggeredIdleThisCycle) {
                this.hasTriggeredIdleThisCycle = true;
                this.trigger('idle');
            }
        }, 5000);
    }

    /**
     * Register the callback to display messages in the UI
     */
    onMessage(callback: (text: string, duration: number) => void): void {
        this.onMessageCallback = callback;
    }

    /**
     * Update game context (called frequently from DungeonScene)
     */
    updateContext(partial: Partial<GameContext>): void {
        Object.assign(this.context, partial);
    }

    /**
     * Notify the AI that the player performed an action (resets idle timer)
     */
    notifyPlayerAction(): void {
        this.lastPlayerActionTime = Date.now();
        this.hasTriggeredIdleThisCycle = false;
    }

    /**
     * Main trigger method - called when a game event occurs
     */
    trigger(type: TriggerType): void {
        if (this.context.isPaused && type !== 'player_death' && type !== 'victory') return;

        // Check cooldown
        const now = Date.now();
        const lastTime = this.lastTriggerTime.get(type) ?? 0;
        const cooldown = this.cooldowns.get(type) ?? 5000;

        if (now - lastTime < cooldown) return;

        // Mark action for idle tracking
        if (type !== 'idle') {
            this.notifyPlayerAction();
        }

        // Get dialogue text avoiding recent ones
        const recentTexts = this.recentDialogues.get(type) ?? [];
        const text = getRandomDialogueText(type, recentTexts);

        // Track recent dialogues
        if (!this.recentDialogues.has(type)) {
            this.recentDialogues.set(type, []);
        }
        const recent = this.recentDialogues.get(type)!;
        recent.push(text);
        if (recent.length > this.maxRecentPerTrigger) {
            recent.shift();
        }

        // Update last trigger time
        this.lastTriggerTime.set(type, now);

        // Determine priority (lower = higher priority)
        const priority = this.getPriority(type);

        // Calculate display duration based on text length
        const duration = this.calculateDuration(text);

        // Queue the message
        this.queueMessage({ text, trigger: type, priority, timestamp: now }, duration);
    }

    private getPriority(type: TriggerType): number {
        const priorities: Partial<Record<TriggerType, number>> = {
            player_death: 1,
            player_critical_hp: 2,
            victory: 2,
            boss_spotted: 3,
            boss_killed: 3,
            exit_unsealed: 3,
            player_low_hp: 4,
            all_enemies_near: 4,
            trap_damage: 5,
            enemy_enraged: 5,
            player_hit: 6,
            player_block: 6,
            enemy_killed: 7,
            multiple_kills: 7,
            combat_start: 8,
            chest_open: 8,
            potion_used: 8,
            no_potions: 8,
            no_arrows: 8,
            enemy_spotted: 9,
            door_open: 9,
            item_pickup_potion: 9,
            item_pickup_arrows: 9,
            arrow_shot: 10,
            spell_cast: 10,
            room_enter: 10,
            level_start: 5,
            player_crouch: 11,
            player_full_hp: 11,
            idle: 12,
        };
        return priorities[type] ?? 10;
    }

    private calculateDuration(text: string): number {
        // Base duration + extra time for longer texts
        const wordCount = text.split(' ').length;
        return Math.max(3000, Math.min(7000, 2000 + wordCount * 300));
    }

    private queueMessage(msg: QueuedMessage, duration: number): void {
        // If a higher priority message is in the queue, this one might get replaced
        if (this.isDisplayingMessage) {
            // Only interrupt for much higher priority (lower number)
            if (msg.priority <= 3) {
                // High priority - display immediately
                this.displayMessage(msg.text, duration);
            } else {
                // Add to queue, it will be processed when current message finishes
                this.messageQueue.push(msg);
                // Sort by priority (ascending = highest first)
                this.messageQueue.sort((a, b) => a.priority - b.priority);
                // Keep queue manageable
                if (this.messageQueue.length > 3) {
                    this.messageQueue.pop();
                }
            }
        } else {
            this.displayMessage(msg.text, duration);
        }
    }

    private displayMessage(text: string, duration: number): void {
        this.isDisplayingMessage = true;
        this.onMessageCallback?.(text, duration);

        setTimeout(() => {
            this.isDisplayingMessage = false;
            this.processQueue();
        }, duration + 500); // Small gap between messages
    }

    private processQueue(): void {
        if (this.messageQueue.length === 0) return;

        const next = this.messageQueue.shift()!;
        const duration = this.calculateDuration(next.text);

        // Don't show messages that are too old (> 10s)
        if (Date.now() - next.timestamp > 10000) {
            this.processQueue();
            return;
        }

        this.displayMessage(next.text, duration);
    }

    /**
     * Track enemy kills for multi-kill detection
     */
    recordKill(): void {
        const now = Date.now();
        this.recentKillTimestamps.push(now);

        // Clean old timestamps
        this.recentKillTimestamps = this.recentKillTimestamps.filter(
            t => now - t < this.multiKillWindow
        );

        // Check for multi-kill (3+ kills in window)
        if (this.recentKillTimestamps.length >= 3) {
            this.trigger('multiple_kills');
            this.recentKillTimestamps = []; // Reset after triggering
        }
    }

    /**
     * Check health-based triggers (called after health changes)
     */
    checkHealthTriggers(currentHealth: number): void {
        // Player healed to full
        if (currentHealth >= 100 && this.previousHealth < 100) {
            this.trigger('player_full_hp');
            this.hasWarnedLowHp = false;
            this.hasWarnedCriticalHp = false;
        }

        // Critical HP (<=15)
        if (currentHealth <= 15 && currentHealth > 0 && !this.hasWarnedCriticalHp) {
            this.hasWarnedCriticalHp = true;
            this.trigger('player_critical_hp');
        }
        // Low HP (<=30)
        else if (currentHealth <= 30 && currentHealth > 15 && !this.hasWarnedLowHp) {
            this.hasWarnedLowHp = true;
            this.trigger('player_low_hp');
        }

        // Reset warnings if healed above thresholds
        if (currentHealth > 30) {
            this.hasWarnedLowHp = false;
            this.hasWarnedCriticalHp = false;
        }

        this.previousHealth = currentHealth;
    }

    /**
     * Check inventory-based triggers
     */
    checkInventoryTriggers(potionCount: number, arrowCount: number): void {
        if (potionCount === 0 && this.context.potionCount > 0) {
            this.trigger('no_potions');
        }
        if (this.context.isArcher && arrowCount === 0 && this.context.arrowCount > 0) {
            this.trigger('no_arrows');
        }

        this.updateContext({ potionCount, arrowCount });
    }

    /**
     * Clean up
     */
    dispose(): void {
        if (this.idleCheckInterval) {
            clearInterval(this.idleCheckInterval);
        }
        this.messageQueue = [];
        this.onMessageCallback = null;
    }
}
