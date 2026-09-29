# Homeserver — API Backend

Panel de gestion de serveur web/hébergement.

## Architecture

- **Fastify + TypeScript strict** (`server/src/`)
- **Modules isolés** : chaque brique (system, apache, bind9, php...) tourne dans son propre worker thread (`worker_threads`) et répond à un RPC typé.
- **Core** :
  - `core/broker.ts` — pont main ⇄ workers
  - `core/router.ts` — monte les routes REST à partir des manifests des modules
  - `core/platform/` — abstraction distro (Debian/Ubuntu `apt`, Fedora/RHEL `dnf`), mapping `apache2`/`httpd`, `bind9`/`named`, actions systemd
- **Auth** : JWT (`POST /api/auth/login`), toutes les autres routes exigent un Bearer token.

## API

| Route | Description |
|---|---|
| `POST /api/auth/login` | `{ username, password }` → `{ token }` |
| `GET /api/health` | État de l'API |
| `GET /api/modules` | Manifests des modules actifs |
| `POST /api/system/:action` | `info`, `cpu`, `memory`, `disks` |
| `POST /api/apache/:action` | `vhosts.list`, `vhosts.get`, `service.status`, `service.restart` (mock) |

Exemple :
```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"changeme"}' | jq -r .token)

curl -s -X POST localhost:3000/api/system/cpu -H "authorization: Bearer $TOKEN"
```

## Développement

```bash
npm install
cp .env.example .env
npm run dev          # tsx watch
npm run typecheck    # tsc --noEmit
npm run build        # build dans server/dist
npm start
```

## Installation production

```bash
sudo npm run install-panel
```

L'installateur interactif : détecte la distro, crée l'utilisateur système aléatoire `hs-*` (nologin, sans mot de passe — l'admin interagit via `sudo -u hs-*`), installe les paquets, génère `.env` (secret JWT, identifiants admin), installe et démarre le service systemd.

## Ajouter un module

1. Créer `server/src/modules/<nom>/worker.ts` (s'appuyer sur `modules/apache/worker.ts` comme modèle).
2. Définir ses actions dans un `ModuleDefinition`.
3. Ajouter le nom du module à `HS_MODULES` dans `.env`.
