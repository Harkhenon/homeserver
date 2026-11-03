<div align="center">
        
```
██╗  ██╗ ██████╗ ███╗   ███╗███████╗███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ 
██║  ██║██╔═══██╗████╗ ████║██╔════╝██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗
███████║██║   ██║██╔████╔██║█████╗  ███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝
██╔══██║██║   ██║██║╚██╔╝██║██╔══╝  ╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗
██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║
╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝
```

# Homeserver

**Le panneau de contrôle qui transforme ton serveur en machine d'hébergement.**

Apache, Bind9, PHP, Node, MariaDB, pare-feu, sauvegardes — tout ça piloté
depuis une seule interface web sombre, moderne, et qui ne te demande
*jamais* d'éditer un fichier de conf à la main.

[![Release](https://img.shields.io/github/v/release/Harkhenon/homeserver?style=flat-square&label=derni%C3%A8re%20version)](https://github.com/Harkhenon/homeserver/releases)
[![License](https://img.shields.io/badge/licence-voir%20d%C3%A9p%C3%B4t-blue?style=flat-square)](https://github.com/Harkhenon/homeserver)
[![Stars](https://img.shields.io/github/stars/Harkhenon/homeserver?style=flat-square)](https://github.com/Harkhenon/homeserver/stargazers)

**📦 [Télécharger la dernière release](https://github.com/Harkhenon/homeserver/releases/latest)**

</div>

---

## ⚡ Un serveur complet, une seule interface

| | | |
|---|---|---|
| 🌍 **Sites web** | Création de vhosts Apache/Nginx en deux clics, docroots, alias, PHP-FPM par version | 🧩 **Apps Node** | Déploiement d'apps Node avec utilisateur dédié, port, console live et monitoring CPU/RAM en temps réel |
| 🌐 **Domaines & DNS** | Zones Bind9 avec esclaves DNS, redondance NS, health-checks — ou domaines gérés par ton registrar (OVH, Gandi...) sans polluer Bind | 🔒 **SSL** | Certificats Let's Encrypt émis et renouvelés via Certbot |
| 🗄️ **Bases de données** | MariaDB : bases, utilisateurs, grants, tailles | 👥 **Utilisateurs** | Comptes système, SFTP chrooté, clés SSH |
| 📁 **Fichiers** | Explorateur intégré | ⏰ **Cron** | Tâches planifiées par site |
| 💾 **Sauvegardes** | Création / restauration de tarballs par site | 🔥 **Pare-feu** | UFW/Firewalld : ports, règles, statut en un coup d'œil |
| 📊 **Supervision** | CPU, RAM, disques, réseau, processus, températures | 🔄 **Auto-update** | Le panel se met à jour lui-même depuis l'interface : build à côté, bascule atomique, health-check, rollback automatique en cas de souci |

## 🛠️ Architecture

- **Back NodeJS** — modules isolés en worker threads (un crash d'Apache n'emporte pas le panel), communication RPC avec un helper privilégié minimaliste et un contrat de requêtes validé. Compatible Debian/Ubuntu et RHEL/Rocky/Alma.
- **Front React** — React + Mantine UI v7, thème sombre avec couleur d'accentuation au choix, composants natifs partout où c'est possible.
- **Déploiement systemd** — services `homeserver` + `hs-helper`, utilisateur dédié, layout de releases atomiques avec rollback.

```
Navigateur ──▶ React (front) ──▶ API Fastify ──▶ workers (apache, bind9, php, node, ...)
                                                    │
                                                    ▼
                                          helper privilégié (root, socket UNIX)
                                                    │
                                        systemctl / fichiers de conf / packages
```

## 🚀 Installation

Un serveur Linux frais (Debian/Ubuntu ou RHEL-like), root, et c'est parti :

```bash
git clone https://github.com/Harkhenon/homeserver.git
cd homeserver
sudo bash scripts/install.sh
```

L'installeur détecte la distribution, installe Node.js LTS (binaires officiels, vérifiés) dans `/opt/homeserver`, configure
l'utilisateur dédié, les services systemd, et te pose quelques questions
(port, interface d'écoute, serveur web, paquets recommandés). À la fin :

```
→ Panel : http://ton-serveur:3000
→ Identifiants : affichés à l'installation
```

Installation sans question (provisioning, cloud-init, CI) :

```bash
sudo HS_WEB_SERVER=nginx HS_PHP_VERSION=latest bash scripts/install.sh --yes
```

`scripts/install.sh --help` liste toutes les variables (port, interface, domaine HTTPS…).
L'installeur vérifie la machine avant de commencer (distribution, systemd, disque, mémoire,
accès réseau), journalise tout dans `/var/log/homeserver/install.log` et peut être relancé
sans risque : la configuration existante est conservée.
Désinstallation : `sudo bash scripts/install.sh --uninstall` (`--purge` pour les logs et groupes).

Pour mettre à jour un panneau existant : **Paramètres → Mise à jour → Mettre à jour le panel**.
Le panel construit la nouvelle version à côté de l'actuelle, bascule, vérifie
sa propre santé — et revient tout seul à la version précédente si quelque
chose cloche. Zéro stress, zéro downtime prolongé.
Le bouton **Vérifier** interroge GitHub immédiatement (une fois par minute au plus) ;
sinon le serveur vérifie de lui-même toutes les 6 h. Seules les releases signées sont appliquées.

> Installations en 0.8.0 ou antérieure (updater 1.0.7) : la mise à jour depuis le panel
> ne peut pas aboutir, il faut réinstaller une fois depuis la release (voir les notes de la v0.9.0).

## 📦 Publier une release

Après une modification, depuis `main` (prérequis : `gh` authentifié, Node, OpenSSL) :

```bash
bash tools/release.sh patch --dry-run        # tout vérifier sans rien publier
bash tools/release.sh patch -m "Correctif X"  # commite, publie, vérifie
```

`patch`, `minor`, `major` ou un numéro `X.Y.Z`. L'outil fait tout en une commande :
- il contrôle le code (typecheck, build du front, syntaxe des scripts, clé publique) ;
- il commite les modifications en cours ;
- il met à jour les versions (back, front, lockfiles) ;
- si `updater/` a changé, il publie d'abord le couple updater sur `homeserver-updater` ;
- il pousse `main` et le tag, attend la CI, puis vérifie la release publiée (assets, signature Ed25519, checksum, version).

En cas d'échec avant publication, les commits locaux sont annulés. Options et détails : `bash tools/release.sh --help`.

## 📋 Prérequis

- Linux x86_64 ou arm64 — Debian/Ubuntu ou RHEL/Rocky/Alma/Fedora, avec systemd
- Accès root, accès réseau sortant (nodejs.org, registry npm, GitHub)
- 3 Go d'espace disque libres ; 2 Go de RAM conseillés (swap temporaire créé sinon)
- `git`
- Un serveur web par machine : Apache ou Nginx (au choix à l'installation)

## 🗺️ État du projet

Projet auto-hébergé, développé pour nos propres serveurs — mais les issues
et PR sont ouvertes. Le panel évolue vite : jette un œil aux
[releases](https://github.com/Harkhenon/homeserver/releases) pour suivre.

<div align="center">

**[⬇️ Télécharger la dernière release](https://github.com/Harkhenon/homeserver/releases/latest)**

Fait avec ⚡ par [Harkhenon](https://github.com/Harkhenon)

</div>
