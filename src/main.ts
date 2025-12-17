import { Game } from './core/Game';
import { GameSettings, KeyBindings } from './core/GameSettings';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

// Initialize settings
const settings = GameSettings.getInstance();

// Check if we should show menu or start game directly
const urlParams = new URLSearchParams(window.location.search);
const levelParam = urlParams.get('level');

if (levelParam) {
    // Level specified - start game directly
    hideMainMenu();
    startGame();
} else {
    // No level - show main menu
    showMainMenu();
    setupMenuListeners();
}

function hideMainMenu(): void {
    const mainMenu = document.getElementById('main-menu');
    if (mainMenu) {
        mainMenu.classList.add('hidden');
    }
}

function showMainMenu(): void {
    const mainMenu = document.getElementById('main-menu');
    const loading = document.getElementById('loading');
    if (mainMenu) {
        mainMenu.classList.remove('hidden');
    }
    if (loading) {
        loading.classList.add('hidden');
    }
}

function startGame(level?: number): void {
    if (level !== undefined) {
        // Navigate to level URL
        window.location.href = `${window.location.pathname}?level=${level}`;
        return;
    }

    const game = new Game(canvas);
    game.init().then(() => {
        game.run();
    });
}

function setupMenuListeners(): void {
    // Play button - start level 1
    document.getElementById('btn-play')?.addEventListener('click', () => {
        startGame(1);
    });

    // Level select button
    document.getElementById('btn-levels')?.addEventListener('click', () => {
        document.getElementById('level-select-panel')?.classList.add('visible');
    });

    // Rules button
    document.getElementById('btn-rules')?.addEventListener('click', () => {
        document.getElementById('rules-panel')?.classList.add('visible');
    });

    // Settings button
    document.getElementById('btn-settings')?.addEventListener('click', () => {
        loadSettingsToUI();
        document.getElementById('settings-panel')?.classList.add('visible');
    });

    // Level cards
    document.querySelectorAll('.level-card').forEach(card => {
        card.addEventListener('click', () => {
            const level = (card as HTMLElement).dataset.level;
            if (level) {
                startGame(parseInt(level, 10));
            }
        });
    });

    // Levels back button
    document.getElementById('levels-back')?.addEventListener('click', () => {
        document.getElementById('level-select-panel')?.classList.remove('visible');
    });

    // Rules close button
    document.getElementById('rules-close')?.addEventListener('click', () => {
        document.getElementById('rules-panel')?.classList.remove('visible');
    });

    // Settings sliders
    document.getElementById('music-volume')?.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        const display = document.getElementById('music-value');
        if (display) display.textContent = value;
    });

    document.getElementById('sfx-volume')?.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        const display = document.getElementById('sfx-value');
        if (display) display.textContent = value;
    });

    document.getElementById('mouse-sensitivity')?.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        const display = document.getElementById('sensitivity-value');
        if (display) display.textContent = value;
    });

    // Toggle switches
    document.getElementById('toggle-fps')?.addEventListener('click', (e) => {
        (e.target as HTMLElement).classList.toggle('active');
    });

    document.getElementById('toggle-controls')?.addEventListener('click', (e) => {
        (e.target as HTMLElement).classList.toggle('active');
    });

    document.getElementById('toggle-crouch-mode')?.addEventListener('click', (e) => {
        (e.target as HTMLElement).classList.toggle('active');
    });

    // Settings cancel
    document.getElementById('settings-cancel')?.addEventListener('click', () => {
        document.getElementById('settings-panel')?.classList.remove('visible');
    });

    // Settings save
    document.getElementById('settings-save')?.addEventListener('click', () => {
        saveSettingsFromUI();
        document.getElementById('settings-panel')?.classList.remove('visible');
    });

    // Controls button in settings panel
    document.getElementById('btn-controls')?.addEventListener('click', () => {
        document.getElementById('settings-panel')?.classList.remove('visible');
        loadControlsToUI();
        document.getElementById('controls-panel')?.classList.add('visible');
    });

    // Controls back button
    document.getElementById('controls-back')?.addEventListener('click', () => {
        // Save keybindings before going back
        settings.save();
        document.getElementById('controls-panel')?.classList.remove('visible');
        document.getElementById('settings-panel')?.classList.add('visible');
    });

    // Controls reset button
    document.getElementById('controls-reset')?.addEventListener('click', () => {
        settings.resetKeyBindings();
        loadControlsToUI();
    });

    // Setup key binding listeners
    setupKeyBindingListeners();

    // Close panels on escape
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            document.getElementById('settings-panel')?.classList.remove('visible');
            document.getElementById('rules-panel')?.classList.remove('visible');
            document.getElementById('level-select-panel')?.classList.remove('visible');
            document.getElementById('controls-panel')?.classList.remove('visible');
        }
    });
}

function loadControlsToUI(): void {
    const updateButton = (action: string) => {
        const btn = document.querySelector(`.key-bind-btn[data-action="${action}"]`);
        if (btn) {
            btn.textContent = settings.getBindingDisplay(action as keyof KeyBindings);
        }
    };

    updateButton('forward');
    updateButton('backward');
    updateButton('left');
    updateButton('right');
    updateButton('run');
    updateButton('jump');
    updateButton('crouch');
    updateButton('pause');
}

function setupKeyBindingListeners(): void {
    document.querySelectorAll('.key-bind-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.currentTarget as HTMLElement;
            const action = button.dataset.action as keyof KeyBindings;
            if (!action) return;

            // Mark as listening
            button.classList.add('listening');
            button.textContent = '...';

            // Listen for next key press
            const keyHandler = (keyEvent: KeyboardEvent) => {
                keyEvent.preventDefault();
                keyEvent.stopPropagation();

                // Don't allow Escape as a binding
                if (keyEvent.code === 'Escape') {
                    button.classList.remove('listening');
                    loadControlsToUI();
                    window.removeEventListener('keydown', keyHandler, true);
                    return;
                }

                // Set the new binding
                settings.setBinding(action, [keyEvent.code]);
                button.classList.remove('listening');
                loadControlsToUI();

                window.removeEventListener('keydown', keyHandler, true);
            };

            window.addEventListener('keydown', keyHandler, true);
        });
    });
}

function loadSettingsToUI(): void {
    const musicSlider = document.getElementById('music-volume') as HTMLInputElement;
    const sfxSlider = document.getElementById('sfx-volume') as HTMLInputElement;
    const sensitivitySlider = document.getElementById('mouse-sensitivity') as HTMLInputElement;
    const fpsToggle = document.getElementById('toggle-fps');
    const controlsToggle = document.getElementById('toggle-controls');
    const crouchModeToggle = document.getElementById('toggle-crouch-mode');

    if (musicSlider) {
        musicSlider.value = String(settings.musicVolume);
        const display = document.getElementById('music-value');
        if (display) display.textContent = String(settings.musicVolume);
    }

    if (sfxSlider) {
        sfxSlider.value = String(settings.sfxVolume);
        const display = document.getElementById('sfx-value');
        if (display) display.textContent = String(settings.sfxVolume);
    }

    if (sensitivitySlider) {
        sensitivitySlider.value = String(settings.mouseSensitivity);
        const display = document.getElementById('sensitivity-value');
        if (display) display.textContent = String(settings.mouseSensitivity);
    }

    if (fpsToggle) {
        fpsToggle.classList.toggle('active', settings.showFps);
    }

    if (controlsToggle) {
        controlsToggle.classList.toggle('active', settings.showControls);
    }

    if (crouchModeToggle) {
        // Active = hold mode, Inactive = toggle mode
        crouchModeToggle.classList.toggle('active', settings.crouchMode === 'hold');
    }
}

function saveSettingsFromUI(): void {
    const musicSlider = document.getElementById('music-volume') as HTMLInputElement;
    const sfxSlider = document.getElementById('sfx-volume') as HTMLInputElement;
    const sensitivitySlider = document.getElementById('mouse-sensitivity') as HTMLInputElement;
    const fpsToggle = document.getElementById('toggle-fps');
    const controlsToggle = document.getElementById('toggle-controls');
    const crouchModeToggle = document.getElementById('toggle-crouch-mode');

    if (musicSlider) {
        settings.musicVolume = parseInt(musicSlider.value, 10);
    }

    if (sfxSlider) {
        settings.sfxVolume = parseInt(sfxSlider.value, 10);
    }

    if (sensitivitySlider) {
        settings.mouseSensitivity = parseInt(sensitivitySlider.value, 10);
    }

    if (fpsToggle) {
        settings.showFps = fpsToggle.classList.contains('active');
    }

    if (controlsToggle) {
        settings.showControls = controlsToggle.classList.contains('active');
    }

    if (crouchModeToggle) {
        // Active = hold mode, Inactive = toggle mode
        settings.crouchMode = crouchModeToggle.classList.contains('active') ? 'hold' : 'toggle';
    }

    settings.save();
    updateControlsDisplay();
}

function updateControlsDisplay(): void {
    // Get display names for movement keys (combine forward, left, backward, right)
    const forward = settings.getBindingDisplay('forward');
    const left = settings.getBindingDisplay('left');
    const backward = settings.getBindingDisplay('backward');
    const right = settings.getBindingDisplay('right');
    const movementKeys = `${forward}${left}${backward}${right}`;

    const runKey = settings.getBindingDisplay('run');
    const jumpKey = settings.getBindingDisplay('jump');
    const crouchKey = settings.getBindingDisplay('crouch');
    const pauseKey = settings.getBindingDisplay('pause');

    // Update all elements with data-control attribute
    document.querySelectorAll('[data-control="movement"]').forEach(el => {
        el.textContent = movementKeys;
    });

    document.querySelectorAll('[data-control="run"]').forEach(el => {
        el.textContent = runKey;
    });

    document.querySelectorAll('[data-control="jump"]').forEach(el => {
        el.textContent = jumpKey;
    });

    document.querySelectorAll('[data-control="crouch"]').forEach(el => {
        el.textContent = crouchKey;
    });

    document.querySelectorAll('[data-control="pause"]').forEach(el => {
        el.textContent = pauseKey;
    });
}

// Update controls display on page load
updateControlsDisplay();
