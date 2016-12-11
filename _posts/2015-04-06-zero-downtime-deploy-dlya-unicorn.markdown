---
layout: post
title: "Zero-downtime deploy для Unicorn"
date: 2015-04-06 00:00:00 +0300
intro: "Если ваш сайт крутится в продакшене, достаточно важно поддерживать максимальную его доступность. При небольшой посещаемости это не так важно. Но бывает, когда даже 5 секунд простоя критичны."
categories: devops
tags: ruby linux
---

Итак, сегодня разберем, как настроить zero-downtime deploy для сервера Unicorn в связке с супервизором Runit. На самом деле данный способ применим для любого супервизора, будь то Supervisord или Upstart.

По правде говоря, если написать простой init.d скрипт, то там все будет работать из коробки. Однако, мы хотим использовать супервизор. Сама суть такого способа деплоя заключается в том, что после выгрузки нового кода нам необходимо запустить новый мастер-процесс веб-сервера, при этом старый должен оставаться в работе. После того, как новый процесс запустит воркеров, старый можно выгружать. Так вот, просто так при использовании супервизора это не выйдет, так как при передаче сигнала USR2 создается новый процесс, который уже наш супервизор не может контроллировать. Но сегодня мной было найдено решение этой проблемы.

Итак, суть заключается в том, что нам нужен wrapper-скрипт для запуска нашего сервера. Он называется Unicorn Herder. Устанавливаем.

```
sudo apt-get install python-pip python-dev
sudo yum install python-pip python-devel
```

Первый вариант для Ubuntu/Debian. Второй для CentOS/Fedora/Amazon и других RPM-based дистрибутивов.

```
sudo pip install unicornherder
```

Теперь нам нужно немного изменить способ запуска нашел Unicorn.

```
vi /etc/sv/app_unicorn/run
```

```
#!/bin/sh
exec 2>&1
RAILS_ENV=production
USER=deploy
APP_ROOT=/var/www/app/current
export SECRET_KEY_BASE=your_key
cd $APP_ROOT
exec chpst -u $USER /home/$USER/.rvm/wrappers/ruby-2.2.0@global/bundle exec unicornherder -u unicorn -p tmp/pids/unicorn.pid -- -c $APP_ROOT/config/unicorn.rb -E $RAILS_ENV
```

Остается поправить конфиг самого сервера.

```ruby
APP_PATH = File.expand_path('../../', __FILE__)

working_directory APP_PATH
listen            APP_PATH + '/tmp/sockets/unicorn.sock'
pid               APP_PATH + '/tmp/pids/unicorn.pid'
worker_processes  2
timeout           30
preload_app       true

before_exec do |server|
  ENV['BUNDLE_GEMFILE'] = APP_PATH + '/Gemfile'
end

before_fork do |server, worker|
  ActiveRecord::Base.connection.disconnect! if defined?(ActiveRecord::Base)
  Resque.redis.quit if defined?(Resque)

  old_pid = "#{server.config[:pid]}.oldbin"
  if File.exists?(old_pid) && server.pid != old_pid
    begin
      Process.kill('QUIT', File.read(old_pid).to_i)
    rescue Errno::ENOENT, Errno::ESRCH
      # someone else did our job for us
    end
  end

  sleep 1
end

after_fork do |server, worker|
  ActiveRecord::Base.establish_connection if defined?(ActiveRecord::Base)
  Resque.redis = 'localhost:6379' if defined?(Resque)
end
```

Собственно, теперь можно перезапустить наш демон. Теперь при подаче сигнала USR2 посредством `sudo sv 2 app_unicorn` вы можете перезагружать ваш веб-сервер без приостановаления его работы.
