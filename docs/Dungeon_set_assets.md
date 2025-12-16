# Dungeon Set - Assets Documentation

> Fichier source : `public/assets/Dungeon_set/Dungeon_set.glb` (36.7 MB)
> Généré avec Blender glTF Exporter v3.6.28

---

## Textures

### Diffuse Maps (_D)

| Nom | Matériau | Meshes | Résolution |
|-----|----------|--------|------------|
| Dungeon_set_D | Dungeon set | 78 meshes | 4096x4096 |
| Dungeon_set2_D | Dungeon_set2 | 43 meshes | 2048x2048 |
| Wall_A_D | wall_down | 19 meshes | 1024x1024 |
| Wall_B_D | wall_upper | 6 meshes | 1024x1024 |
| Floor_A_D | floor | 7 meshes | 1024x1024 |
| Floor_B_D | floor2 | 1 mesh | 1024x1024 |
| Floor_C_D | floor3 | 1 mesh | 1024x1024 |

### Normal Maps (_N)

| Nom | Matériau | Meshes | Résolution |
|-----|----------|--------|------------|
| Wall_A_N | wall_down | 25 meshes | 1024x1024 |
| Floor_A_N | floor | 7 meshes | 1024x1024 |
| Floor_C_N | floor3 | 1 mesh | 1024x1024 |

---

## Matériaux (7)

| Nom | Type | Metallic | Double Sided |
|-----|------|----------|--------------|
| Dungeon set | PBR | 0 | ✓ |
| Dungeon_set2 | PBR | 0 | ✓ |
| wall_down | PBR + Normal | 0 | ✓ |
| wall_upper | PBR + Normal | 0 | ✓ |
| floor | PBR + Normal | 0 | ✓ |
| floor2 | PBR + Normal | 0 | ✓ |
| floor3 | PBR + Normal | 0 | ✓ |

**Extensions utilisées :**
- `KHR_materials_specular`
- `KHR_materials_ior` (IOR: 1.45)

---

## Nodes / Objets (120+)

### Structures en bois

| Nom | Description |
|-----|-------------|
| wooden_steps | Escalier en bois |
| wood_structure_A à I | Structures de support en bois (9 variantes) |
| wood_planks | Planches de bois |
| plank_A à G | Planches individuelles |
| plank_large_A/B/C | Grandes planches |
| log_short_A/B/C | Petites bûches |
| log_large_A/B/C | Grandes bûches |

### Murs

| Nom | Description |
|-----|-------------|
| wall_A, wall_B | Murs standards |
| wall_with_decor_A/B | Murs avec décorations |
| wall_ruined_A/B/C/D | Murs en ruines |
| wall_corner_A/B | Coins de murs |
| wall_decor_A/B | Décorations murales |
| upper_wall | Mur supérieur |
| upper_wall_corner | Coin mur supérieur |
| upper_wall_ruined_A/B/C/D | Murs supérieurs en ruines |

### Sols

| Nom | Description |
|-----|-------------|
| floor_A/B/C | Dalles de sol |
| floor_border_middle_A/B/C/D | Bordures de sol (milieu) |
| floor_border_corner_A/B | Bordures de sol (coins) |
| curb_middle_A/B | Bordures centrales |
| curb_corner_A/B | Bordures d'angle |

### Piliers

| Nom | Description |
|-----|-------------|
| pillar_thin_A/B/C | Piliers fins |
| pillar_medium | Pilier moyen |
| pillar_medium_broken_A/B | Piliers moyens cassés |
| pillar_big | Grand pilier |
| pillar_big_B/C/D | Grands piliers (variantes) |

### Props & Décorations

| Nom | Description |
|-----|-------------|
| torch | Torche |
| brazier_A/B | Braseros |
| fountain | Fontaine |
| statue_A/B/C | Statues |
| gargolyle_A/B/C/D | Gargouilles |
| tomb_A/B/C | Tombes |
| rubble | Décombres |
| hanging_cage_A/B | Cages suspendues |
| fence_A/B/C/D | Clôtures |

### Portes & Cadres

| Nom | Description |
|-----|-------------|
| door_framebig_A/B | Grands cadres de porte |
| door_bigleft, door_bigright | Grandes portes (gauche/droite) |
| door_framesmall_A/B | Petits cadres de porte |
| door_smallmetal | Petite porte métallique |
| door_smallwood | Petite porte en bois |

### Égouts (Sewers)

| Nom | Description |
|-----|-------------|
| sewer_A/B/C | Sections d'égout |
| sewer_wall_A/B/C | Murs d'égout |
| sewer_bigframe | Grand cadre d'égout |
| sewers_door_left/right | Portes d'égout |

### Cellules (Prison)

| Nom | Description |
|-----|-------------|
| cell_middle | Section centrale de cellule |
| cell_door | Porte de cellule |
| cell_corner | Coin de cellule |

### Éléments interactifs

| Nom | Description |
|-----|-------------|
| lever | Levier |
| lever_base | Base du levier |
| chain_switch | Interrupteur à chaîne |
| chain_switch_pull | Chaîne à tirer |
| spiketrap | Piège à piques |
| spiketrap_base | Base du piège |
| spikes_door | Porte à piques |
| spikes_doorbase | Base porte à piques |

### Divers

| Nom | Description |
|-----|-------------|
| steps, steps2 | Marches |
| base | Base/socle |

---

## Hiérarchie Parent-Enfant

Certains objets ont des relations parent-enfant pour les animations/interactions :

```
spiketrap_base
  └── spiketrap

spikes_doorbase
  └── spikes_door

lever_base
  └── lever

chain_switch
  └── chain_switch_pull

sewer_bigframe
  ├── sewers_door_left
  └── sewers_door_right

door_framebig_A
  ├── door_bigleft
  └── door_bigright

door_framesmall_A
  └── door_smallwood

door_framesmall_B
  └── door_smallmetal
```

---

## Notes d'utilisation

- Tous les meshes utilisent une rotation de base `[0.707, 0, 0, 0.707]` (90° sur X) pour certains éléments
- Les échelles varient selon les objets (ex: fence à 1.28, pillar_medium à 1.43)
- Les positions sont en unités Blender, adaptées pour un niveau de donjon cohérent
