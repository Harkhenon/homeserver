# Homeserver : consignes pour Claude

Panel d'administration de serveur auto-hébergé, en français. Back Fastify/TypeScript (`server/`), modules en
worker threads (`server/src/modules/*/worker.ts`), helper root sur socket UNIX (`helper/`), front React +
Mantine v7 (`front/`), installeur (`scripts/`), updater (`updater/`, publié aussi sur `Harkhenon/homeserver-updater`).

## Règles

- Code, commentaires, messages de commit, PR et interface en **français**.
- Toute écriture privilégiée passe par une action du helper, validée strictement dans
  `server/src/core/privileged/contract.ts`. Pas de chaîne libre dans une configuration, pas de secret en argument
  de commande (stdin), rien de sensible lisible par l'utilisateur `hs-*`.
- Une branche par sujet, créée depuis `origin/main`, puis une PR. **L'utilisateur fusionne lui-même** : pas de
  `gh pr merge --admin`, pas de push direct sur `main`.
- Ne jamais ajouter `.claude/` à un commit.
- Robustesse et compatibilité multi-distributions avant tout : Ubuntu 24.04/26.04, Debian 13, Fedora (SELinux).

## Commandes

```bash
npm run typecheck                    # back + helper
cd front && npm run build            # front (tsc + vite)
cd front && npm run dev:mock         # interface sur API simulée, http://localhost:5173
bash tests/vm/run.sh mail4 --peer    # tests de bout en bout sur VMs (voir tests/vm/README.md)
bash tools/release.sh minor --dry-run
```

Avant une PR qui touche l'installeur, le helper ou le module mail : la suite VM concernée, sur les quatre images.
Une interface modifiée se vérifie sur l'API simulée (`front/dev/mock-api.cjs`, à compléter pour les nouvelles actions).

## Release

`tools/release.sh` publie le panel et, si `updater/` a changé, le couple updater. Il pousse le commit de version
directement sur `main` (contournement de la règle de PR) : à lancer seulement sur demande explicite, depuis un clone
propre de `main` (pas depuis un worktree qui contient `.claude/`). Toujours `--dry-run` d'abord.

## Environnement (poste Windows de l'utilisateur)

- Git Bash : `export MSYS_NO_PATHCONV=1` avant `multipass` ; `multipass transfer` avec des chemins relatifs ;
  `</dev/null` sur `multipass exec` ; Git pour Windows ne comprend pas `/tmp`.
- `core.autocrlf=true` : construire les archives avec `git -c core.autocrlf=false archive`.
- Les heredocs Bash abîment les antislashs : écrire les scripts de patch avec l'outil d'écriture de fichiers.
- Le dossier temporaire d'une session peut être vidé : tout ce qui doit durer va dans le dépôt.
- VM `homeserver` : instance de démonstration de l'utilisateur (panel sur http://192.168.1.131:3000). On peut y
  redéployer (`scripts/redeploy.sh --no-pull`), jamais la casser ni la supprimer. Les VMs de test s'appellent `hst-*`.

## Limites connues

Jamais testé faute d'IP publique : envoi réel vers Internet, rDNS, listes noires, Let's Encrypt réel. Interface de
Roundcube jamais ouverte dans un vrai navigateur. RHEL/Rocky/Alma non couverts.
