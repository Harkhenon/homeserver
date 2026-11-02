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

## Sécurité — variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `HS_JWT_SECRET` | (obligatoire en prod) | Secret de signature des JWT. En dev uniquement, un secret éphémère est généré à chaque démarrage (les sessions ne survivent pas à un restart). En prod, un secret absent ou faible fait échouer le démarrage (fail-fast). |
| `HS_HOST` | `0.0.0.0` (install) / `127.0.0.1` (sans `.env`) | Interface d'écoute. L'installateur propose `0.0.0.0` par défaut (accès direct via `IP:3000`, cookies `Secure` désactivés en HTTP) ou `127.0.0.1` derrière un reverse-proxy nginx/Apache avec TLS. Modifiable à chaud depuis le panel : **Paramètres → Accès réseau** (`system.access.status` / `system.access.set` — écrit le `.env`, ajuste `HS_SECURE_COOKIES` et redémarre le service). `0.0.0.0` déclenche un avertissement si `HS_FORCE_HTTPS` n'est pas actif. |
| `HS_ALLOWED_ORIGIN` | (désactivé) | Origines CORS autorisées, séparées par des virgules. Vide = CORS désactivé (même origine). |
| `HS_FORCE_HTTPS` | `false` | Active HSTS + `upgrade-insecure-requests` dès que le panel est servi en HTTPS (reverse-proxy). |
| `HS_PANEL_DOMAIN` | (vide) | Domaine du panel quand le HTTPS est actif (vhost Apache + Let's Encrypt). Géré par Paramètres → Accès réseau (`system.https.setup` / `https.revert`). |

Sessions : JWT signés avec expiration 12h + génération de session (révocable via `POST /api/auth/logout-all`). Anti-bruteforce persistant (IP + utilisateur, 5 essais / 15 min). 2FA TOTP avec anti-replay. CSRF double-submit sur les requêtes authentifiées par cookie (header `x-csrf-token`).

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

Une seule commande — tout est automatique (Node LTS inclus si absent) :

```bash
sudo bash scripts/install.sh
```

L'installateur : détecte la distro, crée l'utilisateur système aléatoire `hs-*` (nologin, sans mot de passe — l'admin interagit via `sudo -u hs-*`), installe Node LTS (archive officielle, checksum vérifié) en root dans `/opt/homeserver/node`, construit la release sous un utilisateur dédié sans privilège (`homeserver-build`) puis l'installe en lecture seule (root), installe les paquets système, génère `.env` (secret JWT, `600` propriété `hs-*`) et le hash scrypt du mot de passe admin, installe et démarre les services systemd (durcis).

**Frontière de privilèges** : tout ce que root exécute (runtime Node, releases, lien `current`, updater, unités) appartient à root et n'est pas modifiable par `hs-*` ; le helper root n'accepte que les actions de `server/src/core/privileged/contract.ts`, limitées aux comptes créés par le panel ; l'updater n'installe que des archives signées (Ed25519, `keys/release-signing.pub.pem`). Logique commune : `scripts/layout.sh`.

Chemins d'installation :
- `/usr/share/homeserver` — root : lien `current` vers la release active + `.env` (`600`, propriété `hs-*`)
- `/opt/homeserver/node` — runtime Node (root, lecture seule ; liens `/usr/local/bin/node|npm|npx`)
- `/opt/homeserver/releases/<version>` — releases construites (root, lecture seule), `installed.json` ; `/opt/homeserver/update-status.json`
- `/var/lib/homeserver` — HOME et données du panel (`auth.json`, historiques…), propriété `hs-*` (`750`)
- `/var/lib/homeserver-build` — HOME de `homeserver-build` (cache npm, répertoire de build)
- `/usr/local/lib/homeserver/updater` — couple updater (timer systemd 6h)
- `/var/log/homeserver/install.log` — journal complet de chaque installation

Installation automatisée (sans question) : `sudo bash scripts/install.sh --yes`, avec au besoin
`HS_ADMIN_USER`, `HS_PORT`, `HS_HOST`, `HS_WEB_SERVER`, `HS_PHP_VERSION`, `HS_INSTALL_EXTRAS`,
`HS_PANEL_DOMAIN`, `HS_LETSENCRYPT_EMAIL` (détail : `scripts/install.sh --help`).
L'installation est rejouable : une relance conserve le `.env` (secrets, domaine HTTPS, réglages)
et ne demande que les valeurs manquantes.

## Ajouter un module

1. Créer `server/src/modules/<nom>/worker.ts` (s'appuyer sur `modules/apache/worker.ts` comme modèle).
2. Définir ses actions dans un `ModuleDefinition`.
3. Ajouter le nom du module à `HS_MODULES` dans `.env`.
