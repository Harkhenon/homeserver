<div align="center">

```
 ▄▄    ▄▄                                  ▄▄▄▄
 ██    ██                                ▄█▀▀▀▀█
 ██    ██   ▄████▄   ████▄██▄   ▄████▄   ██▄        ▄████▄    ██▄████  ██▄  ▄██   ▄████▄    ██▄████
 ████████  ██▀  ▀██  ██ ██ ██  ██▄▄▄▄██   ▀████▄   ██▄▄▄▄██   ██▀       ██  ██   ██▄▄▄▄██   ██▀
 ██    ██  ██    ██  ██ ██ ██  ██▀▀▀▀▀▀       ▀██  ██▀▀▀▀▀▀   ██        ▀█▄▄█▀   ██▀▀▀▀▀▀   ██
 ██    ██  ▀██▄▄██▀  ██ ██ ██  ▀██▄▄▄▄█  █▄▄▄▄▄█▀  ▀██▄▄▄▄█   ██         ████    ▀██▄▄▄▄█   ██
 ▀▀    ▀▀    ▀▀▀▀    ▀▀ ▀▀ ▀▀    ▀▀▀▀▀    ▀▀▀▀▀      ▀▀▀▀▀    ▀▀          ▀▀       ▀▀▀▀▀    ▀▀
        Panel de gestion de serveur web/hébergement
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

L'installeur détecte la distribution, installe Node.js LTS via nvm, configure
l'utilisateur dédié, les services systemd, et te pose trois questions. À la fin :

```
→ Panel : http://ton-serveur:3000
→ Identifiants : affichés à l'installation
```

Pour mettre à jour un panneau existant : **Paramètres → Mise à jour → Mettre à jour le panel**.
Le panel construit la nouvelle version à côté de l'actuelle, bascule, vérifie
sa propre santé — et revient tout seul à la version précédente si quelque
chose cloche. Zéro stress, zéro downtime prolongé.

## 📋 Prérequis

- Linux x86_64 — Debian/Ubuntu ou RHEL/Rocky/Alma
- Accès root
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
