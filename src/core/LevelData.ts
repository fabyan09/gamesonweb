/**
 * Level Data Types for JSON-based level definitions
 */

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface PropPlacement {
    /** Mesh name from the asset set */
    mesh: string;
    /** Position in world coordinates */
    position: Vec3;
    /** Y-axis rotation in degrees (0-360) */
    rotation?: number;
    /** Uniform scale factor */
    scale?: number;
}

export interface GridPlacement {
    /** Mesh name for the grid tiles */
    mesh: string;
    /** Starting position */
    start: Vec3;
    /** Number of tiles on X axis */
    countX: number;
    /** Number of tiles on Z axis */
    countZ: number;
    /** Spacing between tiles */
    spacing: number;
}

export interface WallSegment {
    /** Wall mesh name */
    mesh: string;
    /** Corner mesh name */
    cornerMesh?: string;
    /** Wall boundaries */
    bounds: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    };
    /** Y position */
    y: number;
    /** Spacing between wall segments */
    spacing: number;
}

export interface LightData {
    /** Light position */
    position: Vec3;
    /** Light color (RGB 0-1) */
    color?: Vec3;
    /** Light intensity */
    intensity?: number;
    /** Light range */
    range?: number;
}

export interface EnemySpawn {
    /** Enemy type (for future extension) */
    type?: string;
    /** Spawn position */
    position: Vec3;
    /** Initial Y rotation in degrees */
    rotation?: number;
    /** Enemy health */
    health?: number;
    /** Enemy damage per hit */
    damage?: number;
}

export interface PlayerSpawn {
    /** Spawn position */
    position: Vec3;
    /** Initial Y rotation in degrees */
    rotation?: number;
}

export interface LevelData {
    /** Level metadata */
    name: string;
    version: string;

    /** Player spawn point */
    playerSpawn: PlayerSpawn;

    /** Floor/ground grids */
    floors: GridPlacement[];

    /** Wall definitions */
    walls: WallSegment[];

    /** Individual prop placements */
    props: PropPlacement[];

    /** Dynamic lights (PointLights) - keep under 8 for GPU */
    lights: LightData[];

    /** Enemy spawns */
    enemies?: EnemySpawn[];

    /** Scene settings */
    scene?: {
        fogDensity?: number;
        fogColor?: Vec3;
        ambientColor?: Vec3;
    };
}
