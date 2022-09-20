# Homeserver Installator 🚀

## 💻 Requirements:

- Ubuntu 20.04 or Later / Debian 9 or Later
- Raspberry PI 3/4 >= 2Go RAM or equivalent VPS/Machine

## 🚧 Installation :

Run those commands in console as root or with sudo :

```sh
$> git clone https://github.com/Harkhenon/homeserver.git --branch installation
$> cd homeserver
$> (sudo) bash ./install
```

❗ You need to be in sudoers file to run commands, take care to create your own account ❗

It'll ask you for domain name and MySQL root password.

Installator will download and install automatically the panel, don't panic if installation seems to be freezed, just wait and see attentively final informations in console!

## ⚠️ Raspberry PI Users ⚠️

When script install some packages, maybe you will be asked to reboot the system to install the new kernel.

-> <u>Two choices :</u>

1.) Type "Enter" when asked, and continue the installation

2.) Stop the script with `CTRL+C`, reboot the system and start the installation script again.