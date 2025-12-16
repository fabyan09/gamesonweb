# Système de Collisions

## Architecture

Le système de collision utilise des **colliders invisibles** séparés des meshes visuels. Cette approche évite les problèmes de géométries complexes et garantit des collisions stables.

```
Mesh visuel (wall_A, pillar_big, etc.)  →  Affichage uniquement
Collider invisible (Box, Cylinder)       →  Détection des collisions
```

## Fichiers modifiés

| Fichier | Rôle |
|---------|------|
| `src/scenes/DungeonScene.ts` | Active les collisions sur la scène |
| `src/core/LevelLoader.ts` | Crée les colliders pour murs et props |
| `src/core/PlayerController.ts` | Gère le collider du joueur |
| `src/core/LevelData.ts` | Définit le champ `collision` pour les props |
| `src/utils/MeshPlacer.ts` | Place les meshes visuels (sans collision) |
| `public/levels/level1.json` | Déclare quels props ont des collisions |

## Configuration de la scène

```typescript
// DungeonScene.ts
this.scene.collisionsEnabled = true;
this.scene.gravity = new Vector3(0, -0.5, 0);
```

## Colliders des murs

4 grandes boîtes invisibles entourent le niveau :

```typescript
// LevelLoader.ts - createWallColliders()
const wallHeight = 6;
const wallThickness = 1;

// Nord, Sud, Est, Ouest
MeshBuilder.CreateBox('collider_north', {
    width: maxX - minX + wallThickness,
    height: wallHeight,
    depth: wallThickness
}, this.scene);
```

## Colliders des props

Chaque type de prop a un collider adapté :

| Prop | Type | Dimensions |
|------|------|------------|
| `pillar_big` | Cylindre | diamètre 1.8, hauteur 6 |
| `fountain` | Boîte | 3 x 2 x 3 |
| `statue_A` | Boîte | 1.5 x 4 x 1.5 |
| `tomb_A/B` | Boîte | 2 x 1.5 x 3 |
| `brazier_A/B` | Cylindre | diamètre 1, hauteur 1.5 |
| `door_framebig_A` | 2 Boîtes | 0.8 x 4 x 0.8 (côtés) |

### Activer les collisions sur un prop

Dans `level1.json` :

```json
{ "mesh": "pillar_big", "position": { "x": 0, "y": 0, "z": 0 }, "collision": true }
```

## Collider du joueur

```typescript
// PlayerController.ts
this.colliderMesh = MeshBuilder.CreateBox('playerCollider', {
    width: 0.1, height: 0.1, depth: 0.1
}, this.scene);

// L'ellipsoid définit le volume de collision réel
this.colliderMesh.ellipsoid = new Vector3(0.4, 0.9, 0.4);
this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
```

## Collider des ennemis

```typescript
// Enemy.ts
this.colliderMesh = MeshBuilder.CreateBox('enemyCollider', {
    width: 0.1, height: 0.1, depth: 0.1
}, this.scene);

this.colliderMesh.ellipsoid = new Vector3(0.5, 0.9, 0.5);
this.colliderMesh.ellipsoidOffset = new Vector3(0, 0.9, 0);
```

Les ennemis utilisent aussi `moveWithCollisions` pour se déplacer, ils ne traversent donc plus les murs et obstacles.

### Mouvement avec collision

```typescript
// Calcul de la vélocité
const velocity = new Vector3(
    Math.sin(moveAngle) * speed,
    0,
    Math.cos(moveAngle) * speed
);

// Déplacement avec détection de collision
this.colliderMesh.moveWithCollisions(velocity);

// Synchronisation du personnage
this.rootNode.position.x = this.colliderMesh.position.x;
this.rootNode.position.z = this.colliderMesh.position.z;
```

## Ajouter un nouveau type de prop avec collision

1. Ajouter le cas dans `LevelLoader.createPropCollider()` :

```typescript
} else if (prop.mesh.includes('nouveau_prop')) {
    collider = MeshBuilder.CreateBox(`collider_${prop.mesh}_${this.colliders.length}`, {
        width: 2,
        height: 3,
        depth: 2
    }, this.scene);
    collider.position = pos.add(new Vector3(0, 1.5, 0));
}
```

2. Ajouter `"collision": true` dans le JSON du niveau.

## Debug

Pour visualiser les colliders, modifier temporairement :

```typescript
collider.isVisible = true;
collider.material = new StandardMaterial('debug', this.scene);
collider.material.wireframe = true;
```
