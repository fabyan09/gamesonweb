/**
 * GamepadManager - Singleton class for handling gamepad input
 * Supports Xbox/PlayStation controllers with standard mapping
 */

export type InputType = 'keyboard' | 'gamepad';

// Standard Gamepad button mapping
export enum GamepadButton {
    A = 0,           // Xbox A / PS X - Jump
    B = 1,           // Xbox B / PS O - Block
    X = 2,           // Xbox X / PS Square - Attack
    Y = 3,           // Xbox Y / PS Triangle - Interact
    LB = 4,          // Left Bumper - Run
    RB = 5,          // Right Bumper
    LT = 6,          // Left Trigger - Aim (Archer)
    RT = 7,          // Right Trigger
    Back = 8,        // Back/Select
    Start = 9,       // Start/Options - Pause
    LS = 10,         // Left Stick Press
    RS = 11,         // Right Stick Press
    DpadUp = 12,     // D-pad Up - Potion 1
    DpadDown = 13,   // D-pad Down - Potion 2
    DpadLeft = 14,   // D-pad Left - Potion 3
    DpadRight = 15   // D-pad Right - Potion 4
}

// Standard Gamepad axis mapping
export enum GamepadAxis {
    LeftStickX = 0,
    LeftStickY = 1,
    RightStickX = 2,
    RightStickY = 3
}

// Button callback types
type ButtonCallback = (button: GamepadButton) => void;
type InputTypeCallback = (inputType: InputType) => void;

export class GamepadManager {
    private static instance: GamepadManager | null = null;

    private gamepads: Map<number, Gamepad> = new Map();
    private previousButtonStates: Map<number, boolean[]> = new Map();
    private deadZone: number = 0.15;
    private enabled: boolean = true;
    private activeInputType: InputType = 'keyboard';

    // Callbacks
    private onButtonPressCallbacks: ButtonCallback[] = [];
    private onButtonReleaseCallbacks: ButtonCallback[] = [];
    private onInputTypeChangeCallbacks: InputTypeCallback[] = [];

    // Last keyboard activity time
    private lastKeyboardActivity: number = 0;
    private lastGamepadActivity: number = 0;

    private constructor() {
        this.setupEventListeners();
        this.startPolling();
    }

    static getInstance(): GamepadManager {
        if (!GamepadManager.instance) {
            GamepadManager.instance = new GamepadManager();
        }
        return GamepadManager.instance;
    }

    private setupEventListeners(): void {
        // Gamepad connected
        window.addEventListener('gamepadconnected', (e) => {
            console.log(`[GamepadManager] Gamepad connected: ${e.gamepad.id} (index: ${e.gamepad.index})`);
            this.gamepads.set(e.gamepad.index, e.gamepad);
            this.previousButtonStates.set(e.gamepad.index, new Array(16).fill(false));
            this.updateConnectionUI(true);
        });

        // Gamepad disconnected
        window.addEventListener('gamepaddisconnected', (e) => {
            console.log(`[GamepadManager] Gamepad disconnected: ${e.gamepad.id}`);
            this.gamepads.delete(e.gamepad.index);
            this.previousButtonStates.delete(e.gamepad.index);
            if (this.gamepads.size === 0) {
                this.updateConnectionUI(false);
            }
        });

        // Track keyboard activity for input type switching
        window.addEventListener('keydown', () => {
            this.lastKeyboardActivity = performance.now();
            this.setActiveInputType('keyboard');
        });

        window.addEventListener('mousemove', () => {
            this.lastKeyboardActivity = performance.now();
            this.setActiveInputType('keyboard');
        });
    }

    private startPolling(): void {
        // Poll gamepads at 60fps
        const poll = () => {
            this.update();
            requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);
    }

    private update(): void {
        if (!this.enabled) return;

        // Get fresh gamepad state (required for Chrome)
        const gamepads = navigator.getGamepads();

        for (const gamepad of gamepads) {
            if (!gamepad) continue;

            this.gamepads.set(gamepad.index, gamepad);

            // Check for button state changes
            const prevStates = this.previousButtonStates.get(gamepad.index) || new Array(16).fill(false);

            for (let i = 0; i < gamepad.buttons.length && i < 16; i++) {
                const pressed = gamepad.buttons[i].pressed;
                const wasPressed = prevStates[i];

                if (pressed && !wasPressed) {
                    // Button just pressed
                    this.lastGamepadActivity = performance.now();
                    this.setActiveInputType('gamepad');
                    this.onButtonPressCallbacks.forEach(cb => cb(i as GamepadButton));
                } else if (!pressed && wasPressed) {
                    // Button just released
                    this.onButtonReleaseCallbacks.forEach(cb => cb(i as GamepadButton));
                }

                prevStates[i] = pressed;
            }

            this.previousButtonStates.set(gamepad.index, prevStates);

            // Check for stick movement to update input type
            if (Math.abs(this.getAxis(GamepadAxis.LeftStickX)) > this.deadZone ||
                Math.abs(this.getAxis(GamepadAxis.LeftStickY)) > this.deadZone ||
                Math.abs(this.getAxis(GamepadAxis.RightStickX)) > this.deadZone ||
                Math.abs(this.getAxis(GamepadAxis.RightStickY)) > this.deadZone) {
                this.lastGamepadActivity = performance.now();
                this.setActiveInputType('gamepad');
            }
        }
    }

    private setActiveInputType(type: InputType): void {
        if (this.activeInputType !== type) {
            this.activeInputType = type;
            this.onInputTypeChangeCallbacks.forEach(cb => cb(type));
        }
    }

    private updateConnectionUI(connected: boolean): void {
        const indicator = document.getElementById('gamepad-indicator');
        if (indicator) {
            if (connected) {
                indicator.classList.add('connected');
                indicator.setAttribute('title', 'Manette connectée');
            } else {
                indicator.classList.remove('connected');
                indicator.setAttribute('title', 'Aucune manette');
            }
        }
    }

    // Public API

    /**
     * Check if a button is currently pressed
     */
    isButtonPressed(button: GamepadButton): boolean {
        if (!this.enabled) return false;

        for (const gamepad of this.gamepads.values()) {
            if (gamepad.buttons[button]?.pressed) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the value of an axis (with dead zone applied)
     */
    getAxis(axis: GamepadAxis): number {
        if (!this.enabled) return 0;

        for (const gamepad of this.gamepads.values()) {
            const value = gamepad.axes[axis] || 0;
            if (Math.abs(value) > this.deadZone) {
                // Normalize value to account for dead zone
                const sign = value > 0 ? 1 : -1;
                const normalized = (Math.abs(value) - this.deadZone) / (1 - this.deadZone);
                return sign * normalized;
            }
        }
        return 0;
    }

    /**
     * Get left stick values as an object
     */
    getLeftStick(): { x: number; y: number } {
        return {
            x: this.getAxis(GamepadAxis.LeftStickX),
            y: this.getAxis(GamepadAxis.LeftStickY)
        };
    }

    /**
     * Get right stick values as an object
     */
    getRightStick(): { x: number; y: number } {
        return {
            x: this.getAxis(GamepadAxis.RightStickX),
            y: this.getAxis(GamepadAxis.RightStickY)
        };
    }

    /**
     * Check if any gamepad is connected
     */
    isConnected(): boolean {
        return this.gamepads.size > 0;
    }

    /**
     * Get the current active input type
     */
    getActiveInputType(): InputType {
        return this.activeInputType;
    }

    /**
     * Set dead zone value (0.05 - 0.3)
     */
    setDeadZone(value: number): void {
        this.deadZone = Math.max(0.05, Math.min(0.3, value));
    }

    /**
     * Get current dead zone value
     */
    getDeadZone(): number {
        return this.deadZone;
    }

    /**
     * Enable or disable gamepad input
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Check if gamepad input is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Trigger vibration/rumble effect
     */
    vibrate(duration: number = 200, weakMagnitude: number = 0.5, strongMagnitude: number = 0.5): void {
        for (const gamepad of this.gamepads.values()) {
            if (gamepad.vibrationActuator) {
                gamepad.vibrationActuator.playEffect('dual-rumble', {
                    startDelay: 0,
                    duration: duration,
                    weakMagnitude: weakMagnitude,
                    strongMagnitude: strongMagnitude
                }).catch(() => {
                    // Vibration not supported or failed
                });
            }
        }
    }

    // Callback registration

    /**
     * Register callback for button press
     */
    onButtonPress(callback: ButtonCallback): void {
        this.onButtonPressCallbacks.push(callback);
    }

    /**
     * Register callback for button release
     */
    onButtonRelease(callback: ButtonCallback): void {
        this.onButtonReleaseCallbacks.push(callback);
    }

    /**
     * Register callback for input type change
     */
    onInputTypeChange(callback: InputTypeCallback): void {
        this.onInputTypeChangeCallbacks.push(callback);
    }

    /**
     * Remove all callbacks (useful for cleanup)
     */
    clearCallbacks(): void {
        this.onButtonPressCallbacks = [];
        this.onButtonReleaseCallbacks = [];
        this.onInputTypeChangeCallbacks = [];
    }

    /**
     * Get display name for a button (for UI)
     */
    static getButtonDisplayName(button: GamepadButton, type: 'xbox' | 'playstation' = 'xbox'): string {
        if (type === 'playstation') {
            const psNames: Record<GamepadButton, string> = {
                [GamepadButton.A]: 'X',
                [GamepadButton.B]: 'O',
                [GamepadButton.X]: '□',
                [GamepadButton.Y]: '△',
                [GamepadButton.LB]: 'L1',
                [GamepadButton.RB]: 'R1',
                [GamepadButton.LT]: 'L2',
                [GamepadButton.RT]: 'R2',
                [GamepadButton.Back]: 'Share',
                [GamepadButton.Start]: 'Options',
                [GamepadButton.LS]: 'L3',
                [GamepadButton.RS]: 'R3',
                [GamepadButton.DpadUp]: '↑',
                [GamepadButton.DpadDown]: '↓',
                [GamepadButton.DpadLeft]: '←',
                [GamepadButton.DpadRight]: '→'
            };
            return psNames[button] || '?';
        } else {
            const xboxNames: Record<GamepadButton, string> = {
                [GamepadButton.A]: 'A',
                [GamepadButton.B]: 'B',
                [GamepadButton.X]: 'X',
                [GamepadButton.Y]: 'Y',
                [GamepadButton.LB]: 'LB',
                [GamepadButton.RB]: 'RB',
                [GamepadButton.LT]: 'LT',
                [GamepadButton.RT]: 'RT',
                [GamepadButton.Back]: 'Back',
                [GamepadButton.Start]: 'Start',
                [GamepadButton.LS]: 'LS',
                [GamepadButton.RS]: 'RS',
                [GamepadButton.DpadUp]: '↑',
                [GamepadButton.DpadDown]: '↓',
                [GamepadButton.DpadLeft]: '←',
                [GamepadButton.DpadRight]: '→'
            };
            return xboxNames[button] || '?';
        }
    }
}
