# perso-board — Trello personnel + objectifs SMART

Kanban personnel dont la particularité est que **les tâches font avancer des
objectifs SMART** : chaque carte peut être rattachée à un objectif avec une
contribution chiffrée, et l'avancement de l'objectif est **calculé** à partir
des cartes terminées — jamais saisi à la main (sauf ajustement « hors outil »).

V1 **localhost uniquement** : pas de git, pas de déploiement, pas de backend.
Tout est stocké dans le navigateur (IndexedDB), y compris pièces jointes et
fonds d'écran.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5180
npm run build      # build de production dans dist/
npm run typecheck
```

Au premier lancement, un jeu de démonstration s'installe (tableau, listes
colorées, objectifs) — tout est modifiable, et « Réglages → Effacer toutes les
données » permet de repartir de zéro.

## Fonctionnalités

- **Tableau** : listes et cartes en glisser-déposer (souris, tactile, clavier) ;
  listes grises par défaut, déplaçables, colorables, réductibles en barre
  verticale (clic pour rouvrir), archivables (menu ⋯ façon Trello : Couleur +
  Archiver, restauration depuis Parcourir ou les Réglages) ; fond d'écran plein
  écran par tableau (bouton 🖼 de l'en-tête), bandeaux du haut en verre sombre.
- **Cartes** : fiche façon Trello (sélecteur de liste en haut, rond « terminée »
  à côté du titre, sans commentaires) — description markdown, étiquettes,
  échéance, checklist avec barre de %, pièces jointes (10 Mo max), rattachement
  à un objectif + contribution, archivage depuis la fiche.
- **Parcourir** (en-tête) : recherche globale sur les cartes et les listes,
  **archivées comprises** — c'est là qu'on retrouve et restaure l'archivé.
- **Terminée** = le rond coché sur la carte (tuile ou fiche), comme sur Trello.
  Les listes sont toutes équivalentes — déplacer une carte dans « Terminé » ne
  la termine pas, seul le rond compte (et fait avancer l'objectif rattaché).
- **Objectifs** : les 5 critères S-M-A-R-T en champs séparés avec indication de
  ce qui manque, avancement dérivé des cartes, repère du temps écoulé, rythme
  requis par semaine, badge des objectifs en retard dans l'en-tête.
- **Calendrier** : grille mensuelle ou agenda vertical continu (scroll ancré sur
  aujourd'hui) des cartes à échéance et deadlines d'objectifs actifs.
- Thème clair/sombre/système (Réglages), interface entièrement en français.

## Architecture

```
src/
├── lib/                  # cœur métier, sans UI
│   ├── types.ts          # modèles (Board, List, Card, Goal…)
│   ├── idb.ts            # enveloppe IndexedDB (v2 : + store wallpapers)
│   ├── repo.ts           # ★ SEUL fichier à réécrire pour brancher Supabase
│   ├── state.tsx         # StoreProvider : état + toutes les mutations
│   ├── goals.ts          # avancement dérivé, critères SMART, rythme
│   ├── ordering.ts       # positions fractionnaires (drag & drop économe)
│   ├── dates.ts          # dates FR, jours YYYY-MM-DD sans piège de fuseau
│   ├── seed.ts           # jeu de démonstration (verrouillé contre StrictMode)
│   ├── image.ts          # préparation des fonds d'écran (redim. 2 560 px)
│   ├── palette.ts        # couleurs étiquettes/listes, teintes opaques
│   └── theme.ts          # clair / sombre / système
├── components/ui.tsx     # primitives (Button, Modal, popover…)
└── features/
    ├── board/            # kanban, colonnes, cartes, fiche carte, fond d'écran
    ├── goals/            # vue Objectifs + éditeur SMART
    ├── calendar/         # vues Mois + Agenda
    ├── search/           # « Parcourir » : recherche globale, archivés compris
    └── settings/         # étiquettes, tableaux, listes archivées, thème, données
```

## Passage à Supabase (préparé, non fait)

`lib/repo.ts` est la frontière : API asynchrone, identifiants UUID v4 générés
côté client, positions fractionnaires — le schéma Postgres peut reprendre les
types tels quels. Prévoir : colonne `user_id` + RLS (mono-utilisateur,
inscription fermée), Supabase Storage pour pièces jointes et fonds d'écran, et
un ping périodique pour éviter la mise en pause du projet gratuit.
