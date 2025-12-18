import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ThirdPersonCamera } from './ThirdPersonCamera';

export type CharacterClassName = 'knight' | 'archer';

export interface CharacterController {
    // Properties
    readonly position: Vector3;
    readonly rootMesh: TransformNode | null;
    readonly isCurrentlyBlocking: boolean;
    readonly isPlayerDead: boolean;
    readonly crouching: boolean;

    // Methods
    load(basePath: string): Promise<void>;
    setCamera(camera: ThirdPersonCamera): void;
    onAttackHit(callback: (position: Vector3, range: number) => void): void;
    onMouseDown(button: number): void;
    onMouseUp(button: number): void;
    playDeath(): Promise<void>;
    dispose(): void;
}

export interface CharacterClassInfo {
    id: CharacterClassName;
    name: string;
    description: string;
    icon: string;
}

export const CHARACTER_CLASSES: CharacterClassInfo[] = [
    {
        id: 'knight',
        name: 'Chevalier',
        description: 'Un guerrier robuste avec une épée et un bouclier. Excellent en defense et au corps a corps.',
        icon: 'sword-shield'
    },
    {
        id: 'archer',
        name: 'Archère',
        description: 'Une combattante agile équipée d\'un arc. Précise et mortelle à distance.',
        icon: 'bow-arrow'
    }
];
