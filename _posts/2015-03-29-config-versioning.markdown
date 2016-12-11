---
layout: post
title: "Добавляем версионность для конфигов сервера"
date: 2015-03-29 00:00:00 +0300
intro: "Не раз уже у меня бывали случаи, когда что-то сломалось на сервере, а по какой причине это произошло – непонятно. И довольно часто, проблема заключалась в том, что кто-то другой просто поправил конфиги. Сегодня мы рассмотрим способ добавления версионности для конфигурации сервера, чтобы забыть про подобные проблемы."
categories: ru
tags: backup git
---

Само решение заключается в том, что мы будем использовать систему контроля версий git и сервис bitbucket. Идея стара как мир, но почему-то у немногих доходят руки до ее реализации.

Заходим на наш сервер под рутом и создаем простой скрипт.

```
touch /bin/gbackup
chmod +x /bin/gbackup
vi /bin/gbackup
```

```
#!/bin/sh

SERVER_NAME=`uname -n`
DATE=`date +%Y%m%d%H%M%S`
BACKUP_PATH=$1
USER=`whoami`
EMAIL="no-reply@$SERVER_NAME"

if [ -z "$BACKUP_PATH" ]; then
    echo "No backup path supplied"
    exit 1
fi

if [ "$USER" = "root" ]; then
    echo "You sholdn't be logged as root"
    exit 1
fi

git config --global user.name "$SERVER_NAME"
git config --global user.email "$EMAIL"

mkdir -p $BACKUP_PATH && cd $BACKUP_PATH

if [ ! -d "$BACKUP_PATH/.git" ]; then
    git init
fi

sudo cp --parents /bin/gbackup .
sudo cp --parents /var/spool/cron/crontabs/$USER .
sudo cp --parents /etc/sudoers .
sudo cp --parents /etc/iptables .
sudo cp --parents /etc/nginx/sites-available/* .
sudo cp --parents /etc/sv/app_unicorn/run .
sudo cp --parents /etc/sv/app_unicorn/log/run .
sudo cp --parents /etc/sv/app_resque/run .
sudo cp --parents /etc/sv/app_resque/log/run .

sudo chown -R $USER:$USER .

git add . && git commit -a -m $DATE && git push -u origin master
```

Немного слов о самом скрипте. В первую очередь, в данном варианте он для Debian. Именно по таким путям в Debian лежат конфиги, по крайней мере у меня. В CentOS эти пути немного отличаются. Он просто создает директорую в домашенй папке пользователя, которого, кстати, заранее нужно прописать в sudoers с флагом NOPASSWD. Затем происходит копирование необходимых нам конфигов, за которыми нам нужно следить. Обратите внимание, что скрипт также копирует сам себя – таким образом мы будем видеть, как изменялся список конфигов. После всего скрипт пытается закоммитить изменения и отправить их в удаленный репозиторий.

В итоге, нам остается создать git-репозиторий и прописать наш скрипт в crontab.

```
mkdir -p /home/deploy/.gbackup
cd /home/deploy/.gbackup
git init
git remote add origin git@bitbucket.org:user_name/repo_name.git
```

Сделаем скрипт выполняемым по расписанию. Делать это необходимо уже от имени вашего пользователя, в моем случае это deploy.
```
crontab -e
```

```
MAILTO=your_email@example.com
0 */6 * * * /bin/gbackup /home/deploy/.gbackup
```

Теперь вы можете не бояться за свои конфиги. В любой момент вы можете зайти в git-репозиторий и отследить все изменения, которые происходили с конфигурацией вашего сервера.
