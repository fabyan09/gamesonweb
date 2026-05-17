import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged,
    updateProfile,
    User
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './FirebaseConfig';

export class AuthService {
    private static instance: AuthService;
    private _user: User | null = null;
    private _ready: Promise<void>;
    private listeners: Array<(user: User | null) => void> = [];

    private constructor() {
        this._ready = new Promise((resolve) => {
            onAuthStateChanged(auth, (user) => {
                this._user = user;
                this.listeners.forEach(fn => fn(user));
                resolve();
            });
        });
    }

    static getInstance(): AuthService {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }

    get user(): User | null { return this._user; }
    get isLoggedIn(): boolean { return this._user !== null; }
    get ready(): Promise<void> { return this._ready; }

    onAuthChange(fn: (user: User | null) => void): void {
        this.listeners.push(fn);
    }

    async signup(email: string, password: string, displayName: string): Promise<void> {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName });
        // Create user document in Firestore
        await setDoc(doc(db, 'users', cred.user.uid), {
            displayName,
            email,
            createdAt: serverTimestamp(),
            lastPlayedAt: null,
            accountLevel: 1,
            accountXp: 0,
            totalXp: 0,
            nextLevelXp: 120,
            progressionPerks: { strength: 0, vitality: 0, endurance: 0, haste: 0, defense: 0, precision: 0, recovery: 0 },
            totalKills: 0,
            killsByType: { vampire: 0, parasite: 0, mutant: 0, skeletonzombie: 0, warrok: 0 },
            totalDeaths: 0,
            totalLevelsCompleted: 0,
            totalDamageTaken: 0,
            totalDamageDealt: 0,
            totalPotionsUsed: 0,
            totalArrowsShot: 0,
            totalSpellsCast: 0,
            totalChestsOpened: 0,
            totalPlaytimeMs: 0,
            classUsage: { knight: 0, archer: 0, wizard: 0 },
            bestLevel: 0,
            fastestLevelMs: 0,
            mostKillsInLevel: 0
        });
    }

    async login(email: string, password: string): Promise<void> {
        await signInWithEmailAndPassword(auth, email, password);
    }

    async loginWithGoogle(): Promise<void> {
        const provider = new GoogleAuthProvider();
        const cred = await signInWithPopup(auth, provider);
        // Create user doc if first time
        const docRef = doc(db, 'users', cred.user.uid);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
            await setDoc(docRef, {
                displayName: cred.user.displayName || 'Aventurier',
                email: cred.user.email,
                createdAt: serverTimestamp(),
                lastPlayedAt: null,
                accountLevel: 1,
                accountXp: 0,
                totalXp: 0,
                nextLevelXp: 120,
                progressionPerks: { strength: 0, vitality: 0, endurance: 0, haste: 0, defense: 0, precision: 0, recovery: 0 },
                totalKills: 0,
                killsByType: { vampire: 0, parasite: 0, mutant: 0, skeletonzombie: 0, warrok: 0 },
                totalDeaths: 0,
                totalLevelsCompleted: 0,
                totalDamageTaken: 0,
                totalDamageDealt: 0,
                totalPotionsUsed: 0,
                totalArrowsShot: 0,
                totalSpellsCast: 0,
                totalChestsOpened: 0,
                totalPlaytimeMs: 0,
                classUsage: { knight: 0, archer: 0, wizard: 0 },
                bestLevel: 0,
                fastestLevelMs: 0,
                mostKillsInLevel: 0
            });
        }
    }

    async logout(): Promise<void> {
        await signOut(auth);
    }

    /** Fetch the current user's stats document */
    async getStats(): Promise<Record<string, unknown> | null> {
        if (!this._user) return null;
        const snap = await getDoc(doc(db, 'users', this._user.uid));
        return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
    }
}
