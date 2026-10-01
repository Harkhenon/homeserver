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
| `GET /api/health` | État de l'API + santé par module (`ping` RPC) |
| `GET /api/modules` | Manifests des modules actifs |
| `POST /api/system/:action` | `info`, `cpu`, `memory`, `disks`, `network`, `processes`, `updates`, `sensors` |
| `POST /api/apache/:action` | `vhosts.list/get/create/update/enable/delete`, `service.status/restart/reload` |
| `POST /api/bind9/:action` | `zones.list/get/create/delete`, `records.add/delete`, `service.status/reload` |
| `POST /api/users/:action` | `users.list/get/create/delete`, SFTP chrooté `/var/www/<site>` |
| `POST /api/files/:action` | `files.list/read/write/mkdir/delete/chown` (limité à `/var/www`) |
| `POST /api/php/:action` | `versions.list/install/remove`, `pools.list/get/create/update/delete`, `service.status/restart` |
| `POST /api/ssl/:action` | `certs.list/info/issue/renew` (certbot --apache) |
| `POST /api/mariadb/:action` | `dbs.list/size/create/delete`, `users.list/create/delete/setPassword`, `grants.list/grant/revoke`, `service.status/restart` |
| `POST /api/cron/:action` | `jobs.list/get/create/delete` (limités à /etc/cron.d/homeserver-*) |
| `POST /api/backups/:action` | `backups.list/create/delete/restore` (tar.gz /var/www/<site>) |
| `POST /api/firewall/:action` | `status`, `enable`, `rules.add/remove` (ufw/firewalld) |
| `POST /api/monitor/:action` | `history`, `latest`, `summary` (échantillons 1/min, 12h) |
| `POST /api/node/:action` | `apps.list/create/delete/service`, `ports.check` — apps Node SSR en systemd `hs-app-*`, port dédié, proxy Apache/Nginx |
| `POST /api/nginx/:action` | `vhosts.list/get/create/delete`, `service.status/reload` — alternative à Apache, PHP-FPM ou proxy Node |

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

Une seule commande — tout est automatique (nvm + Node LTS inclus si absents) :

```bash
sudo bash scripts/install.sh
```

L'installateur : détecte la distro, crée l'utilisateur système aléatoire `hs-*` (nologin, sans mot de passe — l'admin interagit via `sudo -u hs-*`), installe nvm + Node LTS **pour cet utilisateur**, copie le panel dans `/usr/share/homeserver` (propriété `hs-*`), installe les dépendances et le build en tant que `hs-*`, installe les paquets système, génère `.env` (secret JWT, identifiants admin, `640` propriété `hs-*`), installe et démarre le service systemd.

Chemins d'installation :
- `/usr/share/homeserver` — code du panel, `node_modules`, build (propriétaire `hs-*`, `750`)
- `/var/lib/homeserver` — données et nvm de l'utilisateur (`750`)

## Ajouter un module

1. Créer `server/src/modules/<nom>/worker.ts` (s'appuyer sur `modules/apache/worker.ts` comme modèle).
2. Définir ses actions dans un `ModuleDefinition`.
3. Ajouter le nom du module à `HS_MODULES` dans `.env`.
