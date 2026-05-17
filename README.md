# 🏰 Oblivion's Crypt

> **Games On Web 2026 — Thème : IA** - Un jeu d'action-aventure 3D immersif développé avec Babylon.js

[![Babylon.js](https://img.shields.io/badge/Babylon.js-8.41.2-red?style=for-the-badge&logo=babylon.js)](https://www.babylonjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple?style=for-the-badge&logo=vite)](https://vitejs.dev/)

---

## 🎮 À Propos du Jeu

Plongez dans les profondeurs des Cryptes de l'Oubli, peuplées de créatures terrifiantes. Choisissez votre classe de personnage, explorez des niveaux générés procéduralement, combattez des ennemis redoutables et découvrez les secrets cachés dans les tombeaux ancestraux.

Mais vous n'êtes pas seul. **L'Esprit du Donjon** — une conscience ancienne née de la magie noire du Roi Maudit Aldric — habite chaque pierre, chaque ombre. Cette intelligence artificielle observe vos moindres mouvements, commente vos actions en temps réel, vous avertit des dangers... ou se moque de vos échecs. Ni allié, ni ennemi : le donjon joue son propre jeu.

### ✨ Caractéristiques Principales

| Fonctionnalité | Description |
|----------------|-------------|
| 🗡️ **3 Classes Jouables** | Chevalier (mêlée), Archer (distance) et Sorcier (magie) |
| 🧠 **Compagnon IA** | L'Esprit du Donjon — IA consciente qui observe et parle au joueur en temps réel (600+ dialogues, 30 types de triggers) |
| 👹 **5 Types d'Ennemis** | Vampire, Parasite, Mutant, Skeleton Zombie, Warrok (Boss) |
| 🏗️ **Génération Procédurale** | Cryptes uniques à chaque partie (algorithme BSP) |
| 🎒 **Système d'Inventaire** | Potions de soin et flèches à collecter |
| 🚪 **Portes Interactives** | Système de kick pour ouvrir les portes |
| 🎵 **Design Audio Immersif** | Musique d'ambiance et effets sonores spatialisés |
| 🎮 **Support Manette** | Compatible Xbox, PlayStation et manettes génériques |
| ⚙️ **Contrôles Personnalisables** | Remappez toutes les touches selon vos préférences |

---

## 🎯 Comment Jouer

### Installation

```bash
# Cloner le repository
git clone https://github.com/votre-repo/gamesonweb.git
cd gamesonweb

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
```

Le jeu sera accessible sur `http://localhost:3000`

### Commandes

```bash
npm run dev      # Serveur de développement (hot reload)
npm run build    # Build de production
npm run preview  # Prévisualiser le build
```

---

## 🕹️ Contrôles

### Clavier & Souris

| Action | Touche |
|--------|--------|
| **Déplacement** | Z Q S D (ou W A S D) |
| **Courir** | Shift |
| **Sauter** | Espace |
| **S'accroupir** | Ctrl |
| **Attaquer** | Clic Gauche |
| **Bloquer / Viser** | Clic Droit |
| **Interagir** | F |
| **Utiliser Potion** | 1, 2, 3, 4 |
| **Pause** | P |

### Manette (Xbox / PlayStation)

| Action | Bouton |
|--------|--------|
| **Déplacement** | Stick Gauche |
| **Caméra** | Stick Droit |
| **Courir** | L3 (Stick Gauche enfoncé) |
| **Sauter** | A / X |
| **S'accroupir** | B / Cercle |
| **Attaquer** | RT / R2 |
| **Bloquer / Viser** | LT / L2 |
| **Interagir** | Y / Triangle |
| **Potion** | X / Carré |
| **Pause** | Start |

---

## ⚔️ Classes de Personnages

### 🛡️ Chevalier

Le guerrier polyvalent, maître du combat rapproché.

| Statistique | Valeur |
|-------------|--------|
| **Vitesse (Marche)** | 0.08 |
| **Vitesse (Course)** | 0.15 |
| **Portée d'Attaque** | 2.5 unités |
| **Réduction de Dégâts (Blocage)** | 70% |
| **Capacité Spéciale** | Attaques accroupies, Coup de pied |

**Style de jeu :** Approchez-vous de vos ennemis, bloquez leurs attaques avec votre bouclier et frappez au moment opportun. Utilisez le coup de pied pour repousser les ennemis ou ouvrir les portes.

### 🏹 Archer

Le tireur d'élite, spécialiste du combat à distance.

| Statistique | Valeur |
|-------------|--------|
| **Vitesse (Marche)** | 0.06 |
| **Vitesse (Course)** | 0.12 |
| **Munitions** | 5-10 flèches |
| **Réduction de Dégâts (Blocage)** | 50% |
| **Capacité Spéciale** | Tir à trajectoire, Esquive |

**Style de jeu :** Gardez vos distances et éliminez les ennemis avant qu'ils ne vous atteignent. Attention : les ennemis touchés par vos flèches deviennent enragés et accélèrent !

---

## 👹 Bestiaire

| Ennemi | PV | Dégâts | Détection | Vitesse | Difficulté |
|--------|---:|-------:|----------:|--------:|:----------:|
| 🧛 **Vampire** | 50 | 10 | 10 | 0.02 | ⭐ |
| 🦠 **Parasite** | 75 | 15 | 12 | 0.025 | ⭐⭐ |
| 🧟 **Mutant** | 100 | 20 | 14 | 0.03 | ⭐⭐⭐ |
| 💀 **Skeleton Zombie** | 150 | 25 | 15 | 0.025 | ⭐⭐⭐⭐ |
| 👹 **Warrok (Boss)** | 250 | 35 | 16 | 0.035 | ⭐⭐⭐⭐⭐ |

### Comportement de l'IA

Les ennemis suivent une machine à états :

```
😴 IDLE → 👀 CHASING → ⚔️ ATTACKING → 💀 DEAD
                ↓
           🎉 CELEBRATING (si victoire)
```

**Système d'Enrage :** Lorsqu'un ennemi est touché par une attaque à distance (flèche), il entre en rage pendant 10 secondes avec une vitesse x1.8 !

---

## 🧠 L'Esprit du Donjon — Compagnon IA

Le coeur du thème **IA** du concours Games On Web 2026. Le donjon lui-même est une entité consciente qui interagit avec le joueur.

### Concept Narratif

La magie noire du Roi Maudit Aldric a eu un effet imprévu : au fil des siècles, les cryptes ont développé une **conscience propre** — une intelligence née de la souffrance des âmes piégées entre les pierres. L'Esprit du Donjon pense, observe, se souvient de chaque aventurier, et parle au joueur tout au long de la partie.

**Personnalité :** Ambigu, sarcastique, fasciné par le joueur. Parfois aide, parfois se moque. Ni allié, ni ennemi.

### Système Technique

| Composant | Description |
|-----------|-------------|
| **CompanionDialogues** | 600+ lignes de dialogue, 20+ variations par trigger, 30 types d'events |
| **CompanionAI** | Cerveau IA avec cooldowns, queue de messages prioritaire, détection d'inactivité, tracking de multi-kills, surveillance HP/inventaire |
| **CompanionEntity** | Orbe spectrale 3D (particules additives), orbite autour du joueur avec lerp et bobbing |
| **CompanionUI** | Overlay 2D fixe en haut d'écran (style sous-titre), effet de typing avec curseur |

### Triggers de Dialogue

L'Esprit réagit en temps réel a 30 types d'events de jeu :

- **Combat :** ennemi repéré, combat lancé, ennemi tué, boss repéré/tué, enrage, multi-kill, encerclement
- **Santé :** dégâts reçus, vie basse, vie critique, bloc réussi, mort, potion utilisée, vie pleine
- **Exploration :** entrée de salle, coffre ouvert, porte ouverte, sortie déscellée, piège, accroupi
- **Inventaire :** potion ramassée, flèches ramassées, plus de potions, plus de flèches
- **Progression :** début de niveau, victoire, inactivité du joueur

### Lore Intégré

L'Esprit est référencé dans toute l'interface du jeu :
- **Ecran d'accueil** — introduction de la conscience ancienne
- **Menu principal** — texte animé *"Le donjon est vivant. Il vous attend."*
- **Ecran de chargement** — *"L'Esprit du Donjon prépare votre accueil..."*
- **Tips de chargement** — 10 phrases lore dédiées à l'Esprit
- **Panneau Règles & Histoire** — backstory complète de l'origine de l'Esprit
- **Menu pause** — citation aléatoire de l'Esprit (15 phrases)

---

## 🗺️ Système de Niveaux

### Niveaux Prédéfinis

Les niveaux sont définis en JSON dans `/public/levels/` :
- `level1.json` - Tutoriel et introduction
- `level2.json` - Difficulté intermédiaire


## 🩸 Stamina (nouveau)

Un système de stamina a été ajouté pour limiter certaines actions physiques et encourager la gestion des ressources en combat.

- Valeurs par défaut: `max = 100`, `regen = 8/s`.
- Drain: course (15/s), blocage (10/s).
- Coûts: attaque Chevalier = 20, tir Archer = 12, sort Sorcier = 25.

Comportement: si la stamina est insuffisante l'action correspondante est bloquée; la stamina se régénère automatiquement lorsque le joueur ne court pas et ne bloque pas.

Fichiers principaux:
- `src/entities/PlayerController.ts` (Chevalier)
- `src/entities/ArcherController.ts` (Archère)
- `src/entities/WizardController.ts` (Sorcier)
- `src/scenes/DungeonScene.ts` (barre de stamina UI)

Ces valeurs sont codées en dur pour l'instant — je peux les exposer via `GameSettings` si tu veux pouvoir les régler depuis l'UI.

### Génération Procédurale (BSP)

Le mode "Niveau Aléatoire" utilise l'algorithme **Binary Space Partitioning** pour créer des cryptes uniques :

1. L'espace est divisé récursivement en zones
2. Des salles sont créées dans chaque zone
3. Des couloirs connectent les salles adjacentes
4. Les ennemis et objets sont placés aléatoirement

---

## 🧪 Système d'Objets

### Potions de Soin

| Potion | Soin | Couleur | Rareté |
|--------|-----:|:-------:|:------:|
| **Potion I** | 20 PV | 🟠 Orange | Commune (40%) |
| **Potion II** | 35 PV | 🔵 Bleu | Peu commune (30%) |
| **Potion III** | 50 PV | 🟢 Vert | Rare (20%) |
| **Potion IV** | 100 PV | 🔴 Rouge | Épique (10%) |

- **Capacité max :** 4 potions
- **Utilisation :** Touches 1-4

### Flèches (Archer uniquement)

- **Capacité max :** 10 flèches
- **Drop par coffre :** 3 flèches

---

## 🏛️ Architecture Technique

```
src/
├── main.ts                    # Point d'entrée, menus
│
├── core/                      # Moteur, boucle de jeu, settings, caméra
│   ├── Game.ts                # Moteur Babylon.js, boucle de rendu
│   ├── GameSettings.ts        # Paramètres (localStorage)
│   ├── ThirdPersonCamera.ts   # Caméra TPS avec pointer lock
│   ├── FPSCamera.ts           # Caméra première personne
│   └── GamepadManager.ts      # Support manette
│
├── scenes/
│   └── DungeonScene.ts        # Scène principale du jeu (~1800 lignes)
│
├── entities/                  # Entités du jeu (joueurs + ennemis)
│   ├── CharacterClass.ts      # Interface abstraite des personnages
│   ├── PlayerController.ts    # Classe Chevalier
│   ├── ArcherController.ts    # Classe Archer
│   ├── WizardController.ts    # Classe Sorcier
│   ├── CharacterPreview.ts    # Aperçu personnage (sélection)
│   ├── Enemy.ts               # IA des ennemis
│   └── EnemyTypes.ts          # Configuration des ennemis
│
├── level/                     # Données et génération de niveaux
│   ├── LevelData.ts           # Format JSON des niveaux
│   ├── LevelLoader.ts         # Chargement et construction des niveaux
│   └── BSPDungeonGenerator.ts # Génération procédurale (BSP)
│
├── companion/                 # Compagnon IA (Esprit du Donjon)
│   ├── CompanionDialogues.ts  # 600+ dialogues, 30 types de triggers
│   ├── CompanionAI.ts         # Cerveau IA, cooldowns, priorités
│   ├── CompanionEntity.ts     # Orbe spectrale 3D (particules)
│   ├── CompanionUI.ts         # Overlay 2D (sous-titres, typing)
│   └── DungeonCompanion.ts    # Facade (interface pour DungeonScene)
│
├── systems/                   # Systèmes de jeu (mécaniques)
│   ├── AudioManager.ts        # Audio HTML5 avec pools de sons
│   ├── ChestSystem.ts         # Coffres et objets ramassables
│   ├── DoorSystem.ts          # Portes interactives
│   └── PlayerInventory.ts     # Gestion de l'inventaire
│
├── effects/                   # Effets visuels et post-processing
│   ├── HealingEffect.ts       # Effet visuel de soin
│   ├── HealthVignette.ts      # Vignette écran (vie basse)
│   └── PixelFilter.ts         # Filtre post-processing pixel art
│
├── assets/                    # Chargement de ressources
│   ├── AssetLoader.ts         # Chargement des assets GLB
│   └── AssetPreloader.ts      # Préchargement en arrière-plan
│
├── services/                  # Firebase et services externes
│   ├── FirebaseConfig.ts      # Configuration Firebase
│   ├── AuthService.ts         # Authentification
│   └── StatsService.ts        # Suivi des statistiques joueur
│
├── ui/
│   └── ASCIIText.ts           # Composants UI
│
└── utils/
    └── MeshPlacer.ts          # Instanciation optimisée des meshes
```

### Optimisations Performances

| Technique | Description |
|-----------|-------------|
| **Mesh Instancing** | Réutilisation GPU pour les objets répétés (murs, sol) |
| **Occlusion Culling** | Masquage des meshes derrière les murs (GPU queries) |
| **Light Culling** | Maximum 8 lumières actives, basé sur la distance |
| **Frustum Culling** | Natif Babylon.js - ne rend que le visible |
| **Asset Caching** | Meshes chargés une fois, clonés ensuite |

### Format des Niveaux

```typescript
interface LevelData {
  name: string;
  floors: GridPlacement[];     // Grilles de sol
  walls: WallSegment[];        // Segments de murs
  props: PropPlacement[];      // Objets décoratifs
  lights: LightData[];         // Points lumineux
  enemies: EnemyPlacement[];   // Positions des ennemis
  playerSpawn: { position, rotation };
  camera: { bounds };
  scene?: { fogDensity, ambientColor };
}
```

---

## 🎨 Assets

Tous les assets 3D sont au format **GLB** (glTF Binary) :

```
public/assets/
├── Dungeon_set/           # Environnement (murs, sols, torches)
├── Sword and Shield Pack/ # Modèle Chevalier + animations
├── Pro Longbow Pack/      # Modèle Archer + animations
├── Creature Pack/         # 5 types d'ennemis
├── Potions/               # Modèles de potions
└── SFX/                   # Effets sonores
```

### Système d'Animation

Les animations sont chargées depuis des fichiers GLB séparés et retargetées sur le squelette du personnage :

```
Modèle personnage + Animations GLB → Retargeting squelette → Animation Groups
```

Filtrage du root motion (full/horizontal/none) pour éviter les dérives de position.

---

## 🛠️ Technologies Utilisées

| Technologie | Version | Utilisation |
|-------------|---------|-------------|
| [Babylon.js](https://www.babylonjs.com/) | 8.41.2 | Moteur 3D WebGL |
| [TypeScript](https://www.typescriptlang.org/) | 5.6 | Langage typé |
| [Vite](https://vitejs.dev/) | 5.4 | Build tool & dev server |
| HTML5 Audio API | - | Son et musique |
| LocalStorage | - | Sauvegarde des paramètres |
| Gamepad API | - | Support manette |

---

## 👥 L'Équipe

<table>
  <tr>
    <td align="center">
      <b>Fabrice Gerbaud</b><br>
      <sub>Développeur</sub>
    </td>
    <td align="center">
      <b>Merlin Caromel</b><br>
      <sub>Soutien Emotionnel</sub>
    </td>
    <td align="center">
      <b>Hugo Cohen-Cofflard</b><br>
      <sub>Happiness Manager</sub>
    </td>
  </tr>
</table>

---

## 📦 Déploiement

Le jeu est déployé automatiquement sur **GitHub Pages** :

```bash
# Build pour GitHub Pages
npm run build

# Les fichiers sont générés dans /dist
# Le base path est configuré pour /gamesonweb/
```

**URL de déploiement :** `https://[username].github.io/gamesonweb/`

---

## 📝 Licence

Ce projet a été créé dans le cadre du concours **Games On Web 2026**.

---

<div align="center">

**🎮 Bonne exploration des Cryptes de l'Oubli ! 🏰**

*Développé avec ❤️ et beaucoup de ☕*

</div>
