---
layout: post
title: "Стек для веб-разработки на Vagrant"
date: 2013-02-01 00:00:00 +0400
intro: "Сегодня я расскажу вам про Vagrant – очень удобную штуку, которой следует обзавестись каждому backend-разрабочику. И о том, как все это настроить."
categories: dev
tags: vagrant
---

Итак, Vagrant представляет собой надстройку над системами виртуализации и делает работу с ними намного удобнее, параллельно расширяя функционал. Для меня существует несколько причин, по которым я пришел к использованию виртуальных машин для разработки:

* Инкапсуляция сред. Если проект большой, то я выделяю для него отдельную виртуальную машину, в результате чего получаю набор только необходимого мне ПО нужных версий. Ведь часто бывает, когда работаешь над несколькими проектами, каждый из них просит свою версию ПО. Vagrant решает эту проблему. К тому же, пропадает необходимость устанавливать на основную машину целую солянку из ПО вроде apache, php, mysql, postgresql и так далее.
* Идентичность окружений. Часто бывает так, когда что-то отлично работает локально, но на продакшене не хочет ни в какую. Причин этому может быть много, но чаще всего это происходит из-за различий в версиях и конфигурациях софта. Еще бывает такое, что под вашу основую ОС вообще не существует пакета с нужным ПО, и все что вам остается - это заниматься компилированием под свою платформу. Здесь виртуализация вообще ваш спаситель.

## Настройка Vagrant

Приступим к настройке. Несмотря на то, что на боевых серверах я предпочитаю использовать Debian, для разработки мой выбор упал на Ubuntu Server, поэтому настройка будет рассмотрена на примере данного дистрибутива. Рассмотрим настройку следующего универсального стека:

* Nginx на фронтэнде
* Apache на бэкэнде
* PHP
* MySQL
* PostgreSQL

Немного слов о том, почему именно такой стек, зачем нам два веб-сервера и две базы данных. В первую очередь, нам нужна универсальность. Обычно я работаю над проектами, которые написаны на PHP и Ruby. И так уж заладилось, что основная масса PHP-проектов использует в качестве базы данных MySQL, а Ruby, в свою очередь, более прогрессивный PostgreSQL. Кто-то скажет, что можно было хотя бы обойтись одним nginx, одно тут вся соль в том, что проекты бывают разные, и если некоторые из них без труда заводятся под php-fpm, то есть и такие, в которых куча файлов .htaccess и их лень конвертировать в правила nginx.

В общем, давайте приступать. Для начала нам нужно скачать VirtualBox и Vagrant и установить их. После чего скачиваем образ виртуальной машины, здесь я рекомендую выбрать последную 64-разрядую версию.

Открываем консоль, переходим в рабочую папку и иницилизируем машину.

```
cd /Users/dlysenko/Vagrant
vagrant init ubuntu-server /Users/dlysenko/Vagrant/trusty-server-cloudimg-amd64-vagrant-disk1.box
```

Немного правим Vagrantfile, добавляя туда две строки для проброса портов:

```
config.vm.network "forwarded_port", guest: 80, host: 8080
config.vm.network "forwarded_port", guest: 5432, host: 5432
```

Увы, 80-ый порт хоста мы использовать не можем, такие ограничения, по крайней мере в OS X. Поэтому используется 8080.

Затем запускаем машину и логинимся по ssh.

```
vagrant up
vagrant ssh
```

Получаем права root и обновляем систему.

```
sudo -s
aptitude update
aptitude upgrade
```

Устанавливаем необходимые пакеты

```
aptitude install nginx apache2 php5 php5-mysql php5-mcrypt mysql-server libmysqlclient-dev postgresql postgresql-server-dev-9.3 postgresql-contrib
```

Такие пакеты, как `libmysqlclient-dev` и `postgresql-server-dev-9.3` нужны для компиляции соответствующих гемов.

Настраиваем MySQL-сервер.

```
mysql_install_db
mysql_secure_installation
```

Настраиваем PostgreSQL.

```
sudo -u postgres psql
create user admin password 'password' createdb superuser;
create database db_name owner admin;
```

Меняем порт апача с 80 на 8080 в соответствующем файле.

```
vi /etc/apache2/ports.conf
```

Создаем новый виртуалхост-файл и открываем его.

```
cp /etc/apache2/sites-available/000-default.conf /etc/apache2/sites-available/000-backend.conf
vi /etc/apache2/sites-available/000-backend.conf
```

Вставляем туда следующий код.

```
ServerName ubs
<Directory /vagrant/>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
</Directory>

<VirtualHost *:8080>
        ServerAdmin admin@localhost
        VirtualDocumentRoot /vagrant/%0/www
        ErrorLog ${APACHE_LOG_DIR}/error.log
        CustomLog ${APACHE_LOG_DIR}/access.log combined
</VirtualHost>
```

Как видно, здесь мы используем директиву VirtualDocumentRoot, которая нам позволит не редкатировать каждый раз конфиги при добавлении нового сайта. Напомню, что все файлы, которые содержатся в той же директории, где и Vagrantfile - отражаются в /vagrant.

Включаем нужны модули, подключаем созданный конфиг и отключаем дефлотный.

```
a2enmod vhost_alias
rewrite a2dissite 000-default
a2ensite 000-backend
php5enmod mcrypt
```

Здесь мы еще подключаем mcrypt. Он пригодится для фреймворка Laravel.

Пришло время посмотреть в конфиги nginx.

```
vi /etc/nginx/sites-available/default
```

Заменяем дефолтный локейшен на следующий:

```
location / {
    proxy_pass http://127.0.0.1:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

Перезапускаем оба сервера.

```
service apache2 reload
service nginx restart
```

Теперь, создаем рядом с Vagrantfile папку, под названием, например, test.dev, внутри которой создаем директорию www. Кладем туда файл index.php со следующим содержанием.

```
<?php

phpinfo();
```

На своей машине открываем файл hosts и добавляем туда новую запись.

```
127.0.0.1 test.dev
```

Поздравляю! Теперь ваш сайт должен быть доступен по адресу `test.dev:8080`, главное не забыть запустить Vagrant.
