/**
 * Player Inventory System
 * Manages potions and arrows for the player
 */

export type PotionType = 'p1' | 'p2' | 'p3' | 'p4';

export interface InventoryState {
    potions: PotionType[];
    arrows: number;
    maxArrows: number;
}

export interface SavedGameState {
    potions: PotionType[];
    arrows: number;
    health: number;
    characterClass: string;
}

const SAVE_KEY = 'dungeon_game_state';

export class PlayerInventory {
    private potions: PotionType[] = [];
    private arrows: number = 5;
    private readonly maxArrows: number = 5;
    private readonly maxPotions: number = 4;
    private isArcherMode: boolean = false;

    // Callbacks for UI updates
    private onUpdateCallback: ((state: InventoryState) => void) | null = null;

    constructor(isArcher: boolean = false) {
        this.isArcherMode = isArcher;
        // Archer starts with 5 arrows
        this.arrows = isArcher ? 5 : 0;
    }

    /**
     * Set callback for inventory updates
     */
    onUpdate(callback: (state: InventoryState) => void): void {
        this.onUpdateCallback = callback;
        // Trigger initial update
        this.notifyUpdate();
    }

    private notifyUpdate(): void {
        if (this.onUpdateCallback) {
            this.onUpdateCallback(this.getState());
        }
    }

    /**
     * Get current inventory state
     */
    getState(): InventoryState {
        return {
            potions: [...this.potions],
            arrows: this.arrows,
            maxArrows: this.maxArrows
        };
    }

    /**
     * Add a potion to inventory
     * @returns true if potion was added, false if inventory full
     */
    addPotion(type: PotionType): boolean {
        if (this.potions.length >= this.maxPotions) {
            console.log('[PlayerInventory] Cannot add potion - inventory full');
            return false;
        }
        this.potions.push(type);
        console.log(`[PlayerInventory] Added potion ${type}, total: ${this.potions.length}`);
        this.notifyUpdate();
        return true;
    }

    /**
     * Use a potion (removes it from inventory)
     * @returns the potion type used, or null if no potions
     */
    usePotion(): PotionType | null {
        if (this.potions.length === 0) {
            console.log('[PlayerInventory] No potions to use');
            return null;
        }
        const potion = this.potions.shift()!;
        console.log(`[PlayerInventory] Used potion ${potion}, remaining: ${this.potions.length}`);
        this.notifyUpdate();
        return potion;
    }

    /**
     * Get the healing amount for a potion type
     */
    static getPotionHealAmount(type: PotionType): number {
        const healAmounts: Record<PotionType, number> = {
            'p1': 20,  // Small heal
            'p2': 35,  // Medium heal
            'p3': 50,  // Large heal
            'p4': 100  // Full heal
        };
        return healAmounts[type];
    }

    /**
     * Add arrows to inventory
     * @param count Number of arrows to add
     * @returns number of arrows actually added
     */
    addArrows(count: number): number {
        if (!this.isArcherMode) {
            console.log('[PlayerInventory] Cannot add arrows - not in archer mode');
            return 0;
        }
        const spaceAvailable = this.maxArrows - this.arrows;
        const toAdd = Math.min(count, spaceAvailable);
        this.arrows += toAdd;
        console.log(`[PlayerInventory] Added ${toAdd} arrows, total: ${this.arrows}/${this.maxArrows}`);
        this.notifyUpdate();
        return toAdd;
    }

    /**
     * Use an arrow
     * @returns true if arrow was used, false if no arrows
     */
    useArrow(): boolean {
        if (this.arrows <= 0) {
            console.log('[PlayerInventory] No arrows left!');
            return false;
        }
        this.arrows--;
        console.log(`[PlayerInventory] Used arrow, remaining: ${this.arrows}/${this.maxArrows}`);
        this.notifyUpdate();
        return true;
    }

    /**
     * Check if player has arrows
     */
    hasArrows(): boolean {
        return this.arrows > 0;
    }

    /**
     * Get current arrow count
     */
    getArrowCount(): number {
        return this.arrows;
    }

    /**
     * Get current potion count
     */
    getPotionCount(): number {
        return this.potions.length;
    }

    /**
     * Check if archer mode
     */
    isArcher(): boolean {
        return this.isArcherMode;
    }

    /**
     * Restore inventory from saved state
     * Note: Arrows are always reset to max for archer at each new level
     */
    restoreFromSave(saved: SavedGameState): void {
        this.potions = [...saved.potions];
        // Archer always starts with full arrows at each level
        if (this.isArcherMode) {
            this.arrows = this.maxArrows;
        }
        this.notifyUpdate();
        console.log(`[PlayerInventory] Restored from save: ${this.potions.length} potions, ${this.arrows} arrows (archer arrows reset to max)`);
    }

    /**
     * Save the current game state to localStorage
     */
    static saveGameState(inventory: PlayerInventory, health: number, characterClass: string): void {
        const state: SavedGameState = {
            potions: inventory.getState().potions,
            arrows: inventory.getArrowCount(),
            health: health,
            characterClass: characterClass
        };
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(state));
            console.log('[PlayerInventory] Game state saved:', state);
        } catch (e) {
            console.warn('[PlayerInventory] Failed to save game state:', e);
        }
    }

    /**
     * Load game state from localStorage
     */
    static loadGameState(): SavedGameState | null {
        try {
            const saved = localStorage.getItem(SAVE_KEY);
            if (saved) {
                const state = JSON.parse(saved) as SavedGameState;
                console.log('[PlayerInventory] Loaded game state:', state);
                return state;
            }
        } catch (e) {
            console.warn('[PlayerInventory] Failed to load game state:', e);
        }
        return null;
    }

    /**
     * Clear the saved game state
     */
    static clearGameState(): void {
        try {
            localStorage.removeItem(SAVE_KEY);
            console.log('[PlayerInventory] Game state cleared');
        } catch (e) {
            console.warn('[PlayerInventory] Failed to clear game state:', e);
        }
    }

    /**
     * Check if there's a saved game state
     */
    static hasSavedState(): boolean {
        try {
            return localStorage.getItem(SAVE_KEY) !== null;
        } catch (e) {
            return false;
        }
    }
}
