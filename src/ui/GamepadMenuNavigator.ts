/**
 * GamepadMenuNavigator.ts
 *
 * Generic gamepad-driven HTML menu navigator. Auto-detects the topmost visible
 * panel (welcome, main menu, character select, settings, controls, rules,
 * profile, leaderboard, victory + upgrade, death) and lets the player navigate
 * its focusable elements (buttons, character cards, toggles, sliders, tabs)
 * with the DPad / left stick, activate with A, and go back with B.
 *
 * The in-game pause menu (`#pause-menu`) is intentionally skipped here — it's
 * handled separately by DungeonScene.handlePauseMenuGamepad to preserve its
 * existing behavior.
 */

import { GamepadManager, GamepadButton, GamepadAxis } from '../core/GamepadManager';

// Topmost-first priority for surface detection
const SURFACE_PRIORITY: string[] = [
    '#auth-panel',
    '#profile-panel',
    '#leaderboard-panel',
    '#victory-overlay',
    '#death-overlay',
    '#controls-panel',
    '#settings-panel',
    '#rules-panel',
    '#character-select-panel',
    '#main-menu',
    '#welcome-screen',
];

const FOCUSABLE_SELECTOR = [
    'button:not([disabled]):not([aria-hidden="true"])',
    '.character-card',
    '.toggle-switch',
    'input[type="range"]',
    '.leaderboard-tab',
    '.key-bind-btn',
].join(', ');

const FOCUS_CLASS = 'gp-focus';

export class GamepadMenuNavigator {
    private static instance: GamepadMenuNavigator | null = null;

    private currentSurface: HTMLElement | null = null;
    private focusables: HTMLElement[] = [];
    private focusedIndex: number = 0;
    private currentFocused: HTMLElement | null = null;

    // Stick-driven repeat-navigation throttling
    private lastNavTime: number = 0;
    private navCooldown: number = 220; // ms
    private stickEngaged: boolean = false;

    // Periodic surface refresh (covers DOM changes from external code)
    private lastSurfaceCheck: number = 0;
    private surfaceCheckInterval: number = 250; // ms

    private constructor() {
        this.injectStyles();

        const gpm = GamepadManager.getInstance();
        gpm.onButtonPress((button) => this.onButton(button));
        gpm.onInputTypeChange((type) => {
            if (type === 'keyboard') {
                this.clearVisibleFocus();
            } else {
                this.refresh();
            }
        });

        const tick = () => {
            this.tick();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    static initialize(): void {
        if (!GamepadMenuNavigator.instance) {
            GamepadMenuNavigator.instance = new GamepadMenuNavigator();
        }
    }

    private injectStyles(): void {
        if (document.getElementById('gp-nav-styles')) return;
        const style = document.createElement('style');
        style.id = 'gp-nav-styles';
        style.textContent = `
            .${FOCUS_CLASS} {
                outline: 2px solid #ffd700 !important;
                outline-offset: 4px !important;
                box-shadow:
                    0 0 24px rgba(255, 215, 0, 0.55),
                    inset 0 0 16px rgba(255, 215, 0, 0.15) !important;
                position: relative;
                z-index: 1;
            }
            .character-card.${FOCUS_CLASS} {
                transform: translateY(-6px) scale(1.02);
                transition: transform 0.15s ease, box-shadow 0.15s ease;
            }
            .toggle-switch.${FOCUS_CLASS} {
                outline-offset: 6px !important;
            }
            input[type="range"].${FOCUS_CLASS} {
                outline-offset: 2px !important;
            }
        `;
        document.head.appendChild(style);
    }

    private detectSurface(): HTMLElement | null {
        for (const sel of SURFACE_PRIORITY) {
            const el = document.querySelector<HTMLElement>(sel);
            if (!el) continue;
            if (this.isSurfaceVisible(el)) return el;
        }
        return null;
    }

    private isSurfaceVisible(el: HTMLElement): boolean {
        if (el.classList.contains('hidden')) return false;
        // Welcome / main-menu toggle .hidden only; check computed style
        if (el.id === 'welcome-screen' || el.id === 'main-menu') {
            const cs = window.getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.1;
        }
        // Dynamically created overlays don't use .visible
        if (el.id === 'victory-overlay' || el.id === 'death-overlay') {
            return document.body.contains(el);
        }
        // Other panels gated by .visible
        return el.classList.contains('visible');
    }

    private isElementVisible(el: HTMLElement): boolean {
        if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') return false;
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if ((el as HTMLButtonElement).disabled) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        return true;
    }

    private collectFocusables(surface: HTMLElement): HTMLElement[] {
        return Array.from(surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
            .filter(el => this.isElementVisible(el));
    }

    private refresh(): void {
        const surface = this.detectSurface();
        if (surface !== this.currentSurface) {
            this.clearVisibleFocus();
            this.currentSurface = surface;
            this.focusedIndex = 0;
        }
        if (!surface) {
            this.focusables = [];
            return;
        }
        const previouslyFocused = this.focusables[this.focusedIndex];
        this.focusables = this.collectFocusables(surface);
        // Preserve focus by element reference when possible
        if (previouslyFocused) {
            const newIdx = this.focusables.indexOf(previouslyFocused);
            if (newIdx >= 0) {
                this.focusedIndex = newIdx;
            }
        }
        if (this.focusedIndex >= this.focusables.length) {
            this.focusedIndex = Math.max(0, this.focusables.length - 1);
        }
        this.applyFocusStyles();
    }

    private clearVisibleFocus(): void {
        if (this.currentFocused) {
            this.currentFocused.classList.remove(FOCUS_CLASS);
            this.currentFocused = null;
        }
    }

    private applyFocusStyles(): void {
        const gpm = GamepadManager.getInstance();
        const isGamepad = gpm.getActiveInputType() === 'gamepad' && gpm.isConnected();
        if (!isGamepad) {
            this.clearVisibleFocus();
            return;
        }
        const next = this.focusables[this.focusedIndex] ?? null;
        if (next === this.currentFocused) return;
        if (this.currentFocused) {
            this.currentFocused.classList.remove(FOCUS_CLASS);
        }
        if (next) {
            next.classList.add(FOCUS_CLASS);
            try { next.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch {}
        }
        this.currentFocused = next;
    }

    private navigate(dir: number): void {
        this.refresh();
        if (this.focusables.length === 0) return;
        this.focusedIndex = (this.focusedIndex + dir + this.focusables.length) % this.focusables.length;
        this.applyFocusStyles();
    }

    private activate(): void {
        this.refresh();
        const el = this.focusables[this.focusedIndex];
        if (!el) return;
        // For sliders, A button is meaningless; skip
        if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') return;
        el.click();
    }

    private back(): void {
        this.refresh();
        const surface = this.currentSurface;
        if (!surface) return;
        // Common back/cancel/close button naming conventions
        const back = surface.querySelector<HTMLElement>(
            '[id$="-back"], [id$="-cancel"], [id$="-close"]'
        );
        if (back && this.isElementVisible(back)) {
            back.click();
            return;
        }
        // Fallback: close panels using .visible
        if (surface.classList.contains('visible')) {
            surface.classList.remove('visible');
        }
    }

    private adjustOrNavHorizontal(dir: number): void {
        this.refresh();
        const el = this.focusables[this.focusedIndex];
        if (el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range') {
            this.adjustSlider(el as HTMLInputElement, dir);
            return;
        }
        this.navigate(dir);
    }

    private adjustSlider(input: HTMLInputElement, dir: number): void {
        const step = parseFloat(input.step) || 1;
        const min = parseFloat(input.min) || 0;
        const max = parseFloat(input.max) || 100;
        const cur = parseFloat(input.value) || 0;
        const next = Math.max(min, Math.min(max, cur + dir * step));
        if (next === cur) return;
        input.value = String(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    private switchTab(dir: number): void {
        if (!this.currentSurface) return;
        const tabs = Array.from(this.currentSurface.querySelectorAll<HTMLElement>('.leaderboard-tab'));
        if (tabs.length === 0) return;
        const activeIdx = tabs.findIndex(t => t.classList.contains('active'));
        const start = activeIdx < 0 ? 0 : activeIdx;
        const next = (start + dir + tabs.length) % tabs.length;
        tabs[next].click();
    }

    private onButton(button: GamepadButton): void {
        this.refresh();
        if (!this.currentSurface) return;
        // Pause menu is handled by DungeonScene
        if (this.currentSurface.id === 'pause-menu') return;

        switch (button) {
            case GamepadButton.DpadUp:
                this.navigate(-1);
                break;
            case GamepadButton.DpadDown:
                this.navigate(1);
                break;
            case GamepadButton.DpadLeft:
                this.adjustOrNavHorizontal(-1);
                break;
            case GamepadButton.DpadRight:
                this.adjustOrNavHorizontal(1);
                break;
            case GamepadButton.A:
                this.activate();
                break;
            case GamepadButton.B:
                this.back();
                break;
            case GamepadButton.LB:
                this.switchTab(-1);
                break;
            case GamepadButton.RB:
                this.switchTab(1);
                break;
        }
    }

    private tick(): void {
        const now = performance.now();

        // Periodic surface refresh handles DOM changes from external code
        if (now - this.lastSurfaceCheck > this.surfaceCheckInterval) {
            this.lastSurfaceCheck = now;
            this.refresh();
        }

        // Stick navigation (only on a real surface)
        if (!this.currentSurface || this.currentSurface.id === 'pause-menu') {
            this.stickEngaged = false;
            return;
        }

        const gpm = GamepadManager.getInstance();
        if (!gpm.isEnabled() || !gpm.isConnected()) {
            this.stickEngaged = false;
            return;
        }

        const y = gpm.getAxis(GamepadAxis.LeftStickY);
        const x = gpm.getAxis(GamepadAxis.LeftStickX);
        const threshold = 0.55;

        if (Math.abs(y) < threshold && Math.abs(x) < threshold) {
            this.stickEngaged = false;
            return;
        }
        if (this.stickEngaged && now - this.lastNavTime < this.navCooldown) return;

        this.stickEngaged = true;
        this.lastNavTime = now;

        if (Math.abs(y) > Math.abs(x)) {
            this.navigate(y < 0 ? -1 : 1);
        } else {
            this.adjustOrNavHorizontal(x < 0 ? -1 : 1);
        }
    }
}
