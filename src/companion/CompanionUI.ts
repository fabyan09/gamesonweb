/**
 * CompanionUI.ts
 * Fixed 2D screen overlay for the Spirit of the Dungeon dialogue.
 * Displayed as a subtitle-style panel at the top of the screen.
 * Features typing effect, auto-dismiss, and CSS animations.
 */

export class CompanionUI {
    private container: HTMLDivElement | null = null;
    private nameEl: HTMLSpanElement | null = null;
    private textEl: HTMLSpanElement | null = null;

    // Typing effect
    private fullText: string = '';
    private displayedChars: number = 0;
    private typingInterval: ReturnType<typeof setInterval> | null = null;
    private readonly typingSpeed = 25; // ms per character

    // Timers
    private dismissTimeout: ReturnType<typeof setTimeout> | null = null;
    private fadeTimeout: ReturnType<typeof setTimeout> | null = null;
    private isShowing: boolean = false;

    constructor() {
        this.createUI();
    }

    private createUI(): void {
        // Inject styles once
        if (!document.getElementById('companion-ui-style')) {
            const style = document.createElement('style');
            style.id = 'companion-ui-style';
            style.textContent = `
                #companion-dialogue {
                    position: fixed;
                    top: 24px;
                    left: 50%;
                    transform: translateX(-50%);
                    max-width: 600px;
                    min-width: 280px;
                    padding: 12px 22px;
                    background: linear-gradient(180deg, rgba(5, 10, 30, 0.92) 0%, rgba(8, 14, 40, 0.88) 100%);
                    border: 1px solid rgba(80, 140, 255, 0.4);
                    border-radius: 6px;
                    box-shadow: 0 0 20px rgba(60, 120, 255, 0.15), inset 0 1px 0 rgba(100, 160, 255, 0.1);
                    font-family: 'Montaga', 'Georgia', serif;
                    z-index: 150;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.4s ease;
                }
                #companion-dialogue.visible {
                    opacity: 1;
                }
                #companion-dialogue.fade-out {
                    opacity: 0;
                }
                #companion-dialogue .companion-name {
                    display: block;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.15em;
                    color: rgba(100, 170, 255, 0.7);
                    margin-bottom: 6px;
                }
                #companion-dialogue .companion-text {
                    display: block;
                    font-size: 16px;
                    line-height: 1.5;
                    color: rgba(200, 220, 255, 0.95);
                    text-shadow: 0 0 8px rgba(80, 140, 255, 0.2);
                }
                #companion-dialogue .companion-text .cursor {
                    display: inline-block;
                    width: 2px;
                    height: 14px;
                    background: rgba(100, 170, 255, 0.8);
                    margin-left: 2px;
                    vertical-align: middle;
                    animation: companionBlink 0.6s step-end infinite;
                }
                @keyframes companionBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        // Create container
        this.container = document.createElement('div');
        this.container.id = 'companion-dialogue';

        this.nameEl = document.createElement('span');
        this.nameEl.className = 'companion-name';
        this.nameEl.textContent = "L'Esprit du Donjon";

        this.textEl = document.createElement('span');
        this.textEl.className = 'companion-text';

        this.container.appendChild(this.nameEl);
        this.container.appendChild(this.textEl);
        document.body.appendChild(this.container);
    }

    /**
     * Show a message with typing effect
     */
    showMessage(text: string, duration: number): void {
        if (!this.container || !this.textEl) return;

        // Clear any existing message
        this.clearTimers();

        this.fullText = text;
        this.displayedChars = 0;
        this.isShowing = true;

        // Show container
        this.container.classList.remove('fade-out');
        this.container.classList.add('visible');

        // Start typing effect
        this.textEl.innerHTML = '<span class="cursor"></span>';
        this.typingInterval = setInterval(() => {
            if (this.displayedChars < this.fullText.length) {
                this.displayedChars++;
                if (this.textEl) {
                    const typed = this.fullText.substring(0, this.displayedChars);
                    // Keep cursor at end while typing
                    this.textEl.innerHTML = typed + '<span class="cursor"></span>';
                }
            } else {
                // Typing complete - remove cursor
                if (this.typingInterval) {
                    clearInterval(this.typingInterval);
                    this.typingInterval = null;
                }
                if (this.textEl) {
                    this.textEl.textContent = this.fullText;
                }
            }
        }, this.typingSpeed);

        // Schedule fade-out
        const fadeStart = duration - 600;
        this.fadeTimeout = setTimeout(() => {
            this.container?.classList.add('fade-out');
        }, Math.max(fadeStart, 1000));

        // Dismiss after duration
        this.dismissTimeout = setTimeout(() => {
            this.hide();
        }, duration);
    }

    /**
     * Hide the dialogue
     */
    hide(): void {
        this.clearTimers();
        this.isShowing = false;
        if (this.container) {
            this.container.classList.remove('visible');
            this.container.classList.remove('fade-out');
        }
        if (this.textEl) {
            this.textEl.textContent = '';
        }
    }

    private clearTimers(): void {
        if (this.typingInterval) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
        if (this.dismissTimeout) {
            clearTimeout(this.dismissTimeout);
            this.dismissTimeout = null;
        }
        if (this.fadeTimeout) {
            clearTimeout(this.fadeTimeout);
            this.fadeTimeout = null;
        }
    }

    get showing(): boolean {
        return this.isShowing;
    }

    dispose(): void {
        this.clearTimers();
        this.container?.remove();
        document.getElementById('companion-ui-style')?.remove();
    }
}
