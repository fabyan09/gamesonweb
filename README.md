# Oblivion's Crypt

🎬 **Bande-annonce :** https://www.youtube.com/watch?v=vIBDfy_fvOQ

[![Trailer Oblivion's Crypt](https://img.youtube.com/vi/vIBDfy_fvOQ/maxresdefault.jpg)](https://www.youtube.com/watch?v=vIBDfy_fvOQ)

Un dungeon crawler 3D jouable dans le navigateur, développé avec Babylon.js pour
le concours **Games On Web 2026** dont le thème est l'**IA**.

**Jouer tout de suite (rien à installer) :** https://fabyan09.github.io/gamesonweb/

---

## Avant de jouer : le matériel

On a vu passer le conseil des organisateurs et on le prend au sérieux : la plupart
des gens testeront le jeu sur un ordinateur portable, sans souris ni manette. Voici
donc la vérité honnête sur la façon dont le jeu se joue.

- **Souris fortement recommandée.** La caméra et la visée passent par un verrouillage
  du pointeur (pointer lock) et par le clic droit pour bloquer/viser. Au trackpad
  c'est jouable, mais nettement moins confortable, surtout pour l'archer et le sorcier.
- **Manette entièrement supportée** (Xbox, PlayStation, manettes génériques). C'est
  même, à notre avis, la façon la plus agréable de jouer. La navigation dans les menus
  fonctionne aussi à la manette.
- **Clavier AZERTY et QWERTY** gérés tous les deux : les déplacements marchent en ZQSD
  comme en WASD. (Coucou les claviers américains.)
- Le jeu tourne dans Chrome / Edge / Firefox récents. Première ouverture un peu longue,
  le temps de précharger les modèles 3D.

Si vous testez vite fait au trackpad, prenez le **Chevalier** : c'est la classe la plus
indulgente.

---

## Pourquoi ce jeu entre dans le thème "IA"

C'est le cœur du projet, alors autant être direct.

Dans la plupart des jeux, l'IA c'est « les ennemis qui vous poursuivent ». On a ça
aussi (machine à états, poursuite, attaque, enrage), mais ce n'est pas notre réponse
au thème. Notre vraie idée, c'est que **le donjon lui-même est une intelligence**.

On l'appelle **l'Esprit du Donjon**. C'est une entité qui observe en permanence ce
que fait le joueur et qui lui parle en temps réel, comme un commentateur conscient et
ambigu — ni allié, ni ennemi. Il réagit à une trentaine de situations différentes :
quand vous repérez un ennemi, quand vous encaissez un coup, quand votre vie est
critique, quand vous enchaînez les kills, quand vous restez immobile trop longtemps,
quand vous ouvrez un coffre, quand vous tombez sur le boss...

Concrètement, derrière cette présence il y a un petit moteur de décision :
- une banque de plus de 600 répliques réparties par type d'événement,
- un système de priorités et de cooldowns pour qu'il ne parle ni trop, ni au mauvais
  moment, et qu'il interrompe son bavardage si quelque chose d'important arrive,
- une surveillance continue de l'état du joueur (vie, inventaire, multi-kills,
  inactivité) qui déclenche les bonnes répliques au bon moment.

Le résultat, c'est qu'on a l'impression que les murs réfléchissent. C'est ça, pour
nous, le thème IA : pas un ennemi de plus, mais une conscience qui habite le lieu.

L'idée est rappelée dès l'écran d'accueil, dans le menu, sur les écrans de chargement
et dans le panneau « Règles & Histoire », pour que le jury comprenne tout de suite
notre angle.

---

## Tester rapidement (note pour le jury)

On sait que vous avez beaucoup de jeux à parcourir. Deux choses pour vous faire gagner
du temps :

- Le bouton **Jouer** lance directement le **niveau 1**, pensé comme une initiation
  tranquille.
- Le bouton **Niveaux** ouvre un sélecteur où vous pouvez :
  - lancer le **niveau 1** (initiation) ou le **niveau 2** (fait main, plus dense),
  - sauter directement à un palier de difficulté procédural (niveaux 5, 10, 25...),
  - ou **taper le numéro de niveau de votre choix**. Envie d'un truc franchement
    violent ? Tapez **50** : les cryptes sont plus grandes, plus peuplées, et le boss
    Warrok débarque en nombre.

Au-delà des deux niveaux faits main, tout est généré procéduralement et la difficulté
monte avec le numéro de niveau (types d'ennemis, nombre, taille du donjon). Vous pouvez
donc jauger le jeu en facile comme en cauchemar sans avoir à le finir.

---

## Le jeu en bref

Vous descendez dans les Cryptes de l'Oubli. Vous choisissez une classe, vous nettoyez
chaque niveau de ses créatures pour déverrouiller la sortie, vous fouillez les coffres
pour récupérer potions et flèches, et vous essayez de survivre pendant que l'Esprit du
Donjon commente vos faits et gestes.

**Trois classes :**

| Classe | Style | Particularité |
|--------|-------|----------------|
| Chevalier | Mêlée | Bouclier qui bloque 70 % des dégâts, attaques accroupies, coup de pied dans les portes |
| Archer | Distance | Tirs à trajectoire réelle, esquive, gestion des flèches, défense réduite |
| Sorcier | Magie | Boules de feu à distance |

**Cinq ennemis**, du simple Vampire au boss Warrok, avec un système d'enrage : touchez
un ennemi à distance et il s'énerve, accélère, et vient vous chercher.

**Et aussi :** génération procédurale par BSP, inventaire qui persiste entre les
niveaux, endurance (stamina) qui limite course/blocage/attaques, musique d'ambiance et
effets sonores spatialisés, comptes joueurs avec statistiques et classement (Firebase).

---

## Contrôles

### Clavier et souris

| Action | Touche |
|--------|--------|
| Se déplacer | ZQSD / WASD |
| Courir | Shift |
| Sauter | Espace |
| S'accroupir | Ctrl |
| Attaquer | Clic gauche |
| Bloquer / Viser | Clic droit |
| Interagir | F |
| Potions | 1 à 4 |
| Changer de caméra (TPS/FPS) | V |
| Pause | P |

Toutes les touches sont remappables dans les paramètres.

### Manette

Stick gauche pour bouger, stick droit pour la caméra, gâchettes pour attaquer et
bloquer. La manette navigue aussi dans les menus.

---

## Le développement, pour de vrai

Cette partie n'est pas du remplissage : c'est ce qu'on aurait aimé lire sur les autres
projets. Voici nos vraies galères et nos vrais choix.

### Les lumières qui faisaient disparaître les murs

Notre pire bug, et de loin. Babylon.js limite le nombre de lumières dynamiques qui
peuvent éclairer un même mesh (histoire d'uniform buffers côté GPU). Tant qu'on avait
deux ou trois torches, tout allait bien. Le jour où on a peuplé un niveau de braseros,
des pans entiers de mur se sont mis à **disparaître** selon l'angle de la caméra — pas
à s'assombrir, à disparaître. On a perdu un temps fou à croire à un problème de culling
de meshes alors que c'était la limite de lumières par mesh qui était dépassée. On a fini
par écrire un système qui ne garde que les 8 lumières les plus pertinentes actives à un
instant donné. Conséquence directe : on s'interdit désormais d'ajouter la moindre
PointLight sans réfléchir à ce budget — l'orbe du compagnon, par exemple, est un pur
effet de particules, **sans** lumière réelle, justement pour ne pas casser ce système.

### Les personnages qui glissaient sur le sol

Nos animations viennent de fichiers GLB séparés du modèle, et on les retargete sur le
squelette du personnage. Problème : beaucoup d'animations embarquent du « root motion »
(le déplacement est dans l'animation elle-même). Résultat, le perso avançait tout seul
pendant une animation d'attaque, ou repartait à l'origine de la scène entre deux
mouvements. Il a fallu filtrer ce mouvement racine (complet / horizontal / aucun selon
l'animation) pour que le déplacement soit piloté par le code et pas par l'animation.

### Le pouvoir du compagnon qui a refusé de marcher pendant des jours

On voulait donner un pouvoir actif à l'Esprit : un « scan » qui surligne les ennemis à
travers les murs. Sur le papier, simple. En pratique, on a enchaîné les versions où il
ne se passait *rien* — pas de surbrillance, pas de scan, rien de visible. Le HighlightLayer,
les marqueurs, la détection des bons meshes ennemis... il a fallu plusieurs passes pour
que ça fonctionne enfin (et l'historique Git en garde des traces peu flatteuses, du genre
« feature in dev, ça marche pas encore »). C'est le genre de fonctionnalité qui paraît
anecdotique et qui prend trois fois plus de temps que prévu.

### Doser la génération procédurale

Le BSP (Binary Space Partitioning) génère des donjons jouables presque tout de suite,
mais « jouable » et « agréable » sont deux choses différentes. Trop grand et on s'ennuie
à traverser des couloirs vides ; trop petit et tout se chevauche. On a réduit la taille
des donjons générés pour les performances, puis recâblé la difficulté pour qu'elle monte
proprement avec le numéro de niveau plutôt que de balancer un boss dès le niveau 3.

### Les décisions de conception qu'on assume

- **Un compagnon narratif plutôt qu'une IA d'ennemi sophistiquée.** On trouvait plus
  original, et plus dans le thème, de faire du donjon une présence qui parle, que
  d'empiler des comportements ennemis. C'est notre pari sur le concours.
- **Pas de souris obligatoire, mais clairement recommandée.** On a préféré être
  honnêtes plutôt que de prétendre que tout est parfait au trackpad.
- **Un accès libre à tous les niveaux.** Plutôt que de forcer la progression, on laisse
  choisir sa difficulté. C'était surtout pour vous, le jury, mais ça sert aussi les
  joueurs qui veulent du challenge tout de suite.

### Ce dont on est fiers

L'Esprit du Donjon qui prend vraiment vie en jeu, les 600 et quelques répliques qui font
qu'on a rarement deux fois la même phrase, l'orbe spectrale en particules qui flotte
autour du joueur, et le fait que tout ça tourne dans un navigateur, à la souris comme à
la manette, en AZERTY comme en QWERTY.

---

## L'équipe

- **Fabrice Gerbaud** — développement
- **Merlin Caromel**
- **Hugo Cohen-Cofflard**

---

## Lancer le projet en local

```bash
git clone https://github.com/Fabyan09/gamesonweb.git
cd gamesonweb
npm install
npm run dev      # serveur de dev sur http://localhost:3000
```

Autres commandes :

```bash
npm run build    # vérification TypeScript + build de production (dossier dist/)
npm run preview  # prévisualiser le build de production
```

Le déploiement vers GitHub Pages est automatique : un push sur `main` déclenche le
workflow qui build et publie sur https://fabyan09.github.io/gamesonweb/

---

## Stack technique

- **Moteur 3D :** Babylon.js 8.41.2 (WebGL)
- **Langage / build :** TypeScript (strict) + Vite
- **Audio :** HTML5 Audio API (musique, pools de SFX, son spatialisé sur les braseros)
- **Backend léger :** Firebase (authentification, statistiques, classement)
- **Persistance locale :** LocalStorage (paramètres, état d'inventaire)
- **Hébergement :** GitHub Pages, base path `/gamesonweb/`

Pour une vue détaillée de l'architecture du code (dossiers `src/core`, `src/entities`,
`src/companion`, etc.), voir `CLAUDE.md` à la racine.

---

Projet réalisé dans le cadre du concours Games On Web 2026.
Bonne descente dans les Cryptes — et ne faites pas trop attention à ce que murmurent
les murs.
