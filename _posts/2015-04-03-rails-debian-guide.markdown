---
layout: post
title: "Rails on Debian"
date: 2015-04-03 00:00:00 +0300
intro: "Совсем недавно я выкладывал руководство по настройке сервера на CentOS для запуска Rails-приложения. Такие вещи мне приходится часто делать по работе. Там, где есть выбор, я беру в качестве сервера Debian. Сегодня я покажу, как настроить правильный веб-сервер для вашего приложения на Rails."
categories: ru
tags: linux centos ruby rails
---

Начнем с того, что нам нужно определиться, где вообще взять серверные мощности. Для себя я выбрал [Digital Ocean](https://www.digitalocean.com/?refcode=3506a3dbde61), как лучшее соотношение цены и качества. Обычно, если не известны заранее планируемая нагрузка, я беру самый слабый инстанс за 5$. За это деньги мы можем получить одноядерный процессор, 512MB ОЗУ и SSD-диск на 20GB. Этого вполне хватит на первых порах, если все правильно настроить. В будущем вы сможете в 1 клик увеличить мощность своего сервера, поэтому можно не бояться продешевить.

Итак, регистраруемся в указанном сервисе по моей [реферальной ссылке](https://www.digitalocean.com/?refcode=3506a3dbde61) и при первой оплате получаем $10 бонус на счет. Заводим новый инстанс. Выбираем Амстердам в качестве дата-центра, как самый ближайший к Москве из доступных, а так же Debian 7.0 x64 в качестве ОС. Сразу выбираем свой SSH-ключ.

## Первичная настройка

Итак, ваш инстанс создан, запущен и вы знаете его IP. Пора коннектиться!

```
ssh root@10.10.10.10
```

Если вы выбрали правильный ssh-ключ при создании инстанса, то вы сразу должны попасть на сервер.

Сразу обновляем систему.

```
apt-get update
apt-get upgrade
```

Установим самые необходимые пакеты.

```
apt-get install curl git screen sudo
```

Установим любимый редатор. На самом деле в системе уже есть vi. Но это именно vi, а не vim. В современных системах, когда вы запускаете vi, на самом деле запускается vim. Это просто алиас.

```
apt-get install vim
echo 'export EDITOR=vi' >> ~/.bash_profile
```

Создаем пользователя deploy, под которым будет работать наше приложение. Да, здесь в отличии от CentOS нужно обязательно указать флаги, иначе рискуем получить юзера с интерпретатором sh и без домашней директории. Однажды я так обжегся.

```
useradd -m -s /bin/bash deploy
passwd deploy
```

Редактируем файл sudoers. Нам необходимо туда добавить нашего пользователя deploy с флагом NOPASSWD.

```
visudo
```

```
# User privilege specification
root    ALL=(ALL:ALL) ALL
deploy  ALL=(ALL:ALL) NOPASSWD: ALL
```

На этом манипуляции под рутом заканчиваем.

```
logout
```

Скопируем наш ssh-ключ. Если у вас нет утилиты ssh-copy-id, вы можете воспользоваться способом, описанным в [прошлой статье](http://1ys3nko.com/blog/rails-on-centos) или же сделать это вообще вручную.

```
ssh-copy-id deploy@10.10.10.10
ssh deploy@10.10.10.10
```

Начнем с того, что запретим руту логиниться по ssh в целях безопасности. Так же поменяем ssh-порт на 2222, чтобы, по крайней мере, нас не напрягали боты, которые брутофорсят 22 порт.

```
sudo vi /etc/ssh/sshd_config
```

```
Port 2222
PermitRootLogin no
```

Перезапускаем sshd.

```
sudo service ssh restart
logout
```

Пробуем залогиниться снова.

```
ssh deploy@10.10.10.10 -p 2222
```

Сразу получим права рута, чтобы не писать sudo перед каждой командой.

```
sudo -s
```

## Настройка локали

```
dpkg-reconfigure locales
```

## Синхронизация времени

```
dpkg-reconfigure tzdata
ntpdate pool.ntp.org
```

## Подключение файла подкачки

Так как у нас мало ОЗУ, создадим файл подкачки и добавим его в автозагрузку.

```
dd if=/dev/zero of=/swapfile bs=1k count=1024k
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Сделаем небольшой твик, чтобы файл подкачки начинал использоваться, когда в системе остается меньше 10% свободной памяти. Напоминаю, что по умолчанию это значение равно 60, что не лезет ни в какие рамки, хоть у нас и SSD.

```
echo 'vm.swappiness=10' >> /etc/sysctl.conf
sysctl -p
```

## Настройка iptables

```
iptables -F
iptables -N LOGGING
iptables -A LOGGING -m limit --limit 5/min -j LOG --log-prefix "IPTABLES: " --log-level 7
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 2222 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p icmp --icmp-type 8 -j ACCEPT
iptables -A INPUT -j LOGGING
iptables -A INPUT -j REJECT
iptables -A FORWARD -j LOGGING
iptables -A FORWARD -j REJECT
iptables -A OUTPUT -j ACCEPT
iptables-save > /etc/iptables
```

Добавим загрузку правил при запуске системы.

```
vi /etc/network/if-pre-up.d/iptables
```

```
#!/bin/sh
/sbin/iptables-restore < /etc/iptables
```

## Установка Nginx

```
apt-get install nginx
```

Генерируем self-signed сертификат для SSL.

```
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/self-signed.key -out /etc/nginx/ssl/self-signed.crt
```

Создаем новый виртуальный хост для нашел приложения. Замение app на название своего приложения.

```
vi /etc/nginx/sites-available/app
```

Сам конфиг можно посмотреть в прошлой [статье для CentOS](/blog/rails-on-centos).

Удаляем дефолтный хост и подключаем новоиспеченный, затем перезапускаем сервер.

```
rm /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/
service nginx restart
```

## Установка Redis

Сам Redis лично мне необходим для Resque, которые в свою очередь необходим как минимум для асинхронной отправки писем и множества других задач, которые должны выполняться в фоне.

```
apt-get install redis-server
```

## Установка PostgreSQL

Добавляем репозиторий, чтобы иметь возможность поставить самую свежую версию.

```
echo 'deb http://apt.postgresql.org/pub/repos/apt/ wheezy-pgdg main' > /etc/apt/sources.list.d/pgdg.list
```

Получаем ключ, обновляем список пакетов и устанавливаем нашу СУБД. Не забываем про dev-пакет, который необходим для корректной установки гема pg в будущем.

```
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt-get update
apt-get install postgresql-9.4 postgresql-server-dev-9.4
```

Создаем нашего пользователя с правами на логин и создание БД.

```
su - postgres -c 'psql'
CREATE USER app PASSWORD 'password' CREATEDB LOGIN;
```

## Установка NodeJs

NodeJS нам будет необходим для компиляции ресурсов, без него деплой невозможен. Можно конечно использовать [therubyracer](https://github.com/cowboyd/therubyracer), но это не наш путь. Увы, NodeJS нет в репах Debian. С другой стороны использование сторонней репы дает шанс пользоваться последней версией ПО.

```
curl -sL https://deb.nodesource.com/setup | sudo bash -
apt-get install nodejs
```

## Установка Runit

В отличие от CentOS, этот пакет есть в репозиториях Debian. Радуемся и устанавливаем.

```
apt-get install runit
```

Скрипты запуска и пример конфга для Unicorn можно взять в [предыдущей статье](/blog/rails-on-centos).

## Установка RVM

RVM мы устанавливаем в single user mode, поэтому сначала убеждаемся, что мы находимся под пользователем deploy. 

```
cd
gpg --keyserver hkp://keys.gnupg.net --recv-keys 409B6B1796C275462A1703113804BB82D39DC0E3
\curl -sSL https://get.rvm.io | bash -s stable
source /home/deploy/.rvm/scripts/rvm
rvm install 2.2
rvm use 2.2 --default
gem install bundler
echo rvm_autoupdate_flag=0 >> ~/.rvmrc
```

## Деплой приложения

Сразу объявим переменную среды для пользователя deploy и забудем про нее.

```
echo 'export RAILS_ENV=production' >> ~/.bash_profile
```

Чтобы мы могли делать git clone с нашего сервера, нам нужен ssh-ключ. Тут есть два варианта. Первый вариант: генерируем новый ssh-ключ и и добавляем его в deploy keys нашего репозитория.

```
ssh-keygen
cat /home/deploy/.ssh/id_rsa.pub
```

Второй вариант немного проще. Мы можем просто использовать ssh agent forwarding. Выполняем команду на локальной машине:

```
ssh-add
```

Теперь ваш локальный ssh-ключ будет автоматом прокидываться на сервер во время деплоя через capistrano.

Создадим директорию для наших приложений и отдадим права на нее юзеру deploy.

```
mkdir /var/www
chown deploy:deploy /var/www
```

Теперь можно запускать `cap production deploy`. Если у вас возникают какие-либо проблемы, попробуйте воспользоваться конфигом из [руководства для CentOS](/blog/rails-on-centos).

## Заключение

На этом все. Если вы все сделали правильно, у вас должны были запуститься рельсы на 80 порту.

Некоторые шаги в статье описаны недостаточно подробно, например, деплой самого приложения через Capistrano. Статья подразумевает, что у вас уже есть какой-то опыт и вы сами справитесь с этим. Крайне рекомендую глянуть [предыдущую статья о настройке CentOS](https://cloud.digitalocean.com/settings/referrals), чтобы понимать, чем отличается администрирование двух разных дистрибутивов. Так же там есть некоторые полезные вещи, которые были опущены в данном руководстве.
