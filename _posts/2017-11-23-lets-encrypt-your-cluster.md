---
layout: post
title: Let's Encrypt и DNS Round Robin
date: 2017-11-23 12:28:00 +0300
categories: ru
tags: devops
intro: >
  Все уже давно знают про бесплатные SSL сертификаты от Let's Ecnrypt, но не все умеют их готовить. Особенно, когда дело касается кластера.

---

Итак, получить сертификат довольно просто. Первым делом нужно установить `certbot`. Для CentOS это репозиторий EPEL, который ставится через пакет `epel-release`. В случае Debian нужно подключить репозиторий `backports`.

```
$ sudo yum install certbot
```

Считаем, что ваш сайт уже функционирует. Делаем запрос на сертификат:

```
$ sudo certbot certonly -q --agree-tos --email info@example.com --webroot -w /var/www/your_app/current/public -d example.com -d www.example.com
```

Подключаем сертификат в nginx:

```
ssl_certificate         /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key     /etc/letsencrypt/live/example.com/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;

add_header Strict-Transport-Security "max-age=31536000";
add_header Content-Security-Policy "block-all-mixed-content";
```

Делает `sudo systemctl restart nginx` и наслаждаемся работой сайта по HTTPS.

Далее включаем автообновление:

```
$ crontab -e
```

```
0 6 * * * sudo certbot renew -q --allow-subset-of-names --post-hook 'sudo systemctl reload nginx'"
```

Это все прекрасно сработает, если у вас 1 сервер в кластере (то есть одна A запись в DNS). Дело в том, что робот Let's Encrypt ходит на указанный домен и проверяет наличие временного файла, который сам же и создает. Если у вас DNS Round Robin, робот будет попадать каждый раз на разные серверы, где сертификата может не оказаться. Поэтому для двух серверов можно work around, поправив конфиг nginx.

```
server {
    listen 80 default_server;

    server_name example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;

        try_files $uri @mirror;
    }

    location / {
        return 301 https://$host$request_uri;
    }

    location @mirror {
        if ($http_x_mirror_request) { return 404; }

        proxy_pass http://10.0.0.2:80;
        proxy_set_header Host $http_host;
        proxy_set_header X-Mirror-Request 1;
    }
}
```

На втором сервере делаем то же самое, заменив IP адреса. Итого, получается, когда DNS Round Robin вы делаете запрос с первого сервера, а DNS будет кидать робота на второй сервер, мы просто проксируем запрос.

Если же у вас больше чем 2 сервера, используте TXT записи для подтверждения владения доменом, Let's Encrypt такой способ поддерживает.
