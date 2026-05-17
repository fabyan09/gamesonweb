import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from './FirebaseConfig';
import { AuthService } from './AuthService';
import { LevelSessionSummary } from './ProgressionService';

type EnemyType = 'vampire' | 'parasite' | 'mutant' | 'skeletonzombie' | 'warrok';

export class StatsService {
    private static instance: StatsService;
    private authService: AuthService;

    // In-memory session accumulators
    private sessionKills = 0;
    private sessionKillsByType: Record<string, number> = {};
    private sessionDamageDealt = 0;
    private sessionDamageTaken = 0;
    private sessionPotionsUsed = 0;
    private sessionArrowsShot = 0;
    private sessionSpellsCast = 0;
    private sessionChestsOpened = 0;
    private sessionStartTime = 0;
    private currentClass: string = 'knight';
    private currentLevel: number = 0;

    private constructor() {
        this.authService = AuthService.getInstance();
    }

    static getInstance(): StatsService {
        if (!StatsService.instance) {
            StatsService.instance = new StatsService();
        }
        return StatsService.instance;
    }

    /** Call at the start of each level */
    startSession(characterClass: string, levelIndex: number): void {
        this.sessionKills = 0;
        this.sessionKillsByType = {};
        this.sessionDamageDealt = 0;
        this.sessionDamageTaken = 0;
        this.sessionPotionsUsed = 0;
        this.sessionArrowsShot = 0;
        this.sessionSpellsCast = 0;
        this.sessionChestsOpened = 0;
        this.sessionStartTime = Date.now();
        this.currentClass = characterClass;
        this.currentLevel = levelIndex;
    }

    recordKill(type: string): void {
        this.sessionKills++;
        const key = type.toLowerCase().replace(/[\s_-]/g, '');
        this.sessionKillsByType[key] = (this.sessionKillsByType[key] || 0) + 1;
    }

    recordDamageDealt(amount: number): void {
        this.sessionDamageDealt += amount;
    }

    recordDamageTaken(amount: number): void {
        this.sessionDamageTaken += amount;
    }

    recordPotionUsed(): void {
        this.sessionPotionsUsed++;
    }

    recordArrowShot(): void {
        this.sessionArrowsShot++;
    }

    recordSpellCast(): void {
        this.sessionSpellsCast++;
    }

    recordChestOpened(): void {
        this.sessionChestsOpened++;
    }

    getSessionSummary(): LevelSessionSummary {
        return {
            levelIndex: this.currentLevel,
            kills: this.sessionKills,
            damageDealt: this.sessionDamageDealt,
            damageTaken: this.sessionDamageTaken,
            potionsUsed: this.sessionPotionsUsed,
            arrowsShot: this.sessionArrowsShot,
            spellsCast: this.sessionSpellsCast,
            chestsOpened: this.sessionChestsOpened,
            playtimeMs: Date.now() - this.sessionStartTime
        };
    }

    /** Flush stats to Firestore on level complete */
    async flushOnLevelComplete(): Promise<void> {
        await this.flush(true);
    }

    /** Flush stats to Firestore on death */
    async flushOnDeath(): Promise<void> {
        await this.flush(false);
    }

    private async flush(victory: boolean): Promise<void> {
        if (!this.authService.isLoggedIn || !this.authService.user) return;

        const uid = this.authService.user.uid;
        const elapsed = Date.now() - this.sessionStartTime;

        const updates: Record<string, unknown> = {
            lastPlayedAt: serverTimestamp(),
            totalKills: increment(this.sessionKills),
            totalDamageDealt: increment(this.sessionDamageDealt),
            totalDamageTaken: increment(this.sessionDamageTaken),
            totalPotionsUsed: increment(this.sessionPotionsUsed),
            totalArrowsShot: increment(this.sessionArrowsShot),
            totalSpellsCast: increment(this.sessionSpellsCast),
            totalChestsOpened: increment(this.sessionChestsOpened),
            totalPlaytimeMs: increment(elapsed),
            [`classUsage.${this.currentClass}`]: increment(1)
        };

        // Increment kill-by-type fields
        for (const [type, count] of Object.entries(this.sessionKillsByType)) {
            updates[`killsByType.${type}`] = increment(count);
        }

        if (victory) {
            updates['totalLevelsCompleted'] = increment(1);
        } else {
            updates['totalDeaths'] = increment(1);
        }

        try {
            await updateDoc(doc(db, 'users', uid), updates);
        } catch (err) {
            console.warn('[StatsService] Failed to flush stats:', err);
        }
    }
}
