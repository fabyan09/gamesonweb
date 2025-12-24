import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { GameSettings } from './GameSettings';

/**
 * Audio Manager - handles all game audio using HTML5 Audio
 * Integrates with GameSettings for volume control
 */
export class AudioManager {
    private static instance: AudioManager | null = null;

    private scene: Scene | null = null;
    private settings: GameSettings;

    // Music
    private ambientMusic: HTMLAudioElement | null = null;

    // SFX pools
    private hitSounds: HTMLAudioElement[] = [];
    private swordSheathSounds: HTMLAudioElement[] = [];
    private fallSound: HTMLAudioElement | null = null;
    private beastGrowlSounds: HTMLAudioElement[] = [];
    private campfireSound: HTMLAudioElement | null = null;
    private painSounds: HTMLAudioElement[] = [];
    private deathSounds: HTMLAudioElement[] = [];
    private shieldBlockSounds: HTMLAudioElement[] = [];
    private chestOpenSound: HTMLAudioElement | null = null;
    private potionDrinkSound: HTMLAudioElement | null = null;
    private arrowShootSound: HTMLAudioElement | null = null;
    private noArrowSound: HTMLAudioElement | null = null;

    // Base path for assets
    private basePath: string = '';

    // Track playing brazier sounds
    private brazierSoundsPlaying: boolean = false;

    // Track user interaction for autoplay policy
    private userInteracted: boolean = false;
    private wantsAmbientMusic: boolean = false;
    private wantsCampfire: boolean = false;

    private constructor() {
        this.settings = GameSettings.getInstance();
        this.setupUserInteractionListener();
    }

    /**
     * Setup listener for first user interaction to start looping sounds
     */
    private setupUserInteractionListener(): void {
        const onInteraction = () => {
            if (this.userInteracted) return;
            this.userInteracted = true;
            console.log('[AudioManager] User interaction detected - starting looping sounds');

            // Start pending looping sounds
            if (this.wantsAmbientMusic && this.ambientMusic) {
                this.ambientMusic.play().catch(e => console.warn('[AudioManager] Ambient play error:', e));
            }
            if (this.wantsCampfire && this.campfireSound) {
                this.campfireSound.play().catch(e => console.warn('[AudioManager] Campfire play error:', e));
            }

            // Remove listeners
            document.removeEventListener('click', onInteraction);
            document.removeEventListener('keydown', onInteraction);
            document.removeEventListener('mousedown', onInteraction);
        };

        document.addEventListener('click', onInteraction);
        document.addEventListener('keydown', onInteraction);
        document.addEventListener('mousedown', onInteraction);
    }

    static getInstance(): AudioManager {
        if (!AudioManager.instance) {
            AudioManager.instance = new AudioManager();
        }
        return AudioManager.instance;
    }

    /**
     * Initialize the audio manager
     */
    async init(scene: Scene): Promise<void> {
        this.scene = scene;
        this.basePath = `${import.meta.env.BASE_URL}assets/SFX/`;

        console.log('[AudioManager] Initializing audio system...');
        console.log('[AudioManager] Base path:', this.basePath);

        // Load all sounds
        await this.loadAllSounds();

        console.log('[AudioManager] Audio system initialized');
    }

    /**
     * Load all sounds
     */
    private async loadAllSounds(): Promise<void> {
        // Load ambient music
        this.ambientMusic = this.createAudio(`${this.basePath}dungeon_ambient.ogg`, true);
        if (this.ambientMusic) {
            this.ambientMusic.volume = this.getMusicVolume();
            console.log('[AudioManager] Ambient music loaded');
        }

        // Load hit sounds
        const hitFiles = ['hit_1.wav', 'hit_2.wav', 'hit_3.wav'];
        for (const file of hitFiles) {
            const audio = this.createAudio(`${this.basePath}RPG%20sounds/${file}`, false);
            if (audio) {
                this.hitSounds.push(audio);
            }
        }
        console.log(`[AudioManager] Loaded ${this.hitSounds.length} hit sounds`);

        // Load sword sheath sounds
        const sheathFiles = ['sword_sheath_1.wav', 'sword_sheath_2.wav'];
        for (const file of sheathFiles) {
            const audio = this.createAudio(`${this.basePath}RPG%20sounds/${file}`, false);
            if (audio) {
                this.swordSheathSounds.push(audio);
            }
        }
        console.log(`[AudioManager] Loaded ${this.swordSheathSounds.length} sword sheath sounds`);

        // Load fall sound
        this.fallSound = this.createAudio(`${this.basePath}RPG%20sounds/fall.wav`, false);
        if (this.fallSound) {
            console.log('[AudioManager] Fall sound loaded');
        }

        // Load beast growl sounds
        const growlFiles = [
            'Beast%20Growl%201.wav',
            'Beast%20Growl%202.wav',
            'Beast%20Growl%203.wav',
            'Beast%20Growl%204.wav',
            'Beast%20Growl%205.wav',
            'Beast%20Growl.wav'
        ];
        for (const file of growlFiles) {
            const audio = this.createAudio(`${this.basePath}Monsters%20or%20Beasts/${file}`, false);
            if (audio) {
                this.beastGrowlSounds.push(audio);
            }
        }
        console.log(`[AudioManager] Loaded ${this.beastGrowlSounds.length} beast growl sounds`);

        // Load campfire sound (for braziers)
        this.campfireSound = this.createAudio(`${this.basePath}RPG%20sounds/campfire_2.wav`, true);
        if (this.campfireSound) {
            this.campfireSound.volume = this.getSfxVolume() * 0.6;
            console.log('[AudioManager] Campfire sound loaded');
        }

        // Load player pain sounds
        const painFiles = ['pain1.wav', 'pain2.wav', 'pain3.wav', 'pain4.wav', 'pain5.wav', 'pain6.wav', 'painh.wav', 'paino.wav'];
        for (const file of painFiles) {
            const audio = this.createAudio(`${this.basePath}player/${file}`, false);
            if (audio) {
                this.painSounds.push(audio);
            }
        }
        console.log(`[AudioManager] Loaded ${this.painSounds.length} pain sounds`);

        // Load player death sounds
        const deathFiles = ['deathh.wav', 'die1.wav', 'die2.wav'];
        for (const file of deathFiles) {
            const audio = this.createAudio(`${this.basePath}player/${file}`, false);
            if (audio) {
                this.deathSounds.push(audio);
            }
        }
        console.log(`[AudioManager] Loaded ${this.deathSounds.length} death sounds`);

        // Load shield block sounds
        const shieldFiles = [
            'impact.1.ogg', 'impact.2.ogg', 'impact.3.ogg', 'impact.4.ogg', 'impact.5.ogg',
            'impact.6.ogg', 'impact.7.ogg', 'impact.8.ogg', 'impact.9.ogg', 'impact.10.ogg'
        ];
        for (const file of shieldFiles) {
            const audio = this.createAudio(`${this.basePath}Shield%20Impacts/${file}`, false);
            if (audio) {
                this.shieldBlockSounds.push(audio);
            }
        }
        console.log(`[AudioManager] Loaded ${this.shieldBlockSounds.length} shield block sounds`);

        // Load chest open sound (reusing a suitable sound)
        this.chestOpenSound = this.createAudio(`${this.basePath}RPG%20sounds/chest_open.wav`, false);
        if (!this.chestOpenSound) {
            // Fallback to sword sheath sound if chest_open.wav doesn't exist
            this.chestOpenSound = this.createAudio(`${this.basePath}RPG%20sounds/sword_sheath_1.wav`, false);
        }
        if (this.chestOpenSound) {
            console.log('[AudioManager] Chest open sound loaded');
        }

        // Load potion drink sound
        this.potionDrinkSound = this.createAudio(`${this.basePath}RPG%20sounds/potion_drink.wav`, false);
        if (!this.potionDrinkSound) {
            // Fallback
            this.potionDrinkSound = this.createAudio(`${this.basePath}RPG%20sounds/fall.wav`, false);
        }
        if (this.potionDrinkSound) {
            console.log('[AudioManager] Potion drink sound loaded');
        }

        // Load arrow shoot sound
        this.arrowShootSound = this.createAudio(`${this.basePath}RPG%20sounds/arrow_shoot.wav`, false);
        if (!this.arrowShootSound) {
            // Fallback to sword sheath sound
            this.arrowShootSound = this.createAudio(`${this.basePath}RPG%20sounds/sword_sheath_2.wav`, false);
        }
        if (this.arrowShootSound) {
            console.log('[AudioManager] Arrow shoot sound loaded');
        }

        // Load no arrow sound (click/empty)
        this.noArrowSound = this.createAudio(`${this.basePath}RPG%20sounds/no_arrow.wav`, false);
        if (this.noArrowSound) {
            console.log('[AudioManager] No arrow sound loaded');
        }
    }

    /**
     * Create an audio element
     */
    private createAudio(url: string, loop: boolean): HTMLAudioElement | null {
        try {
            const audio = new Audio(url);
            audio.loop = loop;
            audio.preload = 'auto';
            audio.volume = this.getSfxVolume();
            return audio;
        } catch (e) {
            console.warn(`[AudioManager] Failed to create audio for ${url}:`, e);
            return null;
        }
    }

    /**
     * Play a sound with error handling
     */
    private playSound(audio: HTMLAudioElement | null): void {
        if (!audio) return;

        // Reset to start if already playing
        audio.currentTime = 0;

        audio.play().catch(e => {
            // Ignore autoplay errors - they're expected before user interaction
            if (e.name !== 'NotAllowedError') {
                console.warn('[AudioManager] Play error:', e);
            }
        });
    }

    /**
     * Create a spatial campfire sound attached to a brazier
     * Note: HTML5 Audio doesn't support spatial audio, so we just play the campfire sound globally
     */
    createBrazierSound(brazierNode: TransformNode): void {
        // Only start the campfire sound once (for all braziers)
        if (!this.brazierSoundsPlaying && this.campfireSound) {
            this.brazierSoundsPlaying = true;
            this.wantsCampfire = true;

            // If user already interacted, play immediately
            if (this.userInteracted) {
                this.campfireSound.play().catch(() => {});
                console.log('[AudioManager] Campfire ambient started');
            } else {
                console.log('[AudioManager] Campfire will start after user interaction');
            }
        }
    }

    /**
     * Start playing ambient music
     */
    playAmbientMusic(): void {
        if (this.ambientMusic) {
            this.ambientMusic.volume = this.getMusicVolume();
            this.wantsAmbientMusic = true;

            // If user already interacted, play immediately
            if (this.userInteracted) {
                this.ambientMusic.play().catch(() => {});
                console.log('[AudioManager] Ambient music started');
            } else {
                console.log('[AudioManager] Ambient music will start after user interaction');
            }
        }
    }

    /**
     * Stop ambient music
     */
    stopAmbientMusic(): void {
        if (this.ambientMusic) {
            this.ambientMusic.pause();
            this.ambientMusic.currentTime = 0;
            console.log('[AudioManager] Ambient music stopped');
        }
    }

    /**
     * Play a random hit sound (for sword attacks)
     */
    playHitSound(): void {
        if (this.hitSounds.length === 0) return;

        const randomIndex = Math.floor(Math.random() * this.hitSounds.length);
        const sound = this.hitSounds[randomIndex];
        if (sound) {
            sound.volume = this.getSfxVolume();
            this.playSound(sound);
        }
    }

    /**
     * Play a random sword sheath sound
     */
    playSwordSheathSound(): void {
        if (this.swordSheathSounds.length === 0) return;

        const randomIndex = Math.floor(Math.random() * this.swordSheathSounds.length);
        const sound = this.swordSheathSounds[randomIndex];
        if (sound) {
            sound.volume = this.getSfxVolume();
            this.playSound(sound);
        }
    }

    /**
     * Play the fall/landing sound
     */
    playFallSound(): void {
        if (this.fallSound) {
            this.fallSound.volume = this.getSfxVolume();
            this.playSound(this.fallSound);
        }
    }

    /**
     * Play a random beast growl sound (for enemies)
     */
    playBeastGrowlSound(): void {
        if (this.beastGrowlSounds.length === 0) return;

        const randomIndex = Math.floor(Math.random() * this.beastGrowlSounds.length);
        const sound = this.beastGrowlSounds[randomIndex];
        if (sound) {
            sound.volume = this.getSfxVolume() * 0.8;
            this.playSound(sound);
        }
    }

    /**
     * Play a random pain sound (when player takes damage)
     */
    playPainSound(): void {
        if (this.painSounds.length === 0) return;

        const randomIndex = Math.floor(Math.random() * this.painSounds.length);
        const sound = this.painSounds[randomIndex];
        if (sound) {
            sound.volume = this.getSfxVolume();
            this.playSound(sound);
        }
    }

    /**
     * Play a random death sound (when player dies)
     */
    playDeathSound(): void {
        if (this.deathSounds.length === 0) return;

        const randomIndex = Math.floor(Math.random() * this.deathSounds.length);
        const sound = this.deathSounds[randomIndex];
        if (sound) {
            sound.volume = this.getSfxVolume();
            this.playSound(sound);
        }
    }

    /**
     * Play a random shield block sound (when player blocks an attack)
     */
    playShieldBlockSound(): void {
        if (this.shieldBlockSounds.length === 0) return;

        const randomIndex = Math.floor(Math.random() * this.shieldBlockSounds.length);
        const sound = this.shieldBlockSounds[randomIndex];
        if (sound) {
            sound.volume = this.getSfxVolume();
            this.playSound(sound);
        }
    }

    /**
     * Play chest open sound
     */
    playChestOpenSound(): void {
        if (this.chestOpenSound) {
            this.chestOpenSound.volume = this.getSfxVolume();
            this.playSound(this.chestOpenSound);
        }
    }

    /**
     * Play potion drink sound
     */
    playPotionDrinkSound(): void {
        if (this.potionDrinkSound) {
            this.potionDrinkSound.volume = this.getSfxVolume();
            this.playSound(this.potionDrinkSound);
        }
    }

    /**
     * Play arrow shoot sound
     */
    playArrowShootSound(): void {
        if (this.arrowShootSound) {
            this.arrowShootSound.volume = this.getSfxVolume();
            this.playSound(this.arrowShootSound);
        }
    }

    /**
     * Play no arrow sound (when trying to shoot with no arrows)
     */
    playNoArrowSound(): void {
        if (this.noArrowSound) {
            this.noArrowSound.volume = this.getSfxVolume() * 0.5;
            this.playSound(this.noArrowSound);
        }
    }

    /**
     * Get music volume as 0-1 float
     */
    private getMusicVolume(): number {
        return this.settings.musicVolume / 100;
    }

    /**
     * Get SFX volume as 0-1 float
     */
    private getSfxVolume(): number {
        return this.settings.sfxVolume / 100;
    }

    /**
     * Apply current volume settings to all sounds
     */
    applyVolumes(): void {
        const musicVol = this.getMusicVolume();
        const sfxVol = this.getSfxVolume();

        // Music
        if (this.ambientMusic) {
            this.ambientMusic.volume = musicVol;
        }

        // SFX
        this.hitSounds.forEach(s => s.volume = sfxVol);
        this.swordSheathSounds.forEach(s => s.volume = sfxVol);
        if (this.fallSound) {
            this.fallSound.volume = sfxVol;
        }
        this.beastGrowlSounds.forEach(s => s.volume = sfxVol * 0.8);

        // Campfire
        if (this.campfireSound) {
            this.campfireSound.volume = sfxVol * 0.6;
        }
    }

    /**
     * Pause all sounds (for pause menu)
     */
    pauseAll(): void {
        if (this.ambientMusic) {
            this.ambientMusic.pause();
        }
        if (this.campfireSound) {
            this.campfireSound.pause();
        }
    }

    /**
     * Resume all paused sounds
     */
    resumeAll(): void {
        if (this.ambientMusic) {
            this.ambientMusic.play().catch(() => {});
        }
        if (this.campfireSound && this.brazierSoundsPlaying) {
            this.campfireSound.play().catch(() => {});
        }
    }

    /**
     * Dispose all audio resources
     */
    dispose(): void {
        if (this.ambientMusic) {
            this.ambientMusic.pause();
            this.ambientMusic = null;
        }

        this.hitSounds.forEach(s => s.pause());
        this.hitSounds = [];

        this.swordSheathSounds.forEach(s => s.pause());
        this.swordSheathSounds = [];

        if (this.fallSound) {
            this.fallSound.pause();
            this.fallSound = null;
        }

        this.beastGrowlSounds.forEach(s => s.pause());
        this.beastGrowlSounds = [];

        if (this.campfireSound) {
            this.campfireSound.pause();
            this.campfireSound = null;
        }

        this.brazierSoundsPlaying = false;
    }
}
