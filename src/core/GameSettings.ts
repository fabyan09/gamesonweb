/**
 * Game Settings Manager
 * Handles saving/loading settings to localStorage
 */

const STORAGE_KEY = 'dungeon_settings';

export interface KeyBindings {
    forward: string[];
    backward: string[];
    left: string[];
    right: string[];
    run: string[];
    jump: string[];
    pause: string[];
}

interface SettingsData {
    musicVolume: number;
    sfxVolume: number;
    mouseSensitivity: number;
    showFps: boolean;
    showControls: boolean;
    keyBindings: KeyBindings;
}

export const DEFAULT_KEYBINDINGS: KeyBindings = {
    forward: ['KeyW', 'KeyZ', 'ArrowUp'],
    backward: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'KeyQ', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    run: ['ShiftLeft', 'ShiftRight'],
    jump: ['Space'],
    pause: ['KeyP']
};

const DEFAULT_SETTINGS: SettingsData = {
    musicVolume: 70,
    sfxVolume: 80,
    mouseSensitivity: 5,
    showFps: false,
    showControls: true,
    keyBindings: { ...DEFAULT_KEYBINDINGS }
};

export class GameSettings {
    private static instance: GameSettings | null = null;

    private _musicVolume: number;
    private _sfxVolume: number;
    private _mouseSensitivity: number;
    private _showFps: boolean;
    private _showControls: boolean;
    private _keyBindings: KeyBindings;

    private constructor() {
        const saved = this.load();
        this._musicVolume = saved.musicVolume;
        this._sfxVolume = saved.sfxVolume;
        this._mouseSensitivity = saved.mouseSensitivity;
        this._showFps = saved.showFps;
        this._showControls = saved.showControls;
        this._keyBindings = saved.keyBindings;
    }

    static getInstance(): GameSettings {
        if (!GameSettings.instance) {
            GameSettings.instance = new GameSettings();
        }
        return GameSettings.instance;
    }

    private load(): SettingsData {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return {
                    ...DEFAULT_SETTINGS,
                    ...parsed,
                    keyBindings: { ...DEFAULT_KEYBINDINGS, ...parsed.keyBindings }
                };
            }
        } catch (e) {
            console.warn('[GameSettings] Failed to load settings:', e);
        }
        return { ...DEFAULT_SETTINGS, keyBindings: { ...DEFAULT_KEYBINDINGS } };
    }

    save(): void {
        try {
            const data: SettingsData = {
                musicVolume: this._musicVolume,
                sfxVolume: this._sfxVolume,
                mouseSensitivity: this._mouseSensitivity,
                showFps: this._showFps,
                showControls: this._showControls,
                keyBindings: this._keyBindings
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            console.log('[GameSettings] Settings saved');

            // Apply settings immediately
            this.apply();
        } catch (e) {
            console.warn('[GameSettings] Failed to save settings:', e);
        }
    }

    apply(): void {
        // Apply showControls setting
        const instructions = document.getElementById('instructions');
        if (instructions) {
            instructions.style.display = this._showControls ? 'block' : 'none';
        }
    }

    // Check if a key code matches a binding
    isKeyBound(action: keyof KeyBindings, code: string): boolean {
        return this._keyBindings[action].includes(code);
    }

    // Get display name for a key code
    static getKeyDisplayName(code: string): string {
        const keyNames: Record<string, string> = {
            'KeyW': 'W', 'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D',
            'KeyZ': 'Z', 'KeyQ': 'Q', 'KeyP': 'P', 'KeyE': 'E',
            'KeyR': 'R', 'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H',
            'KeyI': 'I', 'KeyJ': 'J', 'KeyK': 'K', 'KeyL': 'L',
            'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O', 'KeyT': 'T',
            'KeyU': 'U', 'KeyV': 'V', 'KeyX': 'X', 'KeyY': 'Y',
            'KeyB': 'B', 'KeyC': 'C',
            'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
            'Space': 'Espace', 'ShiftLeft': 'Shift', 'ShiftRight': 'Shift',
            'ControlLeft': 'Ctrl', 'ControlRight': 'Ctrl',
            'AltLeft': 'Alt', 'AltRight': 'Alt',
            'Tab': 'Tab', 'Enter': 'Entrée', 'Escape': 'Échap',
            'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
            'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8',
            'Digit9': '9', 'Digit0': '0'
        };
        return keyNames[code] || code;
    }

    // Get first binding display name for an action
    getBindingDisplay(action: keyof KeyBindings): string {
        const bindings = this._keyBindings[action];
        if (bindings.length === 0) return 'Non assigné';
        return GameSettings.getKeyDisplayName(bindings[0]);
    }

    // Set a new binding for an action (replaces all existing)
    setBinding(action: keyof KeyBindings, codes: string[]): void {
        this._keyBindings[action] = codes;
    }

    // Add a binding to an action
    addBinding(action: keyof KeyBindings, code: string): void {
        if (!this._keyBindings[action].includes(code)) {
            this._keyBindings[action].push(code);
        }
    }

    // Reset keybindings to default
    resetKeyBindings(): void {
        this._keyBindings = { ...DEFAULT_KEYBINDINGS };
    }

    // Getters and setters
    get musicVolume(): number {
        return this._musicVolume;
    }

    set musicVolume(value: number) {
        this._musicVolume = Math.max(0, Math.min(100, value));
    }

    get sfxVolume(): number {
        return this._sfxVolume;
    }

    set sfxVolume(value: number) {
        this._sfxVolume = Math.max(0, Math.min(100, value));
    }

    get mouseSensitivity(): number {
        return this._mouseSensitivity;
    }

    set mouseSensitivity(value: number) {
        this._mouseSensitivity = Math.max(1, Math.min(10, value));
    }

    get showFps(): boolean {
        return this._showFps;
    }

    set showFps(value: boolean) {
        this._showFps = value;
    }

    get showControls(): boolean {
        return this._showControls;
    }

    set showControls(value: boolean) {
        this._showControls = value;
    }

    get keyBindings(): KeyBindings {
        return this._keyBindings;
    }

    /**
     * Get camera sensitivity multiplier based on settings
     * Returns a value between 200 (high sens) and 1000 (low sens)
     */
    get cameraSensitivity(): number {
        // Invert so higher setting = more sensitive (lower number in BabylonJS)
        return 1100 - (this._mouseSensitivity * 100);
    }
}
