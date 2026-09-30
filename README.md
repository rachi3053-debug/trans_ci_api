# TransCI — API (NestJS)

Backend de la plateforme TransCI (gestion d'une compagnie de transport interurbain,
Côte d'Ivoire). NestJS 11, TypeORM 0.3, PostgreSQL.

## Stack

- NestJS 11, TypeScript strict (`noImplicitAny`, pas de `any` sans justification)
- TypeORM 0.3 + PostgreSQL (pg), migrations versionnées
- JWT (passport-jwt), bcrypt, class-validator, Swagger
- Multi-tenancy : `X-Tenant-Id` / `X-Tenant-Code`, sous-domaine ou query param

## Démarrage

```bash
npm install
cp ../.env.example .env        # ou créer .env — ajuster DB_*, JWT_*, etc.

# 1. Appliquer les migrations
npm run migration:run

# 2. (Recommandé) Charger les données de base
npm run seed

# 3. Lancer
npm run start:dev              # http://localhost:3000/api/v1
```

Documentation Swagger : http://localhost:3000/api/v1/docs

## Scripts

| Commande | Description |
|---|---|
| `npm run start:dev` | Serveur de dev (watch) |
| `npm run build` | Compilation NestJS |
| `npm run migration:run` | Applique les migrations |
| `npm run migration:generate -- <Nom>` | Génère une migration |
| `npm run migration:revert` | Annule la dernière migration |
| `npm run seed` | Seed idempotent (tenants, permissions, rôles, utilisateurs, ROOT) |
| `npm run lint` | ESLint (avec `--fix`) |
| `npm run test` | Tests unitaires |

## Multi-tenancy

Chaque ressource métier (utilisateurs, rôles, permissions, demandes, dossiers…)
est scopedée à un **tenant**. Un tenant est identifié selon l'ordre de résolution
suivant (`TenantContextService.resolve`) :

1. Header `X-Tenant-Id` (UUID)
2. Header `X-Tenant-Code` (libellé court)
3. Payload JWT (`tenantId` / `tenantCode` dans l'access token)
4. Sous-domaine (`acme.api.transci-ci.com` → `acme`)
5. Query param `?tenantId=`

### Garde de protection des routes

```
ThrottlerGuard → JwtAuthGuard → TenantGuard → PermissionGuard
```

- `@Public()` : route ouverte (login, register, health).
- `@NoTenant()` : route authentifiée mais sans exigence de tenant.
- `TenantGuard` : pour les utilisateurs non-ROOT, résout le tenant et le rattache
  à `request.resolvedTenant`. **Bypass pour ROOT** (accès global, tenant non requis).
- `PermissionGuard` : vérifie les annotations `@Permissions('CODE')` / `@Roles('X')`.
  **Bypass pour ROOT**.

## Compte ROOT (super-administrateur système)

Le **ROOT** est l'ancien compte créé avant le multi-tenancy : `tenant_id = NULL`,
**aucun tenant**, accès **global** (données de tous les tenants, toutes
permissions, sans header de tenant).

### Détection

- Uniquement **par rôle** : lien `user_roles` → rôle `code = 'ROOT'` stocké avec
  `tenant_id = NULL`.
- **Jamais** par `tenant_id = NULL` seul : un compte sans tenant n'est pas
  forcément ROOT. Le backend vérifie toujours le rôle (`isUserRoot`).

### Règles

| Cas | Comportement |
|---|---|
| ROOT (login) | Rôles `['ROOT']`, permissions = **toutes** les permissions réelles de la table `permissions`, `isRoot: true`, pas de tenant |
| ROOT (routes) | Bypass TenantGuard + PermissionGuard, services sans filtre tenant (accès global) |
| Utilisateur normal (login) | Tenant requis : priorité au contexte (header/sous-domaine), sinon `tenant_id` du compte |
| Utilisateur normal (routes) | Tenant obligatoire + rôles/permissions vérifiés, données scopedées au tenant |

> Le frontend teste chaque permission individuellement (`USER:READ`, etc.) : c'est
> pourquoi le JWT du ROOT contient la **liste complète** des codes de permission
> et pas un wildcard `*`.

### Configuration

- Adresse du compte ROOT : constante `ROOT_EMAIL` dans `src/database/seed.ts`
  (défaut `root@transci.com`) — **à adapter à l'email réel du compte existant**.
- Si le compte n'existe pas, le seed le **crée** avec `Root@1234!`.
- Si le compte existe, le seed **ne change pas son mot de passe** : il lui
  assigne le rôle ROOT et met `tenant_id = NULL`.

## Comptes créés par le seed

| Email | Rôle | Tenant | Mot de passe |
|---|---|---|---|
| `root@transci.com` | ROOT | — (global) | `Root@1234!` **si créé par le seed**, sinon d'origine |
| `admin@transci.com` | ADMIN | DEFAULT | `Admin@1234!` |

`admin@transci.com` est un utilisateur **normal** du tenant DEFAULT : il doit
recevoir/renvoyer un tenant (l'intercepteur frontend le fait automatiquement).

## Module Utilisateurs — fonctionnalités

Le `UsersService` repose sur trois services génériques partagés
(`CommonModule`) :

- **`SearchService`** — recherche plein texte (ILIKE) + pagination `meta`/`links`.
- **`SoftDeleteService`** — soft delete / restore / hard delete génériques
  (colonne `deletedAt` + `deletedBy` de `BaseAuditEntity`).
- **`BulkOperationsService`** — validation des ids et mise à jour en masse.

### Recherche

- `GET /users` : `search` (nom, prénom, email, téléphone), `role` (code),
  `actif`, + pagination/tri.
- `GET /users/deleted` : corbeille (soft-deleted, scopedée au tenant).

### Cycle de vie

- `DELETE /users/:id` : soft delete (marque `deleted_at`, trace `deleted_by`).
- `POST /users/:id/restore` : restauration.
- `DELETE /users/:id/hard` : suppression physique, **réservée au ROOT**.

### Rôles

- `POST /users/:id/roles` : remplace les rôles.
- `DELETE /users/:id/roles` : retire des rôles spécifiques.
- `POST /users/bulk/assign-roles` / `DELETE /users/bulk/remove-roles` :
  assignation / retrait en masse.

### Mot de passe

- `POST /users/:id/setup-password` avec `passwordAction` :
  - `set-password` : admin/ROOT impose un mot de passe ;
  - `reset-password` : mot de passe provisoire généré si absent (`firstconnexion=true`) ;
  - `first-login` : l'utilisateur change son mot de passe provisoire (utilisateur
    ou ROOT uniquement).

### Mot de passe oublié (récupération par email)

- `POST /auth/forgot-password` `{ email }` : réponse **neutre** (pas de fuite
  d'existence de compte). Un jeton `RESET` (même mécanisme sécurisé que
  l'activation : SHA-256 en base, lien `${FRONTEND_URL}/auth/reset-password?token=...`,
  expiration `USER_INVITATION_EXPIRES_IN_HOURS`) est émis et envoyé par email
  uniquement pour les comptes `ACTIVE`.
- `POST /auth/reset-password` `{ token, password, confirmPassword }` : vérifie
  et consomme le jeton de façon atomique, remplace le mot de passe (Argon2id)
  et révoque les jetons résiduels. Comptes `INVITED`/`SUSPENDED`/`DISABLED`
  refusés.
- La table `user_activation_tokens` porte désormais une finalité `purpose`
  (`ACTIVATION` | `RESET`) : un seul jeton actif par utilisateur **et par
  finalité**. Nouveaux événements d'audit `PASSWORD_RESET_REQUESTED` /
  `PASSWORD_RESET_COMPLETED`.

### Réinitialisation par un administrateur

- `POST /users/:id/setup-password` avec `passwordAction=reset-password` (ou
  `set-password`) : génère un mot de passe provisoire (renvoyé dans
  `metadata.generatedPassword`) ; l'utilisateur le change ensuite.

### Invitation & activation de compte

Créer un utilisateur **sans mot de passe** (`CreateUserDto.password` optionnel)
le place en statut `INVITED` (table `users.status`, enum
`INVITED | ACTIVE | SUSPENDED | DISABLED`) et déclenche l'envoi d'un email
d'invitation contenant un lien d'activation.

- `POST /users` (sans `password`) : création + invitation. Après validation, un
  token d'activation est généré et un email envoyé (**après** le commit de la
  transaction) via `MailModule` (SMTP nodemailer, ou console en dev si `MAIL_*`
  absents).
- `GET /auth/activation/validate?token=...` : vérifie le lien (valide, expiré,
  déjà utilisé). Route publique, sans audit de l'URL.
- `POST /auth/activation/activate` `{ token, password, confirmPassword }` :
  l'utilisateur définit son mot de passe → compte `ACTIVE`, `actif=true`,
  `emailVerified=true`, `firstConnexion=true` ; les autres jetons de l'utilisateur
  sont révoqués.
- `POST /users/:id/resend-invitation` (permission `USER:UPDATE`) : renvoie
  l'email d'un compte encore `INVITED` (cooldown configurable).

Sécurité :

- Seul le **hash SHA-256** du token est stocké (`user_activation_tokens.token_hash`) ;
  le token brut n'existe que dans l'email (`${FRONTEND_URL}/auth/activate?token=...`).
- Mot de passe **Argon2id** (`PasswordService`, migration progressive depuis bcrypt).
- Expiration 24 h (`USER_INVITATION_EXPIRES_IN_HOURS`), cooldown de renvoi
  60 s (`USER_INVITATION_RESEND_COOLDOWN_SECONDS`), un seul token actif par user.
- Un compte `INVITED` ne peut pas se connecter (code `USER_NOT_ACTIVATED`).

### Blocage de compte

- `POST /users/:id/lock` (+`reason`) : bloque le compte
  (`access_locked=true`, `actif=false`), trace un événement.
- `POST /users/:id/unlock` : débloque et réactive.
- `GET /users/:id/access-lock-history` : historique paginé des blocages.

### Opérations en masse

`POST /users/bulk/delete` (avec `confirm: true` obligatoire), `POST /users/bulk/restore`,
`POST /users/bulk/status` (`actif`). Retour standard `{ total, successCount, failedIds }`.

### Protection du compte ROOT

Le compte ROOT ne peut être **désactivé, bloqué, modifié, soft-supprimé ou
supprimé définitivement** que par le ROOT lui-même. Les opérations sensibles
(mot de passe, blocage) sont réservées au ROOT, à l'utilisateur concerné ou à un
ADMIN. La création accepte un `tenantId` de destination **uniquement** pour ROOT.

## Conventions

- La **source de vérité** des règles métier est le backend ; le front n'affiche et
  ne valide qu'en soutien.
- Aucun secret en dur : tout passe par `.env` (`JWT_*`, `DB_*`, `PORT`, `API_PREFIX`).
- Erreurs HTTP standardisées via `HttpExceptionFilter` ; réponses success wrappées
  dans `{ success, code, message, data }` (`ResponseInterceptor`).