import { Game } from './core/Game';
import { GameSettings, KeyBindings } from './core/GameSettings';
import { CharacterClassName } from './core/CharacterClass';
import { CharacterPreview, createCharacterPreviews } from './core/CharacterPreview';
import { assetPreloader } from './core/AssetPreloader';
import { AudioManager } from './core/AudioManager';
import { GamepadManager } from './core/GamepadManager';
import { AuthService } from './core/AuthService';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './core/FirebaseConfig';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

// ========== Loading Tips System ==========
const LOADING_TIPS: string[] = [
    // Gameplay tips
    'Utilisez le bouclier pour bloquer les attaques ennemies',
    'Les coffres contiennent des potions et des flèches pour l\'archer',
    'Les ennemis enragent quand ils sont touchés à distance — attention à leur vitesse !',
    'Le chevalier bloque 70% des dégâts, l\'archer 50% et le sorcier 40%',
    'Accroupissez-vous pour réduire votre détection par les ennemis',
    'Les potions de niveau IV restaurent toute votre vie',
    'Éliminez tous les ennemis pour déverrouiller la porte de sortie',
    'L\'archer peut porter jusqu\'à 10 flèches — trouvez-en dans les coffres',
    'Courir vous permet de fuir les ennemis mais consomme votre endurance',
    'Ouvrez les coffres avec la touche d\'interaction pour obtenir du butin',
    'Les pièges à pointes infligent des dégâts — regardez où vous marchez !',
    'Le sorcier peut lancer des boules de feu dévastatrices à distance',
    'Utilisez les touches 1 à 4 pour consommer vos potions rapidement',
    'Changez de mode caméra avec V pour passer en vue première personne',
    'Le Warrok est le gardien le plus puissant — préparez-vous bien !',
    // Lore phrases
    'Les Cryptes de l\'Oubli n\'ont jamais rendu leurs prisonniers...',
    'Le Roi Maudit Aldric scella son âme dans ces profondeurs il y a des siècles',
    'Des murmures anciens résonnent entre les murs de pierre...',
    'L\'Ordre de l\'Aube Dorée envoya ses meilleurs guerriers — aucun ne revint',
    'Les vampires rôdent dans l\'obscurité, attendant leur prochain repas',
    'Les parasites se nourrissent de la peur de leurs victimes',
    'Les mutants sont le résultat d\'expériences interdites du Roi Maudit',
    'Chaque niveau vous rapproche du cœur des ténèbres',
    'Les braseros sont les seules lumières dans cet abîme sans fin',
    'La malédiction s\'étend... le monde des vivants est en danger',
    'Les zombies squelettes gardent les passages les plus profonds',
    'Seul un héros au cœur pur peut briser la malédiction d\'Aldric',
    'Les cryptes changent de forme pour piéger les intrus...',
    'Chaque coffre pourrait contenir la clé de votre survie',
    'Les ténèbres murmurent votre nom... ne les écoutez pas',
];

let tipRotationInterval: ReturnType<typeof setInterval> | null = null;

function startTipRotation(): void {
    const tipElement = document.querySelector('.loading-tip');
    if (!tipElement) return;

    // Set a random initial tip
    tipElement.textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];

    tipRotationInterval = setInterval(() => {
        const el = document.querySelector('.loading-tip') as HTMLElement | null;
        if (!el) return;

        // Fade out
        el.style.opacity = '0';

        setTimeout(() => {
            // Change text
            el.textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
            // Fade in
            el.style.opacity = '1';
        }, 400);
    }, 4500);
}

function stopTipRotation(): void {
    if (tipRotationInterval !== null) {
        clearInterval(tipRotationInterval);
        tipRotationInterval = null;
    }
}

// Initialize audio manager for menu sounds
const audioManager = AudioManager.getInstance();
audioManager.loadMenuSounds();

// Initialize settings
const settings = GameSettings.getInstance();

// State variables (declared early to avoid temporal dead zone)
let pendingLevel: number = 1;
let characterPreviews: { knight: CharacterPreview; archer: CharacterPreview; wizard: CharacterPreview } | null = null;
let previewsLoading = false;

// Check if we should show menu or start game directly
const urlParams = new URLSearchParams(window.location.search);
const levelParam = urlParams.get('level');
const classParam = urlParams.get('class') as CharacterClassName | null;

if (levelParam && classParam) {
    // Level and class specified - start game directly (show loading screen)
    hideScreenInstant('welcome-screen');
    hideScreenInstant('main-menu');
    hideScreenInstant('character-select-panel');
    audioManager.playLoadingSound();
    startTipRotation();
    const game = new Game(canvas, classParam);
    game.init().then(() => {
        stopTipRotation();
        audioManager.stopLoadingSound();
        game.run();
    });
} else if (levelParam) {
    // Only level specified - show character select (play menu music)
    hideWelcomeScreen();
    hideMainMenu();
    setupCharacterSelectListeners();
    showCharacterSelect(parseInt(levelParam, 10));
    audioManager.playMenuMusic();
} else {
    // No level - check if welcome screen was already shown this session
    const welcomeShown = sessionStorage.getItem('welcomeShown');

    if (welcomeShown) {
        // Welcome screen already shown - go directly to main menu
        hideWelcomeScreen();
        showMainMenu();
    } else {
        // First visit - show welcome screen
        showWelcomeScreen();
    }

    setupWelcomeScreenListener();
    setupMenuListeners();
    audioManager.playMenuMusic();

    // Start preloading assets in background
    assetPreloader.preloadCharacterAssets();
}

/**
 * Instantly hide a screen by skipping CSS transitions (used on page load to avoid flashes)
 */
function hideScreenInstant(id: string): void {
    const el = document.getElementById(id);
    if (el) {
        el.style.transition = 'none';
        el.classList.add('hidden');
        el.classList.remove('visible');
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
    }
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

function hideWelcomeScreen(): void {
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.classList.add('hidden');
    }
}

function showWelcomeScreen(): void {
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) {
        welcomeScreen.style.display = '';
        welcomeScreen.classList.remove('hidden');
    }
}

function setupWelcomeScreenListener(): void {
    const enterBtn = document.getElementById('btn-enter');
    if (enterBtn) {
        enterBtn.addEventListener('click', () => {
            // Mark welcome screen as shown for this session
            sessionStorage.setItem('welcomeShown', 'true');
            hideWelcomeScreen();
            showMainMenu();
        });
    }
}

async function loadCharacterPreviews(): Promise<void> {
    if (characterPreviews || previewsLoading) return;

    previewsLoading = true;
    try {
        characterPreviews = await createCharacterPreviews();

        // Mark containers as loaded
        document.querySelectorAll('.character-preview-container').forEach(container => {
            container.classList.add('loaded');
        });
    } catch (error) {
        console.error('[Main] Failed to load character previews:', error);
    }
    previewsLoading = false;
}

function showCharacterSelect(level: number = 1): void {
    pendingLevel = level;
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.add('hidden');
    }
    document.getElementById('character-select-panel')?.classList.add('visible');

    // Load character previews
    loadCharacterPreviews();
}

function setupCharacterSelectListeners(): void {
    // Character cards - start game with selected class
    document.querySelectorAll('.character-card').forEach(card => {
        card.addEventListener('click', () => {
            const charClass = (card as HTMLElement).dataset.class as CharacterClassName;
            if (charClass) {
                window.location.href = `${window.location.pathname}?level=${pendingLevel}&class=${charClass}`;
            }
        });
    });

    // Character select back button
    document.getElementById('character-back')?.addEventListener('click', () => {
        closeCharacterSelect();
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            const charSelectPanel = document.getElementById('character-select-panel');
            if (charSelectPanel?.classList.contains('visible')) {
                closeCharacterSelect();
            }
        }
    });
}

function closeCharacterSelect(): void {
    document.getElementById('character-select-panel')?.classList.remove('visible');

    // Dispose character previews to free resources
    if (characterPreviews) {
        characterPreviews.knight.dispose();
        characterPreviews.archer.dispose();
        characterPreviews.wizard.dispose();
        characterPreviews = null;
    }

    // If we came from URL with level param, go back to main page
    // Otherwise just show the main menu
    if (levelParam && !classParam) {
        window.location.href = window.location.pathname;
    } else {
        showMainMenu();
    }
}

function setupMenuListeners(): void {
    // Setup character select listeners first
    setupCharacterSelectListeners();

    // Play button - show character select for level 1
    document.getElementById('btn-play')?.addEventListener('click', () => {
        hideMainMenu();
        pendingLevel = 1;
        showCharacterSelect(1);
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

    document.getElementById('toggle-camera-mode')?.addEventListener('click', (e) => {
        (e.target as HTMLElement).classList.toggle('active');
    });

    // Gamepad settings sliders
    document.getElementById('gamepad-sensitivity')?.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        const display = document.getElementById('gamepad-sensitivity-value');
        if (display) display.textContent = value;
    });

    document.getElementById('gamepad-deadzone')?.addEventListener('input', (e) => {
        const value = parseInt((e.target as HTMLInputElement).value, 10);
        const display = document.getElementById('gamepad-deadzone-value');
        if (display) display.textContent = (value / 100).toFixed(2);
    });

    // Gamepad toggle switches
    document.getElementById('toggle-gamepad')?.addEventListener('click', (e) => {
        (e.target as HTMLElement).classList.toggle('active');
    });

    document.getElementById('toggle-gamepad-inverty')?.addEventListener('click', (e) => {
        (e.target as HTMLElement).classList.toggle('active');
    });

    document.getElementById('toggle-gamepad-vibration')?.addEventListener('click', (e) => {
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

    // Close panels on escape (character select handled by setupCharacterSelectListeners)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            document.getElementById('settings-panel')?.classList.remove('visible');
            document.getElementById('rules-panel')?.classList.remove('visible');
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
    const cameraModeToggle = document.getElementById('toggle-camera-mode');

    // Gamepad settings
    const gamepadToggle = document.getElementById('toggle-gamepad');
    const gamepadSensitivitySlider = document.getElementById('gamepad-sensitivity') as HTMLInputElement;
    const gamepadDeadzoneSlider = document.getElementById('gamepad-deadzone') as HTMLInputElement;
    const gamepadInvertYToggle = document.getElementById('toggle-gamepad-inverty');
    const gamepadVibrationToggle = document.getElementById('toggle-gamepad-vibration');

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

    if (cameraModeToggle) {
        // Active = first-person mode, Inactive = third-person mode
        cameraModeToggle.classList.toggle('active', settings.cameraMode === 'firstPerson');
    }

    // Gamepad settings
    if (gamepadToggle) {
        gamepadToggle.classList.toggle('active', settings.gamepadEnabled);
    }

    if (gamepadSensitivitySlider) {
        gamepadSensitivitySlider.value = String(settings.gamepadLookSensitivity);
        const display = document.getElementById('gamepad-sensitivity-value');
        if (display) display.textContent = String(settings.gamepadLookSensitivity);
    }

    if (gamepadDeadzoneSlider) {
        gamepadDeadzoneSlider.value = String(Math.round(settings.gamepadDeadZone * 100));
        const display = document.getElementById('gamepad-deadzone-value');
        if (display) display.textContent = settings.gamepadDeadZone.toFixed(2);
    }

    if (gamepadInvertYToggle) {
        gamepadInvertYToggle.classList.toggle('active', settings.gamepadInvertY);
    }

    if (gamepadVibrationToggle) {
        gamepadVibrationToggle.classList.toggle('active', settings.gamepadVibration);
    }

    // Update gamepad connection status
    updateGamepadConnectionStatus();
}

function saveSettingsFromUI(): void {
    const musicSlider = document.getElementById('music-volume') as HTMLInputElement;
    const sfxSlider = document.getElementById('sfx-volume') as HTMLInputElement;
    const sensitivitySlider = document.getElementById('mouse-sensitivity') as HTMLInputElement;
    const fpsToggle = document.getElementById('toggle-fps');
    const controlsToggle = document.getElementById('toggle-controls');
    const crouchModeToggle = document.getElementById('toggle-crouch-mode');
    const cameraModeToggle = document.getElementById('toggle-camera-mode');

    // Gamepad settings
    const gamepadToggle = document.getElementById('toggle-gamepad');
    const gamepadSensitivitySlider = document.getElementById('gamepad-sensitivity') as HTMLInputElement;
    const gamepadDeadzoneSlider = document.getElementById('gamepad-deadzone') as HTMLInputElement;
    const gamepadInvertYToggle = document.getElementById('toggle-gamepad-inverty');
    const gamepadVibrationToggle = document.getElementById('toggle-gamepad-vibration');

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

    if (cameraModeToggle) {
        // Active = first-person mode, Inactive = third-person mode
        settings.cameraMode = cameraModeToggle.classList.contains('active') ? 'firstPerson' : 'thirdPerson';
    }

    // Save gamepad settings
    if (gamepadToggle) {
        settings.gamepadEnabled = gamepadToggle.classList.contains('active');
    }

    if (gamepadSensitivitySlider) {
        settings.gamepadLookSensitivity = parseInt(gamepadSensitivitySlider.value, 10);
    }

    if (gamepadDeadzoneSlider) {
        settings.gamepadDeadZone = parseInt(gamepadDeadzoneSlider.value, 10) / 100;
    }

    if (gamepadInvertYToggle) {
        settings.gamepadInvertY = gamepadInvertYToggle.classList.contains('active');
    }

    if (gamepadVibrationToggle) {
        settings.gamepadVibration = gamepadVibrationToggle.classList.contains('active');
    }

    settings.save();
    updateControlsDisplay();

    // Apply volume changes immediately to menu music
    audioManager.applyVolumes();

    // Apply gamepad settings to GamepadManager
    const gamepadManager = GamepadManager.getInstance();
    gamepadManager.setEnabled(settings.gamepadEnabled);
    gamepadManager.setDeadZone(settings.gamepadDeadZone);
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

// Gamepad connection status helper
function updateGamepadConnectionStatus(): void {
    const gamepadManager = GamepadManager.getInstance();
    const isConnected = gamepadManager.isConnected();

    // Update settings panel status
    const statusElement = document.getElementById('gamepad-status');
    const statusText = statusElement?.querySelector('.status-text');
    if (statusElement && statusText) {
        if (isConnected) {
            statusElement.classList.add('connected');
            statusText.textContent = 'Manette connectee';
        } else {
            statusElement.classList.remove('connected');
            statusText.textContent = 'Aucune manette detectee';
        }
    }

    // Update global indicator
    const indicator = document.getElementById('gamepad-indicator');
    if (indicator) {
        if (isConnected) {
            indicator.classList.add('connected');
            indicator.setAttribute('title', 'Manette connectee');
        } else {
            indicator.classList.remove('connected');
            indicator.setAttribute('title', 'Aucune manette');
        }
    }
}

// Listen for gamepad connection changes
window.addEventListener('gamepadconnected', () => {
    updateGamepadConnectionStatus();
});

window.addEventListener('gamepaddisconnected', () => {
    updateGamepadConnectionStatus();
});

// Initial gamepad status check
updateGamepadConnectionStatus();

// ========== Firebase Auth Integration ==========
const authService = AuthService.getInstance();

function updateAuthUI(user: import('firebase/auth').User | null): void {
    const loggedOut = document.getElementById('auth-logged-out');
    const loggedIn = document.getElementById('auth-logged-in');
    const displayName = document.getElementById('auth-display-name');

    if (user) {
        if (loggedOut) loggedOut.style.display = 'none';
        if (loggedIn) loggedIn.style.display = '';
        if (displayName) displayName.textContent = user.displayName || 'Aventurier';
    } else {
        if (loggedOut) loggedOut.style.display = '';
        if (loggedIn) loggedIn.style.display = 'none';
    }
}

authService.onAuthChange(updateAuthUI);
authService.ready.then(() => updateAuthUI(authService.user));

function showAuthPanel(mode: 'login' | 'signup'): void {
    const panel = document.getElementById('auth-panel');
    const loginForm = document.getElementById('auth-login-form');
    const signupForm = document.getElementById('auth-signup-form');
    const title = document.getElementById('auth-panel-title');
    const errorEl = document.getElementById('auth-error');

    if (errorEl) errorEl.textContent = '';

    if (mode === 'login') {
        if (loginForm) loginForm.style.display = '';
        if (signupForm) signupForm.style.display = 'none';
        if (title) title.textContent = 'Connexion';
    } else {
        if (loginForm) loginForm.style.display = 'none';
        if (signupForm) signupForm.style.display = '';
        if (title) title.textContent = 'Inscription';
    }

    panel?.classList.add('visible');
}

function hideAuthPanel(): void {
    document.getElementById('auth-panel')?.classList.remove('visible');
}

function showAuthError(msg: string): void {
    const el = document.getElementById('auth-error');
    if (el) el.textContent = msg;
}

function translateFirebaseError(code: string): string {
    const map: Record<string, string> = {
        'auth/email-already-in-use': 'Cet email est déjà utilisé.',
        'auth/invalid-email': 'Adresse email invalide.',
        'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caractères.',
        'auth/user-not-found': 'Aucun compte trouvé avec cet email.',
        'auth/wrong-password': 'Mot de passe incorrect.',
        'auth/invalid-credential': 'Identifiants invalides.',
        'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
        'auth/popup-closed-by-user': 'Connexion Google annulée.',
    };
    return map[code] || 'Une erreur est survenue. Réessayez.';
}

// Auth panel buttons
document.getElementById('btn-auth-login')?.addEventListener('click', () => showAuthPanel('login'));
document.getElementById('btn-auth-signup')?.addEventListener('click', () => showAuthPanel('signup'));
document.getElementById('btn-switch-signup')?.addEventListener('click', () => showAuthPanel('signup'));
document.getElementById('btn-switch-login')?.addEventListener('click', () => showAuthPanel('login'));
document.getElementById('auth-back')?.addEventListener('click', hideAuthPanel);

// Login submit
document.getElementById('btn-login-submit')?.addEventListener('click', async () => {
    const email = (document.getElementById('login-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('login-password') as HTMLInputElement).value;
    if (!email || !password) { showAuthError('Veuillez remplir tous les champs.'); return; }
    try {
        await authService.login(email, password);
        hideAuthPanel();
    } catch (err: unknown) {
        console.error('[Auth] Login error:', err);
        const code = (err as { code?: string }).code || '';
        showAuthError(translateFirebaseError(code));
    }
});

// Signup submit
document.getElementById('btn-signup-submit')?.addEventListener('click', async () => {
    const name = (document.getElementById('signup-name') as HTMLInputElement).value.trim();
    const email = (document.getElementById('signup-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('signup-password') as HTMLInputElement).value;
    if (!name || !email || !password) { showAuthError('Veuillez remplir tous les champs.'); return; }
    try {
        await authService.signup(email, password, name);
        hideAuthPanel();
    } catch (err: unknown) {
        console.error('[Auth] Signup error:', err);
        const code = (err as { code?: string }).code || '';
        showAuthError(translateFirebaseError(code));
    }
});

// Google login (both forms)
document.getElementById('btn-google-login')?.addEventListener('click', async () => {
    try {
        await authService.loginWithGoogle();
        hideAuthPanel();
    } catch (err: unknown) {
        const code = (err as { code?: string }).code || '';
        showAuthError(translateFirebaseError(code));
    }
});
document.getElementById('btn-google-signup')?.addEventListener('click', async () => {
    try {
        await authService.loginWithGoogle();
        hideAuthPanel();
    } catch (err: unknown) {
        const code = (err as { code?: string }).code || '';
        showAuthError(translateFirebaseError(code));
    }
});

// Profile panel (icon-based in top-right corner)
document.getElementById('btn-profile')?.addEventListener('click', async () => {
    const panel = document.getElementById('profile-panel');
    panel?.classList.add('visible');

    const stats = await authService.getStats();
    if (!stats) return;

    const set = (id: string, val: unknown) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val ?? '0');
    };

    set('profile-name', stats['displayName']);
    set('profile-email', stats['email']);
    set('profile-kills', stats['totalKills']);
    set('profile-deaths', stats['totalDeaths']);
    set('profile-damage-dealt', stats['totalDamageDealt']);
    set('profile-damage-taken', stats['totalDamageTaken']);
    set('profile-levels', stats['totalLevelsCompleted']);
    set('profile-potions', stats['totalPotionsUsed']);
    set('profile-arrows', stats['totalArrowsShot']);
    set('profile-spells', stats['totalSpellsCast']);
    set('profile-chests', stats['totalChestsOpened']);

    const killsByType = (stats['killsByType'] || {}) as Record<string, number>;
    set('profile-kill-vampire', killsByType['vampire'] || 0);
    set('profile-kill-parasite', killsByType['parasite'] || 0);
    set('profile-kill-mutant', killsByType['mutant'] || 0);
    set('profile-kill-skeletonzombie', killsByType['skeletonzombie'] || 0);
    set('profile-kill-warrok', killsByType['warrok'] || 0);

    const classUsage = (stats['classUsage'] || {}) as Record<string, number>;
    set('profile-class-knight', classUsage['knight'] || 0);
    set('profile-class-archer', classUsage['archer'] || 0);
    set('profile-class-wizard', classUsage['wizard'] || 0);

    const totalMs = (stats['totalPlaytimeMs'] as number) || 0;
    const hours = Math.floor(totalMs / 3600000);
    const mins = Math.floor((totalMs % 3600000) / 60000);
    set('profile-playtime', `${hours}h ${mins}m`);
});

document.getElementById('profile-back')?.addEventListener('click', () => {
    document.getElementById('profile-panel')?.classList.remove('visible');
});

// Profile logout button
document.getElementById('btn-profile-logout')?.addEventListener('click', async () => {
    await authService.logout();
    document.getElementById('profile-panel')?.classList.remove('visible');
});

// Leaderboard panel
let currentLeaderboardTab = 'kills';

async function loadLeaderboard(tab: string): Promise<void> {
    currentLeaderboardTab = tab;
    const body = document.getElementById('leaderboard-body');
    const emptyMsg = document.getElementById('leaderboard-empty');
    const header = document.getElementById('leaderboard-stat-header');
    if (!body) return;

    body.innerHTML = '';

    const field = tab === 'kills' ? 'totalKills' : 'totalLevelsCompleted';
    if (header) header.textContent = tab === 'kills' ? 'Éliminations' : 'Niveaux';

    // Update active tab styling
    document.querySelectorAll('.leaderboard-tab').forEach(t => {
        t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab);
    });

    try {
        const q = query(collection(db, 'users'), orderBy(field, 'desc'), limit(20));
        const snap = await getDocs(q);

        if (snap.empty) {
            if (emptyMsg) emptyMsg.style.display = '';
            return;
        }

        if (emptyMsg) emptyMsg.style.display = 'none';

        let rank = 1;
        snap.forEach((docSnap) => {
            const data = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="leaderboard-rank">${rank}</td>
                <td>${data['displayName'] || 'Anonyme'}</td>
                <td>${data[field] ?? 0}</td>
            `;
            body.appendChild(tr);
            rank++;
        });
    } catch (err) {
        console.warn('[Leaderboard] Failed to load:', err);
        if (emptyMsg) {
            emptyMsg.textContent = 'Impossible de charger le classement';
            emptyMsg.style.display = '';
        }
    }
}

document.getElementById('btn-leaderboard')?.addEventListener('click', () => {
    document.getElementById('leaderboard-panel')?.classList.add('visible');
    loadLeaderboard(currentLeaderboardTab);
});

document.querySelectorAll('.leaderboard-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const t = (tab as HTMLElement).dataset.tab;
        if (t) loadLeaderboard(t);
    });
});

document.getElementById('leaderboard-back')?.addEventListener('click', () => {
    document.getElementById('leaderboard-panel')?.classList.remove('visible');
});

// Close auth/profile/leaderboard panels on Escape
document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        document.getElementById('auth-panel')?.classList.remove('visible');
        document.getElementById('profile-panel')?.classList.remove('visible');
        document.getElementById('leaderboard-panel')?.classList.remove('visible');
    }
});
