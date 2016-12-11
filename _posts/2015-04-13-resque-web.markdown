---
layout: post
title: "Подключаем веб-интерфейс для Resque"
date: 2015-04-13 00:00:00 +0300
intro: "Часто бывает, что в приложении вылетают ошибки и ActiveJob не отрабатывает так, как нужно. В таком случае нам приходится задумываться о том, как дебажить. Самый простой способ посмотреть, почему ваш процесс умер - воспользоваться веб-интерфейсом, который предоставляет гем resque-web. И если в development-окружении все просто, то в production возникает вопрос - куда прилепить этот самый интерфейс."
categories: ru
tags: ruby linux
---

Для начала установим наш гем.

```
gem 'resque-web'
```

Создадим на сервере новый таск для runit.

```
mkdir -p /etc/sv/app_resque_web/
touch /etc/sv/app_resque_web/run
chmod +x /etc/sv/app_resque_web/run
vi /etc/sv/gearz_resque_web/run
```

```
#!/bin/sh
exec 2>&1
export RAILS_ENV=production
USER=deploy
APP_ROOT=/var/www/gearz/current
cd $APP_ROOT
exec chpst su - $USER -c "cd $APP_ROOT && bundle exec resque-web -F -L"
```

```
ln -s /etc/sv/gearz_resque_web /etc/service
```

Если вдруг вы используете прокси `http_proxy`, в случае ошибок попробуйте перед `bundle exec` добавить:

```
env -u http_proxy
```

Интерфейс запущен. Осталось его отобразить. Я решил для этого использовать виртуальный хост nginx на IP сервера, так как у меня он не используется для других целей.

Сначала создадим файл с доступами. Замениим username, password и salt на свои значения.

```
python -c "import crypt; print 'username' + ':' + crypt.crypt('password', 'salt')" > /etc/nginx/htpasswd
```

Остается добавить новый хост nginx, добавив к нему HTTP Basic Auth.

```
vi /etc/nginx/sites-available/app
```

```
server {
    server_name 10.10.10.10;

    listen 80;

    location / {
        auth_basic 'Resque';
        auth_basic_user_file /etc/nginx/htpasswd;
        proxy_pass http://127.0.0.1:5678;
    }
}
```

В нашем случае IP указан 10.10.10.10, замените его на свой. Либо можно использовать свой домен/поддомен.

Теперь вы можете зайти из бразуера по указанному адресу и посмотреть, что происходит с вашими фоновыми тасками.
