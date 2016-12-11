---
layout: post
title: "Rails on CentOS"
date: 2015-04-02 00:00:00 +0300
intro: "Хоть сам я люблю больше Debian, часто по работе мне приходится поднимать сервера на CentOS для приложений на Rails. С каждым разом я все больше понимал, что мне не хватает чек-листа для ускорения процесса. В последний раз я решил не ограничиваться чек-листом и описал процесс разворачивания сервера полностью."
categories: ru
tags: linux debian ruby rails
---

## Соглашения

В качестве имени пользователя, от которого работает приложение мы будем использовать deploy. Я пробовал много разных имен за свою практику администрирования, но потом остановился именно на этом. Ведь не зря оно по дефолту прописано в конфигах capistrano.

Рабочая директория приложения у нас будет `/var/www/app`, где app - название вашего приложения. Тут все просто. Раньше я деплоил и в `/www/app` и в `/home/deploy/apps/app`. Но когда пришлось настраивать SELinux, я понял, что лучше не отходить от правил и класть файлы для веб-сервера туда, где они должны быть изначально, а не менять потом контексты и правила.

## Установка CentOS и первичная настройка

Первым делом нам необходимо установить CentOS на виртуальную машину. В моем случае для виртуализации используется VMWare vSphere, поэтому, предварительно монтируем образ CentOS для сетевой установки и запускаем машину. В процессе установки в качестве URL используем `http://mirror.yandex.ru/centos/6.6/os/x86_64/`. На экране списка пакетов для установки выбираем minimal.

После успешной установки обновляем систему.

```
yum upgrade
```

Добавляем пользователя, под которым будет работать наше приложение.

```
useradd -m -s /bin/bash deploy
passwd deploy
```

Разрешаем пользователю deploy использовать sudo без пароля.

```
visudo
```

```
deploy ALL=(ALL) NOPASSWD: ALL
```

Если там есть следующая строчка, то комментирум ее, чтобы иметь возможность запускать sudo из скриптов для бекапа, а так же через capistrano.

```
# Defaults requiretty
```

Теперь можно сделать `logout` и остальные действия выполнять по ssh.

Закинем наш ssh-ключ на сервер. Это необходимо для того, чтобы заходить без пароля и в будущем деплоить приложение черзе capistrano. В качестве IP я буду использовать 10.10.10.10, вы подставляете свой.

```
ssh-copy-id deploy@10.10.10.10
```

Подключаемся по ssh.

```
ssh deploy@10.10.10.10
```

Сразу получим права рута, чтобы каждый раз не писать sudo.

```
sudo -s
```

Запрещаем руту логиниться по ssh.

```
vi /etc/ssh/sshd_config
```

```
PermitRootLogin no
```

```
service sshd restart
```

Устанавливаем самые необходимые пакеты.

```
yum install epel-release policycoreutils-python git screen
yum groupinstall 'Development Tools'
```

## Настройка iptables

```
iptables -F
iptables -N LOGGING
iptables -A LOGGING -m limit --limit 5/min -j LOG --log-prefix "IPTABLES: " --log-level 7
iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p icmp --icmp-type 8 -j ACCEPT
iptables -A INPUT -j LOGGING
iptables -A INPUT -j REJECT
iptables -A FORWARD -j LOGGING
iptables -A FORWARD -j REJECT
iptables -A OUTPUT -j ACCEPT
iptables-save > /etc/sysconfig/iptables
```

## Установка Nginx

```
yum install nginx
chkconfig nginx on
service nginx start
```

Сгенерируем на первое время self-signed SSL-сертификат, чтобы у нас работал HTTPS.

```
mkdir -p /etc/nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/self-signed.key -out /etc/nginx/ssl/self-signed.crt
```

Теперь удалим дефолтные хосты и добавим свой. Вместо app подставляйте название своего приложения.

```
rm /etc/nginx/conf.d/*
vi /etc/nginx/conf.d/app.conf
```

```nginx
upstream app_unicorn {
    server unix:/var/www/app/current/tmp/sockets/unicorn.sock fail_timeout=0;
}

server {
    server_name localhost;

    listen 80;
    listen 443 ssl;

    ssl_certificate /etc/nginx/ssl/self-signed.crt;
    ssl_certificate_key /etc/nginx/ssl/self-signed.key;

    client_max_body_size 100m;

    root       /var/www/app/current/public;
    error_log  /var/log/nginx/app_error.log;
    access_log /var/log/nginx/app_access.log;

    error_page 404             /404.html;
    error_page 500 502 503 504 /50x.html;

    location /assets {
        access_log off;
        expires 30d;
    }

    location / {
        try_files $uri @app;
    }

    location @app {
        proxy_pass http://app_unicorn;
        proxy_set_header Host $http_host;
        proxy_set_header Referer $http_referer;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_redirect off;
    }
}
```

## Установка Redis

С приходом Rails 4.2 рекомендую использовать его всем, как минимум, из-за возможности асинхронной отправки почты через Resque или Sidekiq. Так же пригодится для ActiveJob.

```
yum install redis
chkconfig redis on
service redis start
```

## Установка PostgreSQL

Для начала открываем файл `/etc/yum.repos.d/CentOS-Base.repo` и добавляем в секции `base` и `updates` следующую строку. Это необходимо, чтобы нам не предлагались старые версии PostgreSQL из базового репозитория.

```
exclude=postgresql*
```

Устаналвиваем PostgreSQL.

```
yum localinstall http://yum.postgresql.org/9.4/redhat/rhel-6-x86_64/pgdg-centos94-9.4-1.noarch.rpm
yum install postgresql94-server postgresql94-devel
service postgresql-9.4 initdb
chkconfig postgresql-9.4 on
service postgresql-9.4 start
```

Правим конфиг, прописывая метод аутентификации md5 для подключений по tcp. Странно, почему разработчики сразу так не сделали. В Debian именно так, там мне этот файл править не приходится.

```
vi /var/lib/pgsql/9.4/data/pg_hba.conf
```

```
# IPv4 local connections:
host    all             all             127.0.0.1/32            md5
# IPv6 local connections:
host    all             all             ::1/128                 md5
```

Добавляем пользователя базы данных с правами на логин и создание БД.

```
su - postgres -c 'psql'
```

```
CREATE USER app PASSWORD 'password' CREATEDB LOGIN;
```

## Установка RVM

Обратите внимание, что теперь все делается от пользователя deploy. Поэтому если вы все еще под рутом, самое время нажать `^D` или сделать `logout`.

```
cd
gpg --keyserver hkp://keys.gnupg.net --recv-keys 409B6B1796C275462A1703113804BB82D39DC0E3
\curl -sSL https://get.rvm.io | bash -s stable
source ~/.profile
rvm install 2.2
rvm use 2.2 --default
gem install bundler
bundle config build.pg --with-pg-config=/usr/pgsql-9.4/bin/pg_config
```

Последняя строчка может вам сэкономить кучу времени.

## Установка Runit

Runit позволяет из любого процесса сделать демон. Он нужен для того, чтобы не писать свои init.d-скрипты для unicorn и resque. К тому же, он умеет автоматом перезапускать сервисы при их падении, делать ротацию логов и следить за потреблением ресурсов каждым из процессов. К сожалению, в отличие от того же Debian, в репозиториях CentOS нет этого пакета. Собираем его сами. Опять же, делаем это под обычным пользователем.

```
sudo yum install rpmdevtools git glibc-static
cd
git clone https://github.com/imeyer/runit-rpm runit-rpm
cd ./runit-rpm
./build.sh
sudo rpm -i ~/rpmbuild/RPMS/*/*.rpm
```

## Демон для Unicorn

```
sudo mkdir -p /etc/sv/unicorn
sudo touch /etc/sv/unicorn/run
sudo chmod +x /etc/sv/unicorn/run
sudo vi /etc/sv/unicorn/run
```

```
#!/bin/sh
exec 2>&1
export RAILS_ENV=production
export SECRET_KEY_BASE= # use `bundle exec rake secret`
USER=deploy
APP_ROOT=/var/www/app/current
cd $APP_ROOT
exec chpst -u $USER /home/$USER/.rvm/wrappers/ruby-2.2.0@global/bundle exec unicorn -E $RAILS_ENV -c $APP_ROOT/config/unicorn.rb
```

Сам SECRET_KEY_BASE можно получить, выполнив `bundle exec rake secret` в директории приложения, либо локально, либо на самом сервере. Хранение его в репозитории является плохой практикой.

Unicorn при таком способе запуска не должен демонизироваться, то есть никаких pid-файлов и перенаправлений вывода. Пример правильного конфига ниже.

```ruby
APP_PATH = File.expand_path('../../', __FILE__)

working_directory APP_PATH
listen            APP_PATH + '/tmp/sockets/unicorn.sock'
worker_processes  2
timeout           30
preload_app       true

before_exec do |server|
  ENV['BUNDLE_GEMFILE'] = APP_PATH + '/Gemfile'
end

before_fork do |server, worker|
  ActiveRecord::Base.connection.disconnect! if defined?(ActiveRecord::Base)
  Resque.redis.quit if defined?(Resque)
  sleep 1
end

after_fork do |server, worker|
  ActiveRecord::Base.establish_connection if defined?(ActiveRecord::Base)
  Resque.redis = 'localhost:6379' if defined?(Resque)
end
```

Скрипт для ротации логов.

```
sudo mkdir -p /etc/sv/unicorn/log
sudo touch /etc/sv/unicorn/log/run
sudo chmod +x /etc/sv/unicorn/log/run
sudo vi /etc/sv/unicorn/log/run
```

```
#!/bin/sh
LOG_FOLDER=/var/log/unicorn
mkdir -p $LOG_FOLDER
exec svlogd -tt $LOG_FOLDER
```

## Демон для Resque

Resque нам нужен, чтобы обслуживать задания ActiveJob и отправлять почту асинхронно.

```
sudo mkdir -p /etc/sv/resque
sudo touch /etc/sv/resque/run
sudo chmod +x /etc/sv/resque/run
sudo vi /etc/sv/resque/run
```

```
#!/bin/sh
exec 2>&1
export RAILS_ENV=production
USER=deploy
APP_ROOT=/var/www/app/current
cd $APP_ROOT
exec chpst -u $USER /home/$USER/.rvm/wrappers/ruby-2.2.0@global/bundle exec rake resque:work QUEUES=* TERM_CHILD=1
```

Скрипт для ротации логов.

```
sudo mkdir -p /etc/sv/resque/log
sudo touch /etc/sv/resque/log/run
sudo chmod +x /etc/sv/resque/log/run
sudo vi /etc/sv/resque/log/run
```

```
#!/bin/bash
LOG_FOLDER=/var/log/resque
mkdir -p $LOG_FOLDER
exec svlogd -tt $LOG_FOLDER
```

Сделаем копию наших скриптов и добавим наши новоиспеченные демоны в автозагрузку. При этом они сразу будут запущены.

```
sudo cp -r /etc/sv/unicorn /etc/sv/app_unicorn
sudo ln -s /etc/sv/app_unicorn /etc/service/
sudo cp -r /etc/sv/resque /etc/sv/app_resque
sudo ln -s /etc/sv/app_resque /etc/service/
```

## Деплой приложения

Заходим на сервер по SSH и для удобства добавляем переменную среды.

```
echo 'export RAILS_ENV=production' >> ~/.bash_profile
```

Генерируем ключ и добавляем его в GitLab/GitHub.

```
ssh-keygen
cat /home/deploy/.ssh/id_rsa.pub
```

Если ваше приложение требует какие-то специфичные пакеты, самое время их поставить. Например, если вы используете гемы rmagick или paperclip для генерации превьюшек, то они требуют установленный ImageMagick. Как минимум, нам нужен NodeJS, чтобы работал rake `assets:precompile`.

```
sudo yum install nodejs ImageMagick-devel
```

Создаем на сервере директорию для приложений и устанавливаем ей правильный контекст SELinux.

```
sudo mkdir -p /var/www
sudo chown deploy:deploy /var/www
sudo chcon -t httpd_sys_content_t /var/www/
```

Если у вас в linked_files прописан `config/database.yml`, то сразу создадим его, в противном случае получим ошибку во время деплоя.

```
mkdir -p /var/www/app/shared/config
vi /var/www/app/shared/config/database.yml
```

Для деплоя я использую Capistrano. Пример конфигурационного файла `config/deploy.rb`.

```ruby
lock '3.4.0'

set :application, 'app'
set :repo_url, "git@bitbucket.org:user/#{fetch(:application)}.git"
set :deploy_to, "/var/www/#{fetch(:application)}"
set :linked_files, fetch(:linked_files, []).push('config/database.yml')
set :linked_dirs, fetch(:linked_dirs, []).push('bin', 'log', 'tmp/pids', 'tmp/cache', 'tmp/sockets', 'vendor/bundle', 'public/uploads')
set :bundle_binstubs, -> { shared_path.join('bin') }
set :keep_releases, 3

namespace :deploy do
  %w[unicorn resque].each do |service|
    namespace service do
      %w[up down restart status].each do |command|
        desc "#{command.capitalize} #{service}"
        task command do
          on roles(:app) do
            execute "sudo sv #{command} #{fetch(:application)}_#{service}"
          end
        end
      end
    end
  end

  after :finished, 'unicorn:restart'
  after :finished, 'resque:restart'
end
```

Запускам процесс выкатки.

```
cap production deploy
```

Теперь можно зайти через бразуер и проверить, все ли работает. Если что-то пошло не так, идем изучать логи.

```
tail /var/www/app/current/log/production.log
tail /var/log/unicorn/current
tail /var/log/nginx/app_error.log
tail /var/log/audit/audit.log
```

# Настройка SELinux

Если команда `cat /var/log/audit/audit.log | grep nginx` выдает какие-либо сообщения, значит SELinux блокирует действия веб-сервера.

```
sudo -s
cd /var/log/audit
grep nginx /var/log/audit/audit.log | audit2allow -M nginx && semodule -i nginx.pp
```

Если это не дало результата, запустите команду еще раз (предварительно попытавшись зайти на сайт, чтобы в логах появилось сообщение об ошибке).

На этом базовая настройка сервер закончена, в результате на 80 порту вы должны получить работающее приложение на Rails.
