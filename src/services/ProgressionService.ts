import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './FirebaseConfig';
import { AuthService } from './AuthService';
import { CharacterClassName, PlayerProgressionModifiers } from '../entities/CharacterClass';

export type UpgradeId = 'strength' | 'vitality' | 'endurance' | 'haste' | 'defense' | 'precision' | 'recovery';

export interface UpgradeChoice {
    id: UpgradeId;
    title: string;
    description: string;
    icon: string;
}

export interface ProgressionProfile {
    accountLevel: number;
    accountXp: number;
    totalXp: number;
    nextLevelXp: number;
    perkRanks: Record<UpgradeId, number>;
}

export interface LevelSessionSummary {
    levelIndex: number;
    kills: number;
    damageDealt: number;
    damageTaken: number;
    potionsUsed: number;
    arrowsShot: number;
    spellsCast: number;
    chestsOpened: number;
    playtimeMs: number;
}

export interface LevelCompletionResult {
    gainedXp: number;
    leveledUp: boolean;
    profile: ProgressionProfile;
    choices: UpgradeChoice[];
}

const STORAGE_KEY = 'dungeon_progression_state';

const UPGRADE_POOL: Array<Omit<UpgradeChoice, 'id'> & { id: UpgradeId }> = [
    {
        id: 'strength',
        title: '+5 ATQ',
        description: 'Augmente les dégâts de base.',
        icon: 'sword'
    },
    {
        id: 'vitality',
        title: '+20 PV',
        description: 'Augmente la vie maximale.',
        icon: 'heart'
    },
    {
        id: 'endurance',
        title: '+20 STA',
        description: 'Augmente la stamina maximale.',
        icon: 'shield'
    },
    {
        id: 'haste',
        title: '+VIT',
        description: 'Augmente la vitesse de déplacement.',
        icon: 'boot'
    },
    {
        id: 'defense',
        title: '-DGTS',
        description: 'Réduit les dégâts subis.',
        icon: 'armor'
    },
    {
        id: 'precision',
        title: '+PORTÉE',
        description: 'Augmente la portée des attaques.',
        icon: 'target'
    },
    {
        id: 'recovery',
        title: '+REGEN',
        description: 'Accélère la récupération de stamina.',
        icon: 'spark'
    }
];

const DEFAULT_PERKS: Record<UpgradeId, number> = {
    strength: 0,
    vitality: 0,
    endurance: 0,
    haste: 0,
    defense: 0,
    precision: 0,
    recovery: 0
};

const DEFAULT_PROFILE: ProgressionProfile = {
    accountLevel: 1,
    accountXp: 0,
    totalXp: 0,
    nextLevelXp: 120,
    perkRanks: { ...DEFAULT_PERKS }
};

export class ProgressionService {
    private static instance: ProgressionService;
    private authService: AuthService;
    private profile: ProgressionProfile = { ...DEFAULT_PROFILE, perkRanks: { ...DEFAULT_PERKS } };

    private constructor() {
        this.authService = AuthService.getInstance();
        this.loadLocalProfile();
    }

    static getInstance(): ProgressionService {
        if (!ProgressionService.instance) {
            ProgressionService.instance = new ProgressionService();
        }
        return ProgressionService.instance;
    }

    async loadProfileFromAccount(): Promise<ProgressionProfile> {
        await this.authService.ready;

        if (!this.authService.user) {
            return this.profile;
        }

        try {
            const snap = await getDoc(doc(db, 'users', this.authService.user.uid));
            if (snap.exists()) {
                const data = snap.data() as Record<string, unknown>;
                this.profile = this.profileFromData(data);
                this.saveLocalProfile();
                await this.syncProfile();
                return this.profile;
            }
        } catch (error) {
            console.warn('[ProgressionService] Failed to load profile from account:', error);
        }

        return this.profile;
    }

    getProfile(): ProgressionProfile {
        return this.profile;
    }

    getUpgradeChoices(): UpgradeChoice[] {
        const shuffled = [...UPGRADE_POOL].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 3).map(choice => ({
            id: choice.id,
            title: choice.title,
            description: choice.description,
            icon: choice.icon
        }));
    }

    getRuntimeModifiers(): PlayerProgressionModifiers {
        const perks = this.profile.perkRanks;
        return {
            movementMultiplier: 1 + perks.haste * 0.06,
            maxHealthBonus: perks.vitality * 20,
            maxStaminaBonus: perks.endurance * 20,
            staminaRegenBonus: perks.endurance * 1.5 + perks.recovery * 2,
            staminaDrainMultiplier: Math.max(0.5, 1 - (perks.endurance * 0.04 + perks.recovery * 0.03)),
            attackCostMultiplier: Math.max(0.55, 1 - perks.recovery * 0.04),
            damageTakenMultiplier: Math.max(0.5, 1 - perks.defense * 0.08),
            attackDamageBonus: perks.strength * 5,
            attackRangeMultiplier: 1 + perks.precision * 0.08
        };
    }

    getCurrentMaxHealth(): number {
        return 100 + this.getRuntimeModifiers().maxHealthBonus;
    }

    getCurrentNextLevelXp(): number {
        return this.profile.nextLevelXp;
    }

    getAccountProgressPercent(): number {
        return Math.max(0, Math.min(100, Math.round((this.profile.accountXp / this.profile.nextLevelXp) * 100)));
    }

    getAttackDamage(characterClass: CharacterClassName): number {
        const baseDamage = characterClass === 'wizard' ? 20 : 25;
        return baseDamage + this.getRuntimeModifiers().attackDamageBonus;
    }

    getAttackRangeMultiplier(): number {
        return this.getRuntimeModifiers().attackRangeMultiplier;
    }

    getDamageTakenMultiplier(): number {
        return this.getRuntimeModifiers().damageTakenMultiplier;
    }

    async awardLevelCompletion(summary: LevelSessionSummary): Promise<LevelCompletionResult> {
        const gainedXp = this.computeXpGain(summary);
        const updated = { ...this.profile };

        updated.totalXp += gainedXp;
        updated.accountXp += gainedXp;

        let leveledUp = false;
        while (updated.accountXp >= updated.nextLevelXp) {
            leveledUp = true;
            updated.accountXp -= updated.nextLevelXp;
            updated.accountLevel += 1;
            updated.nextLevelXp = this.computeNextLevelXp(updated.accountLevel);
        }

        this.profile = updated;
        this.saveLocalProfile();
        await this.syncProfile();

        return {
            gainedXp,
            leveledUp,
            profile: this.profile,
            choices: leveledUp ? this.getUpgradeChoices() : []
        };
    }

    applyUpgrade(upgradeId: UpgradeId): ProgressionProfile {
        const updated = { ...this.profile, perkRanks: { ...this.profile.perkRanks } };
        updated.perkRanks[upgradeId] += 1;
        this.profile = updated;
        this.saveLocalProfile();
        void this.syncProfile();
        return this.profile;
    }

    applyProfileModifiersTo(controller: { applyProgressionModifiers?(modifiers: PlayerProgressionModifiers): void }): void {
        controller.applyProgressionModifiers?.(this.getRuntimeModifiers());
    }

    private computeXpGain(summary: LevelSessionSummary): number {
        const base = 90 + (summary.levelIndex + 1) * 20;
        const combat = summary.kills * 6 + Math.round(summary.damageDealt / 24);
        const utility = summary.chestsOpened * 8 + summary.potionsUsed * 2 + summary.arrowsShot + summary.spellsCast;
        const survival = Math.max(0, 20 - Math.round(summary.damageTaken / 10));
        return Math.max(40, Math.round(base + combat + utility + survival));
    }

    private computeNextLevelXp(level: number): number {
        return Math.round(120 * Math.pow(1.34, Math.max(0, level - 1)));
    }

    private async syncProfile(): Promise<void> {
        if (!this.authService.isLoggedIn || !this.authService.user) return;

        try {
            await setDoc(doc(db, 'users', this.authService.user.uid), {
                accountLevel: this.profile.accountLevel,
                accountXp: this.profile.accountXp,
                totalXp: this.profile.totalXp,
                nextLevelXp: this.profile.nextLevelXp,
                progressionPerks: this.profile.perkRanks,
                progressionUpdatedAt: serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.warn('[ProgressionService] Failed to sync progression profile:', error);
        }
    }

    private profileFromData(data: Record<string, unknown>): ProgressionProfile {
        const storedPerks = (data['progressionPerks'] || {}) as Record<string, number>;
        const perkRanks: Record<UpgradeId, number> = { ...DEFAULT_PERKS };
        for (const key of Object.keys(DEFAULT_PERKS) as UpgradeId[]) {
            perkRanks[key] = Number(storedPerks[key] || 0);
        }

        const accountLevel = Number(data['accountLevel'] || 1);
        const accountXp = Number(data['accountXp'] || 0);
        const totalXp = Number(data['totalXp'] || 0);
        return {
            accountLevel,
            accountXp,
            totalXp,
            nextLevelXp: Number(data['nextLevelXp'] || this.computeNextLevelXp(accountLevel)),
            perkRanks
        };
    }

    private loadLocalProfile(): void {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return;

            const parsed = JSON.parse(saved) as Record<string, unknown>;
            this.profile = this.profileFromData(parsed);
        } catch (error) {
            console.warn('[ProgressionService] Failed to load local profile:', error);
            this.profile = { ...DEFAULT_PROFILE, perkRanks: { ...DEFAULT_PERKS } };
        }
    }

    private saveLocalProfile(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
        } catch (error) {
            console.warn('[ProgressionService] Failed to save local profile:', error);
        }
    }
}