# Mise en production — perso-board

Trois étapes : Supabase, puis les variables locales, puis Vercel.
Compte le temps d'un café.

---

## 1. Supabase

### 1.1 Le schéma

Dashboard → **SQL Editor** → colle tout le contenu de
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.

Le script est **ré-exécutable sans risque** (`if not exists`, `drop policy if
exists`) : en cas de doute, le relancer ne casse rien.

Il crée les 8 tables, la RLS (une politique « je ne vois que mes lignes » par
table), les deux buckets Storage privés `attachments` et `wallpapers`, et leurs
politiques d'accès par dossier utilisateur.

### 1.2 Ton compte

Dashboard → **Authentication** → **Users** → **Add user** → *Create new user*.

- ton adresse e-mail, un mot de passe
- coche **Auto Confirm User** (sinon la connexion sera refusée tant que le mail
  de confirmation n'est pas cliqué)

### 1.3 Fermer les inscriptions

Dashboard → **Authentication** → **Providers** → **Email** :

- **Enable Sign Up** : ❌ désactivé

C'est ce qui garantit que ton URL Vercel, même connue, ne permet à personne de
se créer un compte. L'application n'a d'ailleurs aucun écran d'inscription.

### 1.4 Les clés

Dashboard → **Project Settings** → **API**. Tu auras besoin de deux valeurs :

| Valeur | Où la trouver |
| --- | --- |
| `VITE_SUPABASE_URL` | *Project URL* |
| `VITE_SUPABASE_ANON_KEY` | *Project API keys* → **anon / public** |

> ⚠️ La clé **`service_role`** ne doit jamais quitter le dashboard : elle
> contourne la RLS. Seule la clé **anon** va dans l'application — elle est
> publique par conception, et c'est la RLS qui protège réellement les données.

---

## 2. En local

```bash
cp .env.example .env.local
```

Renseigne les deux valeurs dans `.env.local`, puis :

```bash
npm run dev
```

`.env.local` est ignoré par git (`.gitignore`), il ne partira jamais dans le
dépôt.

---

## 3. Git puis Vercel

### 3.1 Pousser le dépôt

Le dépôt local est déjà initialisé avec un premier commit. Crée un dépôt
**privé** sur GitHub (par exemple `perso-board`), puis :

```bash
git remote add origin https://github.com/<ton-compte>/perso-board.git
git push -u origin main
```

### 3.2 Brancher Vercel

Vercel → **Add New… → Project** → importe le dépôt.

| Réglage | Valeur |
| --- | --- |
| Framework Preset | **Vite** (détecté tout seul) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Root Directory | **la racine** — le projet n'est pas dans un sous-dossier |

Avant de déployer, ajoute les deux variables d'environnement (**Settings →
Environment Variables**), pour *Production*, *Preview* et *Development* :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

> Ces variables sont lues **au moment du build**, pas à l'exécution : si tu les
> ajoutes ou modifies après coup, il faut relancer un déploiement pour qu'elles
> soient prises en compte.

### 3.3 Autoriser l'URL Vercel côté Supabase

Dashboard → **Authentication** → **URL Configuration** → ajoute ton domaine
Vercel dans **Site URL** et **Redirect URLs**.

---

## Ce qu'il faut savoir ensuite

**Le projet gratuit se met en pause après ~7 jours sans activité.** Si tu
ouvres l'application tous les jours, aucun souci. Sinon, un simple appel
planifié (le VPS fait très bien l'affaire) suffit à le garder éveillé.

**Les notifications système n'arrivent que si l'onglet est ouvert.** C'est une
limite du navigateur, pas de l'hébergement : sans service worker ni Web Push,
rien ne tourne quand l'application est fermée. Le bandeau « À valider » de
l'onglet Rappels reste le filet de sécurité.

**Les fichiers sont servis par URL signée valable 8 heures.** Si une image de
fond ou une pièce jointe cesse de s'afficher après une très longue session,
recharger la page régénère les URL.

**Premier démarrage :** le compte reçoit un tableau « Mon tableau » avec trois
listes et cinq étiquettes. Aucune carte ni objectif de démonstration — tu pars
d'une page propre.
