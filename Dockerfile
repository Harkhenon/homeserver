FROM ubuntu:20.04

ENV DEBIAN_FRONTEND noninteractive

WORKDIR /
RUN apt-get update && apt-get upgrade -y && \
apt-get install -y ubuntu-server && \
apt-get install -y zip && \
apt-get install -y apache2 mariadb-server bind9 && \
apt-get install -y php7.4 php7.4-fpm php7.4-curl php7.4-mbstring php7.4-dom php7.4-simplexml php7.4-zip && \
apt-get install -y fail2ban && \
apt-get install -y phpmyadmin && \
a2enmod proxy_fcgi setenvif && \
a2enconf php7.4-fpm && \
apt-get install -y curl && \
curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
apt-get install -y nodejs && \
npm install --global yarn && \
groupadd homeserver && \
useradd homeserver -g homeserver -b /usr/share/homeserver && \
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer && \
bash /etc/init.d/mysql start && \
mysql -e "CREATE USER 'homeserver'@'localhost' IDENTIFIED BY 'homeserver';" && \
mysql -e "CREATE DATABASE IF NOT EXISTS homeserver" && \
mysql -e "GRANT ALL ON homeserver.* TO 'homeserver'@'localhost';" && \
mysql -e "FLUSH PRIVILEGES;" && \
mkdir /usr/share/homeserver && \
chown -R homeserver:homeserver /usr/share/homeserver


EXPOSE 6256
VOLUME /usr/share/homeserver
