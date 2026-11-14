# Tests de bout en bout sur VMs

Installent le panel sur des VMs Multipass jetables, puis l'exercent comme un vrai utilisateur : API du panel,
SMTP, IMAP, requêtes de navigateur sur le webmail, vrais bannissements depuis une VM voisine. Les VMs sont
supprimées à la fin.

```bash
bash tests/vm/run.sh mail4 --peer                 # 4 distributions, bannissements réels compris
bash tests/vm/run.sh mail5 --web mix --upgrade    # Apache et Nginx en alternance, mise à niveau depuis origin/main
bash tests/vm/run.sh mail3 --images "26.04"       # une seule distribution, plus rapide
bash tests/vm/run.sh mail4 --memory 4G -- --clamav
```

C'est l'arbre de travail qui est testé, modifications non commitées comprises (sans `.claude/`).
Le résumé n'affiche que les échecs ; les journaux complets sont dans `tests/vm/out/` (ignoré par git).

## Suites

| Suite | Contenu |
|---|---|
| `mail1` | Activation, domaines, boîtes, envoi et réception, TLS, DKIM, quotas, POP3, suspension |
| `mail2` | Enregistrements DNS dans Bind, vérifications, délivrabilité, rotation DKIM, e-mail de test, relais (optionnel) |
| `mail3` | Alias, catch-all, redirections, répondeur Sieve, limites d'envoi, quotas détaillés |
| `mail4` | Antispam (Postfix, Rspamd, ClamAV), pare-feu, file d'attente, journaux, sauvegardes et archives hostiles, fail2ban |
| `mail5` | Webmail Roundcube : connexion, envoi, changement de mot de passe, route locale, désactivation |

`--peer` ajoute une VM voisine pour `mail4` et `mail5` : elle déclenche de vrais échecs de connexion et le test
vérifie que l'IP est bannie **et** que le port est réellement coupé (`fail2ban-client status` seul ne le prouve pas).

Le relais SMTP de `mail2` demande un second serveur préparé avec `suites/relay-prep.py` : à lancer à la main.

## Matrice

Par défaut : Ubuntu 26.04 et 24.04, Debian 13, Fedora 44 (SELinux Enforcing, refus SELinux comptés).
Multipass ne fournit pas Rocky ni Alma : RHEL n'est pas couvert.

## Autres outils

- `updater/bench.sh` et `updater/regress.sh` : banc de l'updater dans une VM (clé de signature de test, fausse API
  GitHub locale). Voir l'en-tête de `bench.sh`.
- `front/dev/vite-mock.cjs` : l'interface sur une API simulée, sans serveur (`npm run dev:mock` dans `front/`).

## Pièges connus

- Windows : `multipass transfer` veut des chemins relatifs, `multipass exec` avec une entrée standard peut rester
  bloqué (`</dev/null`), et Git pour Windows ne comprend pas `/tmp` de Git Bash. `run.sh` en tient compte.
- Lancer plusieurs VMs en même temps coupe parfois le réseau des autres : `run.sh` les lance une par une.
- Le port 25 sortant est bloqué depuis les VMs : l'envoi réel vers Internet n'est pas testable ici.
