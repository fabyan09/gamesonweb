/**
 * Enemy Types Configuration
 * Defines all enemy types with their stats and models
 */

export type EnemyTypeName = 'vampire' | 'parasite' | 'mutant' | 'skeletonzombie' | 'warrok';

export interface EnemyTypeConfig {
    /** Display name */
    name: string;
    /** GLB model filename */
    modelFile: string;
    /** Base health points */
    health: number;
    /** Damage per attack */
    damage: number;
    /** Movement speed */
    moveSpeed: number;
    /** Attack range */
    attackRange: number;
    /** Detection range */
    detectionRange: number;
    /** Cooldown between attacks (ms) */
    attackCooldown: number;
    /** Model scale */
    scale: number;
    /** Health bar height offset */
    healthBarHeight: number;
    /** Health bar color (hex) */
    healthBarColor: string;
}

/**
 * Enemy type configurations ordered from weakest to strongest:
 * 1. Vampire (basic) - weakest
 * 2. Parasite - slightly stronger, more agile
 * 3. Mutant - medium strength
 * 4. SkeletonZombie - strong, slow
 * 5. Warrok - boss-like, very strong
 */
export const ENEMY_TYPES: Record<EnemyTypeName, EnemyTypeConfig> = {
    vampire: {
        name: 'Vampire',
        modelFile: 'Vampire A Lusth.glb',
        health: 50,
        damage: 10,
        moveSpeed: 0.04,
        attackRange: 2,
        detectionRange: 10,
        attackCooldown: 1500,
        scale: 1,
        healthBarHeight: 2.3,
        healthBarColor: '#8b0000'
    },
    parasite: {
        name: 'Parasite',
        modelFile: 'Parasite.glb',
        health: 75,
        damage: 15,
        moveSpeed: 0.055,
        attackRange: 1.8,
        detectionRange: 12,
        attackCooldown: 1200,
        scale: 1,
        healthBarHeight: 1.8,
        healthBarColor: '#4a0080'
    },
    mutant: {
        name: 'Mutant',
        modelFile: 'Mutant.glb',
        health: 100,
        damage: 20,
        moveSpeed: 0.045,
        attackRange: 2.2,
        detectionRange: 12,
        attackCooldown: 1400,
        scale: 1,
        healthBarHeight: 2.3,
        healthBarColor: '#006400'
    },
    skeletonzombie: {
        name: 'Skeleton Zombie',
        modelFile: 'SkeletonZombie.glb',
        health: 150,
        damage: 25,
        moveSpeed: 0.035,
        attackRange: 2.5,
        detectionRange: 14,
        attackCooldown: 1800,
        scale: 1,
        healthBarHeight: 2.5,
        healthBarColor: '#2f4f4f'
    },
    warrok: {
        name: 'Warrok',
        modelFile: 'Warrok.glb',
        health: 250,
        damage: 35,
        moveSpeed: 0.03,
        attackRange: 3,
        detectionRange: 16,
        attackCooldown: 2000,
        scale: 1.2,
        healthBarHeight: 2.8,
        healthBarColor: '#8b4513'
    }
};

/**
 * Get enemy type config by name
 * Returns vampire config as default if type not found
 */
export function getEnemyTypeConfig(typeName?: string): EnemyTypeConfig {
    if (!typeName) {
        return ENEMY_TYPES.vampire;
    }

    const normalizedName = typeName.toLowerCase().replace(/[\s_-]/g, '') as EnemyTypeName;
    return ENEMY_TYPES[normalizedName] || ENEMY_TYPES.vampire;
}

/**
 * Check if a type name is valid
 */
export function isValidEnemyType(typeName: string): typeName is EnemyTypeName {
    const normalizedName = typeName.toLowerCase().replace(/[\s_-]/g, '');
    return normalizedName in ENEMY_TYPES;
}
