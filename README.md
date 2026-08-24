# perso-board — Trello personnel + objectifs SMART

Kanban personnel dont la particularité est que **les tâches font avancer des
objectifs SMART** : chaque carte peut être rattachée à un objectif avec une
contribution chiffrée, et l'avancement de l'objectif est **calculé** à partir
des cartes cochées — jamais saisi à la main (sauf ajustement « hors outil »).

**Stack** : Vite + React 19 + Tailwind 4 + dnd-kit, données sur **Supabase**
(Postgres + RLS + Storage), déployé sur **Vercel**.

Mise en production : voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

## Démarrer en local

```bash
npm install
cp .env.example .env.local   # puis renseigner les clés Supabase
npm run dev                  # http://localhost:5180
npm run build
npm run typecheck
```

## Fonctionnalités

- **Tableau** : un seul tableau, listes et cartes en glisser-déposer (souris,
  tactile, clavier). Listes grises par défaut, déplaçables, colorables,
  réductibles en barre verticale, archivables (menu ⋯ : Couleur + Archiver).
  Fond d'écran plein écran (bouton 🖼), bandeaux du haut en verre sombre.
- **Cartes** : fiche façon Trello — sélecteur de liste, rond « terminée » à
  côté du titre, sections masquées tant qu'elles sont vides. Description
  WYSIWYG (gras, italique, souligné, barré, titres, listes, liens, code),
  étiquettes, échéance date + heure, checklists multiples titrées avec échéance
  par étape, pièces jointes. **Glisser un fichier sur une carte l'attache.**
- **Terminée** = le rond coché sur la carte, comme sur Trello. Les listes sont
  toutes équivalentes : déplacer une carte dans « Terminé » ne la termine pas.
- **Objectifs SMART** : les 5 critères en champs séparés avec indication de ce
  qui manque, avancement dérivé des cartes, **paliers datés** — dès qu'un palier
  existe, c'est lui qui juge l'avance ou le retard, pas le temps écoulé.
- **Rappels** : échéances autonomes qui ne vivent **que dans le calendrier**
  (aucune carte créée). Rythmes : une fois, quotidien, hebdomadaire, certains
  jours de la semaine, tous les X jours/semaines/mois/ans. Jour + heure, note,
  étiquette, pré-avis X jours avant. **Chaque occurrence se valide séparément** :
  oublier lundi ne l'efface pas quand mardi arrive.
- **Calendrier** : grille mensuelle ou agenda vertical ; cartes datées,
  échéances d'objectifs et 🔔 rappels (pré-avis en pointillés, validés barrés).
- **Parcourir** : recherche globale cartes + listes, archivées comprises.
- Thème clair/sombre/système, interface entièrement en français.

## Architecture

```
src/
├── lib/                  # cœur métier, sans UI
│   ├── types.ts          # modèles (Board, List, Card, Goal, Reminder…)
│   ├── supabase.ts       # client
│   ├── repo.ts           # ★ LA FRONTIÈRE BACKEND — seul à connaître Postgres
│   ├── state.tsx         # StoreProvider : état + toutes les mutations
│   ├── goals.ts          # avancement dérivé, critères SMART, paliers
│   ├── reminders.ts      # occurrences déduites, validation, pré-avis
│   ├── ordering.ts       # positions fractionnaires (drag & drop économe)
│   ├── dates.ts          # dates FR, jours YYYY-MM-DD sans piège de fuseau
│   ├── seed.ts           # amorçage : structure seulement
│   ├── image.ts          # redimensionnement des fonds d'écran
│   ├── notify.ts         # notifications système (onglet ouvert uniquement)
│   ├── palette.ts        # couleurs étiquettes/listes
│   └── theme.ts          # clair / sombre / système
├── components/           # primitives (Button, Modal, DatePicker…)
└── features/
    ├── auth/             # portail de connexion
    ├── board/            # kanban, colonnes, cartes, fiche carte
    ├── goals/            # vue Objectifs + éditeur SMART
    ├── calendar/         # vues Mois + Agenda
    ├── reminders/        # rappels et validation des échéances
    ├── search/           # « Parcourir »
    └── settings/         # étiquettes, tableau, thème, données
supabase/migrations/      # schéma, RLS, buckets Storage
```

**Pourquoi `repo.ts` est central** : il est la seule frontière avec le backend.
C'est ce qui a permis de passer d'IndexedDB à Supabase sans toucher une ligne
des règles métier. Il y traduit deux choses, et nulle part ailleurs :
snake_case ↔ camelCase, et fichiers Storage ↔ URL signées.

## Limites connues

- **Les notifications système n'arrivent que si l'onglet est ouvert** — sans
  service worker ni Web Push, rien ne tourne quand l'application est fermée.
  Le bandeau « À valider » de l'onglet Rappels sert de filet.
- **Le projet Supabase gratuit se met en pause après ~7 jours sans activité.**
- **Les URL de fichiers sont signées pour 8 heures** : sur une très longue
  session, recharger la page les régénère.
