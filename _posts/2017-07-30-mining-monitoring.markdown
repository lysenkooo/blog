---
layout: post
title: Майнинг на Ubuntu и мониторинг
date: 2017-07-30 12:05:00 +0300
categories: ru
tags: html
intro: >
  Сегодня мы "хайпанем немножечко". В мае 2017 майнинг стал столь популярным, что уже у бабушек фермы с видеокартами начали вытеснять рассаду на балконах. И все это из-за сверхприбылей, которые в мае-июне позволяли окупать вложения за 3 месяца, даже с учетом диких наценок на комплектующие. Я тоже решил вспомнить молодость и собрать конструктор под названием ферма для майнинга. Но, как оказалось, это было самое простое. С софтом проблем оказалось много больше.
---

Кому просто интересны цифры, [они есть](https://eth.nanopool.org/account/0x837ddd8528fa1961e960704ca4ed5bcdf9603685).

![Etherium Rig on Ubuntu Linux](/assets/rig.jpg)

Хоть я и осилил 60 уроков "Соло на клавиатуре", много печатать по-прежнему не люблю. Поэтому коротко: все майнеры сидели на винде. Проблема номер один: если карточку перегнать, система начинает настолько дико тормозить, что даже перезагрузить машину становится довольно тяжело. Ну, и, проблема номер два: удаленно управлять кроме как через TeamViewer, по-сути, нечем. RDP как-то туго заводился, с учетом того, что к системе не было подключено монитора.

Выход был простым - попробовать Linux. После некоторого шаманства, я смог завести на машине Ubuntu Server 16.04, установил драйнера на карточки. Запустил майнер Claymore настроенный на NanoPool. Все работает – круто! Никакой винды, счастью нет предела. На машинку захожу через `ssh deploy@192.168.1.14` и смотрю все, что мне нужно.  Дальше началось шаманство с разгоном карточек NVIDIA, ведь бег разгона они дают так называемый Hashrate около 19 с карточки, а с разгоном около 23. Выяснилось, что разогнять можно `nvidia-smi`. Только вот эта штука требует запущенных иксов. А у нас Ubuntu Server. Окей, делаем workaround - запускаем в фоне иксы, и утилита отрабатывает. Правда, если вы до этого сгенерировали верный `Xorg.conf`. Даю по памяти +800Mhz как на винде в MSI Afterburner – хэшрейт намного ниже. Не понимаю в чем проблема. Методом тыка выяснется, что в линуксе чтобы дать эквивалент в +800 на винде, нужно выставить где-то +1500. И получаем те же заветные 23 мегахэша. Далее нужно сделать, чтобы все это дело запускалось при запуске системы.

Для этого создаем файл systemd `/lib/systemd/system/claymore.service`.

```
[Unit]
Description=Claymore Miner
After=network.target

[Service]
User=deploy
WorkingDirectory=/home/deploy/claymore
ExecStart=/home/deploy/claymore/start.sh
Restart=always
RestartSec=60

[Install]
WantedBy=multi-user.target
```

Пишем файлик `start.sh`.

```
#!/bin/sh

notify() {
    curl https://api.telegram.org/bot***/sendMessage -d "chat_id=***" -d "text=${1}"
}

EMAIL="crashcube@gmail.com"
ETH_WALLET="0x837ddd8528fa1961e960704ca4ed5bcdf9603685"
SC_WALLET="b77c4bdce8033e61a33352773156a91e385efa62f5a130bfa8fcca4f58559d5979ac158d52e6"
HOSTNAME=`uname -n`
SERVER_IPS=`ip -o -4 addr list | grep -v 127.0.0.1 | awk '{print $4}' | tr '\n' ' ' | sed -e 's/\s*$//'`

notify "Starting miner on ${HOSTNAME} located at ${SERVER_IPS}"

# overclock

sudo X :1 &

for i in $(seq 0 5); do
  sudo nvidia-settings --display :1 -a "[gpu:$i]/GPUFanControlState=1" -a "[fan:$i]/GPUTargetFanSpeed=80"
  sudo nvidia-settings --display :1 -a "[gpu:$i]/GPUMemoryTransferRateOffset[3]=1500"
  sudo nvidia-settings --display :1 -a "[gpu:$i]/GPUGraphicsClockOffset[3]=50"
  sleep 5
done

# start claymore

export GPU_FORCE_64BIT_PTR=0
export GPU_MAX_HEAP_SIZE=100
export GPU_USE_SYNC_OBJECTS=1
export GPU_MAX_ALLOC_PERCENT=100
export GPU_SINGLE_ALLOC_PERCENT=100

if [ -z "$SC_WALLET" ]; then
  COMMAND="./ethdcrminer64 -epool eth-eu1.nanopool.org:9999 -ewal ${ETH_WALLET}.${HOSTNAME}/${EMAIL} -epsw x -mode 1 -ftime 10 -tt -80 -ttli 75 -tstop 80 -r 1"
else
  COMMAND="./ethdcrminer64 -epool eth-eu1.nanopool.org:9999 -ewal ${ETH_WALLET}.${HOSTNAME}/${EMAIL} -epsw x -dcoin sia -dpool sia-eu1.nanopool.org:7777 -dwal ${SC_WALLET}/${HOSTNAME}/${EMAIL} -dpsw x -ftime 10 -tt -80 -ttli 75 -tstop 80 -r 1 -dcri 20 -ttdcr 70"
fi

notify "${COMMAND}"

$COMMAND
```

Далее `systemctl enable claymore` и `systemctl start claymore`.

Думаю, суть понятна. Скрипт запусился - кричим об этом в телеграм. Разгоняет все 6 карточек по очереди, запустив перед этим иксы. Затем, запускаем Claymore в соло или дуал майнинге. Не хватает лишь мониторинга. Вдруг температура выросла или хэшрейт упал, как об этом узнать. Окей, пишу свой первый в жизни скрипт на питоне. Правда перед этим сначала лезу в доку Claymore чтобы посмотреть API. Но там пишут, мол, лень писать доку по API, юзайте `tcpdump` или Wireshark и сами разберетесь. Удивился, но что делать, пришлось скачать Wireshart и посмотреть, что за пакетики летят. Оказалось там JSON RPC.

```python
#!/usr/bin/env python

import socket
import json
import requests

def notify(text):
    url = "https://api.telegram.org/bot***/sendMessage"

    payload = {
        'chat_id': '***',
        'text': text
    }

    r = requests.post(url, data=payload)

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(('127.0.0.1', 3333))
s.sendall('{"id":0,"jsonrpc":"2.0","method":"miner_getstat1"}.')
s.shutdown(socket.SHUT_WR)

response = ''

while 1:
    data = s.recv(1024)
    if not data:
        break
    response += data

s.close()

json = json.loads(response)

rate_string = json['result'][3].split(';')

for rate in rate_string:
    if int(rate) > 18000:
        continue

    notify(response)
    break

temp_string = json['result'][6].split(';')

for i, temp in enumerate(temp_string):
    if i % 2 != 0 or int(temp) < 70:
        continue

    notify(response)
    break
```

А питон не так уж и плох! На этом этапе я остановился и забыл на пару дней про ферму. Не считая того, что я хотел возможность логиниться на нее из любой точки, а не только из локальной сети, поэтому мне пришлось понднять OpenVPN сервер на своем VPS и сделать, чтобы ферма при загрузке коннектилась в этому серверу. Таким образом, подключивишь с ноута к VPN я мог зайти на ферму, даже находясь в сотнях киллометров от нее. И это все за NAT без белого IP. Лучше способа просто не придумал.

В общем, через несколько дней мне сообщают, что вышел апдейт майнера EthMiner, который позволяет повысить хэшрейт на карточках 1060. Правда его даже в паблик еще не выкинули. Пришлось пойти на GitHub, склонировать репозиторий, скопилировать этот майнер. Проверяю – реально работает быстрее. Только вот API у него уже нет. А мониторить как-то надо. В итоге решаю написать Wrapper на Ruby, который слушает STDOUT от майнера, дергает оттуда хэшрейт и решает, насколько все хорошо. Плюс параллельно он дергает стату с карточек, типа температуры и мощности и при возникновении отклонений сигнализирует об этом мне в телеграм.

Конечный скрипт получился таким.

```ruby
#!/usr/bin/env ruby

require 'open3'
require 'timeout'
require 'logger'
require 'uri'
require 'net/http'
require 'openssl'

STDOUT.sync = true
Thread.abort_on_exception = true

$log = Logger.new(STDOUT)
$log.level = Logger::INFO
$log.formatter = proc do |severity, datetime, progname, msg|
  "#{msg}\n"
end

$notifications = []
$last_notify = 0
$total_rate = 0
$total_count = 0

def notify(text)
  $log.warn "Notify: #{text}"

  $notifications << text

  return if Time.now.to_i - $last_notify < 300

  url = 'https://api.telegram.org/bot***/sendMessage'

  params = {
    chat_id: ***,
    text: $notifications.join("\n---\n")
  }

  puts url
  puts params

  uri = URI.parse(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = (uri.scheme == 'https')
  http.verify_mode = OpenSSL::SSL::VERIFY_NONE

  request = Net::HTTP::Post.new(uri)
  request.set_form_data(params)
  response = http.request(request)

  puts response.body

  $notifications = []
  $last_notify = Time.now.to_i
end

def smi_check
  Timeout::timeout(10) do
    smi = `nvidia-smi --format=csv,noheader --query-gpu=index,pstate,fan.speed,temperature.gpu,power.draw,utilization.memory,utilization.gpu,memory.used,memory.total,clocks.current.graphics,clocks.max.graphics,clocks.current.memory,clocks.max.memory`.strip

    $log.info smi
    $log.info "Avg rate: #{($total_rate / $total_count).round(2)}"

    need_notify = false

    if smi.include?('Unable to determine')
        notify 'Reboot because GPU is lost'
        `sudo shutdown -r now`
        return
    end

    smi.lines.each do |line|
      index, pstate, fan, temp, power = line.split(',').map(&:strip)

      need_notify = true if power.to_f < 60
      need_notify = true if temp.to_f > 70
    end

    notify smi if need_notify
  end
rescue Timeout::Error
  notify 'Reboot because of smi timeout'

  `sudo shutdown -r now`
end

observer = Thread.new do
  sleep(60)

  while true
    smi_check

    sleep(30)
  end
end

Open3.popen2e('./start.sh') do |stdin, stdout_err, wait_thr|
  started_at = Time.now.to_i
  enabled = false
  low_rates = 0

  while line = stdout_err.gets
    $log.info line

    match = /: (.+)MH\/s/.match(line)

    if match
      rate = match[1].to_f

      $total_rate += rate
      $total_count += 1

      if rate.to_f < 120
        low_rates += 1
      else
        enabled = true
        low_rates = 0
      end
    end

    if low_rates > 1000
      if enabled
        notify 'Stop current process because of low rate'

        break
      elsif Time.now.to_i - started_at > 300
        notify 'Reboot machine because of bad run'

        `sudo shutdown -r now`
      end
    end
  end

  $log.warn 'Exit process'

  exit 1
end
```

Сам скрипт `start.sh` похож на первоначальный.

```
#!/bin/bash

notify() {
    curl -s https://api.telegram.org/bot***/sendMessage -d "chat_id=***" -d "text=${1}"
}

WALLET="0x837ddd8528fa1961e960704ca4ed5bcdf9603685"
HOSTNAME=`uname -n`
EMAIL="crashcube@gmail.com"
SERVER_IPS=`ip -o -4 addr list | grep -v 127.0.0.1 | awk '{print $4}' | tr '\n' ' ' | sed -e 's/\s*$//'`

notify "Starting ${HOSTNAME} @ ${SERVER_IPS}"

# overclock

sudo nvidia-smi -pm 1
sudo nvidia-smi -pl 80

sudo X :1 &

CORE_CLOCK=(0 0 0 0 0 0)
MEM_CLOCK=(1500 1000 1500 1500 1500 1500)

for i in $(seq 0 5); do
        sudo nvidia-settings --display :1 -a "[gpu:$i]/GPUPowerMizerMode=1"
        sudo nvidia-settings --display :1 -a "[gpu:$i]/GPUGraphicsClockOffset[3]=${CORE_CLOCK[$i]}"
        sudo nvidia-settings --display :1 -a "[gpu:$i]/GPUMemoryTransferRateOffset[3]=${MEM_CLOCK[$i]}"
        sudo nvidia-settings --display :1 -a "[gpu:$i]/GPUFanControlState=1" -a "[fan:$i]/GPUTargetFanSpeed=80"
        sleep 1
done

# start

export GPU_FORCE_64BIT_PTR=0
export GPU_MAX_HEAP_SIZE=100
export GPU_USE_SYNC_OBJECTS=1
export GPU_MAX_ALLOC_PERCENT=100
export GPU_SINGLE_ALLOC_PERCENT=100

COMMAND="./ethminer --farm-recheck 200 -U -S eth-eu1.nanopool.org:9999 -FS eth-eu2.nanopool.org:9999 -O ${WALLET}.${HOSTNAME}/${EMAIL}"

echo $COMMAND

notify "${COMMAND}"

$COMMAND
```

Ах, да. Много проблем было с тем, что возникала проблема с карточками, будто бы им дали слишком много разгона. В итоге оказалось, что у нас попалась одна карточка на памти от Hynix, и она совсем не держала цифры, которые держали другие карточки на памяти Samsung. Поэтому решением стало просто уменьшение разгона на конкретной карточке, и все проблемы исчезли.
