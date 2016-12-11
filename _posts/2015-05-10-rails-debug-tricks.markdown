---
layout: post
title: "Пара хаков для отладки приложений на Rails"
date: 2015-05-10 00:00:00 +0300
intro: "Сегодня поговорим о замечательном веб-сервере Unicorn и дебаге приложений на Rails в целом. Я постараюсь осветить несколько хаков, которые помогут вам в этом нелегком деле."
categories: backend
tags: ruby unicorn
---

Итак, не буду обяснять элементарные вещи и приведу сразу код.

Первый хак касается любых приложений на Rails и позволяет на отлавливать запросы, которые полняются слишком долго.

## Поиск тяжелых запросов

Создаем новый инициализатор `config/initializers/log_before_timeout.rb`.

```ruby
class LogBeforeTimeout
  def initialize(app)
    @app = app
  end

  def call(env)
    thr = Thread.new do
      sleep(10)
      unless Thread.current[:done]
        path = env['PATH_INFO']
        qs = env['QUERY_STRING']
        path = "#{path}?#{qs}" unless qs.blank?
        Rails.logger.warn "Too lazy #{path}"
      end
    end
    @app.call(env)
  ensure
    thr[:done] = true if thr
  end
end
```

Подключаем его в нашем конфиге `config/application.rb`.

```ruby
config.middleware.use 'LogBeforeTimeout'
```

Собственно, суть хака заключается в том, что он позволяет вам находить запросы, которые отрабатывают больше 10 секунд. Это что-то вроде slow query log в mysql, только для всего приложения в целом. Суть должна быть понятна из кода. На каждый запрос запускается поток, который спит 10 секунд. И если он не был убит (что значит, что запрос еще не отработал), пишется сообщение в лог-файл.

## Бектрейс для убитых воркеров

Второй хак касается исключительно сервера Unicorn. У этого сервера в настройках задается значение тайм-аута, по достижению которого воркер должен быть убит, то есть процесс считается зависшим. И в таких случаях обычно возникает потребность в том, чтобы узнать, почему именно был убит конкретный процесс. Сделать выводе нам поможет бектрейс. Итак, как же его получить. Для начала правим конфиг сервера и добавляем несколько строк кода в сецию `after_fork`.

```ruby
['TERM', 'USR2'].each do |sig|
  Signal.trap(sig) do
    pid = Process.pid
    puts "[#{pid}] Received #{sig} at #{Time.now}. Dumping threads:"
    Thread.list.each do |t|
      trace = t.backtrace.join("\n[#{pid}] ")
      puts "[#{pid}] #{trace}"
      puts "[#{pid}] ---"
    end
    puts "[#{pid}] -------------------"
    exit unless sig == 'USR2'
  end
end
```

Данный код на сигналы TERM и USR2 вешает обработчий, который по их приходу выкидывает текущий бектрейс. То есть, теперь вы можете вручную послать сигнал воркеру и он вам покажет, в каком месте когда он сейчас работает.

Теперь нам остается воспользоваться перелстями метапрограммирования и переопределить один из методов веб-сервера. Сделать это можно, в принципе, в любом месте.

```ruby
class Unicorn::HttpServer
  def murder_lazy_workers
    next_sleep = @timeout - 1
    now = Time.now.to_i
    WORKERS.dup.each_pair do |wpid, worker|
      tick = worker.tick
      0 == tick and next # skip workers that haven't processed any clients
      diff = now - tick
      tmp = @timeout - diff

      # monkey patch begins here
      if tmp < 2
        logger.error "worker=#{worker.nr} PID:#{wpid} running too long " \
                     "(#{diff}s), sending TERM"
        kill_worker(:TERM, wpid)
      end
      # end of monkey patch

      if tmp >= 0
        next_sleep > tmp and next_sleep = tmp
        next
      end
      next_sleep = 0
      logger.error "worker=#{worker.nr} PID:#{wpid} timeout " \
                   "(#{diff}s > #{@timeout}s), killing"
      kill_worker(:KILL, wpid) # take no prisoners for timeout violations
    end
    next_sleep <= 0 ? 1 : next_sleep
  end
end
```

Здесь мы патчим метод, который занимается убийством зависших воркеров. Суть модификации заключается в том, что за 2 секунды до таймаута (когда будет послан сигнал KILL) воркеру посылается сигнал TERM. Когда воркер получает сигнал TERM, он выкидывает в stdout свой бектрейс. Таким образом мы в логах будем всегда видеть, в каком месте кода воркер был убит.

На это сегодня все. Представленные хаки иногда могут очень даже облегчить поиск проблемных мест в вашем коде.
