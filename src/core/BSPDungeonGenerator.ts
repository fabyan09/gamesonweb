/**
 * BSP (Binary Space Partitioning) Dungeon Generator
 * Generates procedural dungeon levels compatible with the LevelData format
 */

import { LevelData, Vec3, PropPlacement, LightData, EnemySpawn, WallSegment, GridPlacement } from './LevelData';

interface Rectangle {
    x: number;
    z: number;
    width: number;
    height: number;
}

interface Room extends Rectangle {
    id: number;
}

interface Corridor {
    x1: number;
    z1: number;
    x2: number;
    z2: number;
}

class BSPNode {
    bounds: Rectangle;
    left: BSPNode | null = null;
    right: BSPNode | null = null;
    room: Room | null = null;

    constructor(x: number, z: number, width: number, height: number) {
        this.bounds = { x, z, width, height };
    }

    isLeaf(): boolean {
        return this.left === null && this.right === null;
    }
}

export interface BSPConfig {
    /** Total dungeon width in tiles */
    width: number;
    /** Total dungeon height in tiles */
    height: number;
    /** Minimum room size */
    minRoomSize: number;
    /** Maximum room size */
    maxRoomSize: number;
    /** Tile spacing (matches floor_A tile size) */
    tileSpacing: number;
    /** Number of enemies to spawn */
    enemyCount: number;
    /** Available enemy types */
    enemyTypes: string[];
    /** Random seed (optional, for reproducible levels) */
    seed?: number;
}

const DEFAULT_CONFIG: BSPConfig = {
    width: 25,      // Reduced from 40
    height: 25,     // Reduced from 40
    minRoomSize: 5,
    maxRoomSize: 10,
    tileSpacing: 2,
    enemyCount: 4,
    enemyTypes: ['vampire', 'parasite'],
};

export class BSPDungeonGenerator {
    private config: BSPConfig;
    private rooms: Room[] = [];
    private corridors: Corridor[] = [];
    private grid: boolean[][] = []; // true = floor, false = wall
    private roomIdCounter = 0;
    private random: () => number;

    constructor(config: Partial<BSPConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Seeded random for reproducibility
        if (this.config.seed !== undefined) {
            this.random = this.seededRandom(this.config.seed);
        } else {
            this.random = Math.random;
        }
    }

    private seededRandom(seed: number): () => number {
        let state = seed;
        return () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    }

    generate(): LevelData {
        const { width, height } = this.config;

        // Initialize grid as all walls
        this.grid = Array.from({ length: height }, () => Array(width).fill(false));
        this.rooms = [];
        this.corridors = [];
        this.roomIdCounter = 0;

        // Create BSP tree and split
        const root = new BSPNode(0, 0, width, height);
        this.split(root, 4); // 4 levels of splitting

        // Create rooms in leaf nodes
        this.createRooms(root);

        // Connect rooms with corridors
        this.createCorridors(root);

        // Convert to LevelData format
        return this.buildLevelData();
    }

    private split(node: BSPNode, depth: number): void {
        if (depth === 0) return;

        const { width, height } = node.bounds;
        const minSize = this.config.minRoomSize * 2;

        // Stop if too small to split
        if (width < minSize && height < minSize) return;

        // Decide split direction
        let splitHorizontal: boolean;
        if (width < minSize) {
            splitHorizontal = true;
        } else if (height < minSize) {
            splitHorizontal = false;
        } else {
            // Prefer splitting the longer dimension
            splitHorizontal = height > width ? true : (width > height ? false : this.random() > 0.5);
        }

        // Calculate split position (30-70% range)
        const splitRatio = 0.3 + this.random() * 0.4;

        if (splitHorizontal) {
            const splitZ = Math.floor(height * splitRatio);
            if (splitZ < this.config.minRoomSize || height - splitZ < this.config.minRoomSize) return;

            node.left = new BSPNode(node.bounds.x, node.bounds.z, width, splitZ);
            node.right = new BSPNode(node.bounds.x, node.bounds.z + splitZ, width, height - splitZ);
        } else {
            const splitX = Math.floor(width * splitRatio);
            if (splitX < this.config.minRoomSize || width - splitX < this.config.minRoomSize) return;

            node.left = new BSPNode(node.bounds.x, node.bounds.z, splitX, height);
            node.right = new BSPNode(node.bounds.x + splitX, node.bounds.z, width - splitX, height);
        }

        this.split(node.left, depth - 1);
        this.split(node.right, depth - 1);
    }

    private createRooms(node: BSPNode): void {
        if (node.isLeaf()) {
            // Create a room within this leaf's bounds
            const { x, z, width, height } = node.bounds;
            const padding = 1;

            const roomWidth = Math.min(
                this.config.maxRoomSize,
                Math.max(this.config.minRoomSize, Math.floor(width * (0.6 + this.random() * 0.3)))
            );
            const roomHeight = Math.min(
                this.config.maxRoomSize,
                Math.max(this.config.minRoomSize, Math.floor(height * (0.6 + this.random() * 0.3)))
            );

            const roomX = x + padding + Math.floor(this.random() * (width - roomWidth - padding * 2));
            const roomZ = z + padding + Math.floor(this.random() * (height - roomHeight - padding * 2));

            const room: Room = {
                id: this.roomIdCounter++,
                x: roomX,
                z: roomZ,
                width: roomWidth,
                height: roomHeight
            };

            node.room = room;
            this.rooms.push(room);

            // Carve room into grid
            for (let rz = roomZ; rz < roomZ + roomHeight; rz++) {
                for (let rx = roomX; rx < roomX + roomWidth; rx++) {
                    if (rz >= 0 && rz < this.config.height && rx >= 0 && rx < this.config.width) {
                        this.grid[rz][rx] = true;
                    }
                }
            }
        } else {
            if (node.left) this.createRooms(node.left);
            if (node.right) this.createRooms(node.right);
        }
    }

    private createCorridors(node: BSPNode): void {
        if (node.isLeaf()) return;

        if (node.left && node.right) {
            this.createCorridors(node.left);
            this.createCorridors(node.right);

            // Connect the two children
            const room1 = this.getRoom(node.left);
            const room2 = this.getRoom(node.right);

            if (room1 && room2) {
                this.connectRooms(room1, room2);
            }
        }
    }

    private getRoom(node: BSPNode): Room | null {
        if (node.room) return node.room;
        if (node.left) {
            const room = this.getRoom(node.left);
            if (room) return room;
        }
        if (node.right) {
            const room = this.getRoom(node.right);
            if (room) return room;
        }
        return null;
    }

    private connectRooms(room1: Room, room2: Room): void {
        // Get center points
        const x1 = Math.floor(room1.x + room1.width / 2);
        const z1 = Math.floor(room1.z + room1.height / 2);
        const x2 = Math.floor(room2.x + room2.width / 2);
        const z2 = Math.floor(room2.z + room2.height / 2);

        // Create L-shaped corridor
        if (this.random() > 0.5) {
            // Horizontal first, then vertical
            this.carveCorridor(x1, z1, x2, z1);
            this.carveCorridor(x2, z1, x2, z2);
        } else {
            // Vertical first, then horizontal
            this.carveCorridor(x1, z1, x1, z2);
            this.carveCorridor(x1, z2, x2, z2);
        }

        this.corridors.push({ x1, z1, x2, z2 });
    }

    private carveCorridor(x1: number, z1: number, x2: number, z2: number): void {
        const corridorWidth = 3; // Wider corridors for better coverage

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minZ = Math.min(z1, z2);
        const maxZ = Math.max(z1, z2);

        for (let z = minZ; z <= maxZ; z++) {
            for (let x = minX; x <= maxX; x++) {
                // Add corridor width in both directions
                for (let wz = -1; wz <= 1; wz++) {
                    for (let wx = -1; wx <= 1; wx++) {
                        const zz = z + wz;
                        const xx = x + wx;
                        if (zz >= 0 && zz < this.config.height && xx >= 0 && xx < this.config.width) {
                            this.grid[zz][xx] = true;
                        }
                    }
                }
            }
        }
    }

    private buildLevelData(): LevelData {
        const { tileSpacing } = this.config;

        // Calculate world bounds
        const halfWidth = (this.config.width * tileSpacing) / 2;
        const halfHeight = (this.config.height * tileSpacing) / 2;

        // Find spawn room (first room, usually bottom-left area)
        const spawnRoom = this.rooms[0];
        const spawnPos: Vec3 = {
            x: (spawnRoom.x + spawnRoom.width / 2) * tileSpacing - halfWidth,
            y: 0,
            z: (spawnRoom.z + spawnRoom.height / 2) * tileSpacing - halfHeight
        };

        // Build floor data - cover the entire play area with floor tiles
        const props: PropPlacement[] = [];
        const lights: LightData[] = [];
        const enemies: EnemySpawn[] = [];
        const floors: GridPlacement[] = []; // Empty - we use props for floors with alternation

        // Calculate actual bounds from the grid
        const bounds = this.calculateBounds(halfWidth, halfHeight);

        // Place floor tiles covering the entire area with alternating floor_A/floor_B
        const floorPadding = tileSpacing * 2;
        const startX = bounds.minX - floorPadding;
        const startZ = bounds.minZ - floorPadding;
        const endX = bounds.maxX + floorPadding;
        const endZ = bounds.maxZ + floorPadding;

        for (let z = startZ; z <= endZ; z += tileSpacing) {
            for (let x = startX; x <= endX; x += tileSpacing) {
                // Alternate between floor_A and floor_B in a checkerboard pattern
                const tileX = Math.floor((x - startX) / tileSpacing);
                const tileZ = Math.floor((z - startZ) / tileSpacing);
                const floorMesh = (tileX + tileZ) % 2 === 0 ? 'floor_A' : 'floor_B';

                props.push({
                    mesh: floorMesh,
                    position: { x, y: -1, z }
                });
            }
        }

        // Place walls around floor tiles
        const wallProps = this.generateWalls(halfWidth, halfHeight, tileSpacing);
        props.push(...wallProps);

        // Place pillars at room corners
        const pillarProps = this.generatePillars(halfWidth, halfHeight, tileSpacing);
        props.push(...pillarProps);

        // Place torches and lights in rooms
        const { torchProps, lightData } = this.generateLighting(halfWidth, halfHeight, tileSpacing);
        props.push(...torchProps);
        lights.push(...lightData);

        // Place decorative props
        const decorProps = this.generateDecorations(halfWidth, halfHeight, tileSpacing);
        props.push(...decorProps);

        // Spawn enemies in rooms (not in spawn room)
        const enemySpawns = this.generateEnemies(halfWidth, halfHeight, tileSpacing);
        enemies.push(...enemySpawns);

        // Create wall segments for collision (outer boundary - bounds already calculated above)
        const walls: WallSegment[] = [{
            mesh: 'wall_A',
            cornerMesh: 'wall_corner_A',
            bounds: {
                minX: bounds.minX,
                maxX: bounds.maxX,
                minZ: bounds.minZ,
                maxZ: bounds.maxZ
            },
            y: 0,
            spacing: tileSpacing
        }];

        return {
            name: `Donjon Procédural #${Math.floor(this.random() * 10000)}`,
            version: '1.0',
            playerSpawn: {
                position: spawnPos,
                rotation: 0
            },
            scene: {
                fogDensity: 0.035,  // Denser fog for performance (hides distant objects)
                fogColor: { x: 0.02, y: 0.02, z: 0.04 },
                ambientColor: { x: 0.1, y: 0.1, z: 0.15 }
            },
            floors,
            walls,
            props,
            lights,
            enemies,
            cameraBounds: {
                minX: bounds.minX - 2,
                maxX: bounds.maxX + 2,
                minZ: bounds.minZ - 2,
                maxZ: bounds.maxZ + 2,
                maxY: 8
            }
        };
    }

    private generateWalls(halfWidth: number, halfHeight: number, spacing: number): PropPlacement[] {
        const walls: PropPlacement[] = [];

        // For each floor tile, check if it needs walls on any side
        for (let z = 0; z < this.config.height; z++) {
            for (let x = 0; x < this.config.width; x++) {
                if (!this.grid[z][x]) continue;

                const worldX = x * spacing - halfWidth;
                const worldZ = z * spacing - halfHeight;

                // Check each direction for walls
                // North (z-1)
                if (z === 0 || !this.grid[z - 1][x]) {
                    walls.push({
                        mesh: 'wall_A',
                        position: { x: worldX, y: 0, z: worldZ - spacing / 2 },
                        rotation: 0,
                        collision: true
                    });
                    walls.push({
                        mesh: 'wall_B',
                        position: { x: worldX, y: 2, z: worldZ - spacing / 2 },
                        rotation: 0
                    });
                }

                // South (z+1)
                if (z === this.config.height - 1 || !this.grid[z + 1][x]) {
                    walls.push({
                        mesh: 'wall_A',
                        position: { x: worldX, y: 0, z: worldZ + spacing / 2 },
                        rotation: 180,
                        collision: true
                    });
                    walls.push({
                        mesh: 'wall_B',
                        position: { x: worldX, y: 2, z: worldZ + spacing / 2 },
                        rotation: 180
                    });
                }

                // West (x-1)
                if (x === 0 || !this.grid[z][x - 1]) {
                    walls.push({
                        mesh: 'wall_A',
                        position: { x: worldX - spacing / 2, y: 0, z: worldZ },
                        rotation: 90,
                        collision: true
                    });
                    walls.push({
                        mesh: 'wall_B',
                        position: { x: worldX - spacing / 2, y: 2, z: worldZ },
                        rotation: 90
                    });
                }

                // East (x+1)
                if (x === this.config.width - 1 || !this.grid[z][x + 1]) {
                    walls.push({
                        mesh: 'wall_A',
                        position: { x: worldX + spacing / 2, y: 0, z: worldZ },
                        rotation: -90,
                        collision: true
                    });
                    walls.push({
                        mesh: 'wall_B',
                        position: { x: worldX + spacing / 2, y: 2, z: worldZ },
                        rotation: -90
                    });
                }
            }
        }

        return walls;
    }

    private generatePillars(halfWidth: number, halfHeight: number, spacing: number): PropPlacement[] {
        const pillars: PropPlacement[] = [];

        for (const room of this.rooms) {
            // Place pillars at corners of larger rooms
            if (room.width >= 6 && room.height >= 6) {
                const cornerOffset = 1;
                const corners = [
                    { x: room.x + cornerOffset, z: room.z + cornerOffset },
                    { x: room.x + room.width - cornerOffset - 1, z: room.z + cornerOffset },
                    { x: room.x + cornerOffset, z: room.z + room.height - cornerOffset - 1 },
                    { x: room.x + room.width - cornerOffset - 1, z: room.z + room.height - cornerOffset - 1 }
                ];

                for (const corner of corners) {
                    const worldX = corner.x * spacing - halfWidth;
                    const worldZ = corner.z * spacing - halfHeight;

                    pillars.push({
                        mesh: 'pillar_big',
                        position: { x: worldX, y: 0, z: worldZ },
                        collision: true
                    });
                    pillars.push({
                        mesh: 'pillar_big',
                        position: { x: worldX, y: 2, z: worldZ }
                    });
                    pillars.push({
                        mesh: 'pillar_big',
                        position: { x: worldX, y: 4, z: worldZ }
                    });
                }
            }
        }

        return pillars;
    }

    private generateLighting(halfWidth: number, halfHeight: number, spacing: number): { torchProps: PropPlacement[], lightData: LightData[] } {
        const torchProps: PropPlacement[] = [];
        const lightData: LightData[] = [];

        for (const room of this.rooms) {
            const centerX = (room.x + room.width / 2) * spacing - halfWidth;
            const centerZ = (room.z + room.height / 2) * spacing - halfHeight;

            // Place a light at room center
            lightData.push({
                position: { x: centerX, y: 3, z: centerZ },
                color: { x: 1, y: 0.6, z: 0.2 },
                intensity: 1.2,
                range: 12
            });

            // Place torches on walls (2 per room on opposite walls)
            if (room.width >= 4) {
                // North wall torches
                torchProps.push({
                    mesh: 'torch',
                    position: {
                        x: centerX,
                        y: 3.5,
                        z: (room.z + 0.3) * spacing - halfHeight
                    },
                    rotation: 0
                });

                lightData.push({
                    position: {
                        x: centerX,
                        y: 4,
                        z: (room.z + 0.5) * spacing - halfHeight
                    },
                    color: { x: 1, y: 0.5, z: 0.1 },
                    intensity: 1,
                    range: 10
                });

                // South wall torches
                torchProps.push({
                    mesh: 'torch',
                    position: {
                        x: centerX,
                        y: 3.5,
                        z: (room.z + room.height - 0.3) * spacing - halfHeight
                    },
                    rotation: 180
                });

                lightData.push({
                    position: {
                        x: centerX,
                        y: 4,
                        z: (room.z + room.height - 0.5) * spacing - halfHeight
                    },
                    color: { x: 1, y: 0.5, z: 0.1 },
                    intensity: 1,
                    range: 10
                });
            }
        }

        return { torchProps, lightData };
    }

    private generateDecorations(halfWidth: number, halfHeight: number, spacing: number): PropPlacement[] {
        const decorations: PropPlacement[] = [];
        const decorMeshes = ['brazier_A', 'brazier_B', 'tomb_A', 'tomb_B', 'statue_A'];

        for (let i = 1; i < this.rooms.length; i++) { // Skip spawn room
            const room = this.rooms[i];

            // 50% chance for a decoration in each room
            if (this.random() > 0.5) {
                const mesh = decorMeshes[Math.floor(this.random() * decorMeshes.length)];
                const centerX = (room.x + room.width / 2) * spacing - halfWidth;
                const centerZ = (room.z + room.height / 2) * spacing - halfHeight;

                // Offset slightly from center
                const offsetX = (this.random() - 0.5) * spacing * 2;
                const offsetZ = (this.random() - 0.5) * spacing * 2;

                decorations.push({
                    mesh,
                    position: {
                        x: centerX + offsetX,
                        y: 0,
                        z: centerZ + offsetZ
                    },
                    rotation: Math.floor(this.random() * 4) * 90,
                    collision: true
                });
            }
        }

        return decorations;
    }

    private generateEnemies(halfWidth: number, halfHeight: number, spacing: number): EnemySpawn[] {
        const enemies: EnemySpawn[] = [];
        const { enemyCount, enemyTypes } = this.config;

        // Distribute enemies across rooms (not spawn room)
        const eligibleRooms = this.rooms.slice(1);
        if (eligibleRooms.length === 0) return enemies;

        for (let i = 0; i < enemyCount; i++) {
            const room = eligibleRooms[Math.floor(this.random() * eligibleRooms.length)];
            const type = enemyTypes[Math.floor(this.random() * enemyTypes.length)];

            // Random position within room (with padding)
            const padding = 1;
            const x = room.x + padding + this.random() * (room.width - padding * 2);
            const z = room.z + padding + this.random() * (room.height - padding * 2);

            enemies.push({
                type,
                position: {
                    x: x * spacing - halfWidth,
                    y: 0,
                    z: z * spacing - halfHeight
                },
                rotation: Math.floor(this.random() * 360)
            });
        }

        return enemies;
    }

    private calculateBounds(halfWidth: number, halfHeight: number): { minX: number, maxX: number, minZ: number, maxZ: number } {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (let z = 0; z < this.config.height; z++) {
            for (let x = 0; x < this.config.width; x++) {
                if (this.grid[z][x]) {
                    const worldX = x * this.config.tileSpacing - halfWidth;
                    const worldZ = z * this.config.tileSpacing - halfHeight;
                    minX = Math.min(minX, worldX);
                    maxX = Math.max(maxX, worldX);
                    minZ = Math.min(minZ, worldZ);
                    maxZ = Math.max(maxZ, worldZ);
                }
            }
        }

        return { minX, maxX, minZ, maxZ };
    }

    /** Get the rooms for debugging/visualization */
    getRooms(): Room[] {
        return [...this.rooms];
    }

    /** Get the grid for debugging/visualization */
    getGrid(): boolean[][] {
        return this.grid.map(row => [...row]);
    }
}
