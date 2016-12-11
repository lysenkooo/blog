---
layout: post
title: "Поднимаем поиск с поддержкой морфологии на ElasticSearch"
date: 2015-05-08 00:00:00 +0300
intro: >
    Если вы когда-либо делали поиск для сайта, вероятно, вам хотелось, чтобы по
    запросу, например, "чехол", находились результаты с такими вхождениями, как
    "чехлы", "чехла", "чехлов" и так далее. Сегодня мы рассмотрим, как
    прикрутить такой поиск к вашему проекту на Rails.
categories: ru
tags: elasticsearch ruby
---

Сам ElasticSearch представляет собой поисковой движок, базирующийся на Lucene. Прежде всего он привлекает довольной хорошей производительностью и обширными возможностями. Особенностью является то, что вся работа идет через HTTP REST API, поэтому дебажить можно через CURL или даже через браузер.

## Установка

Для начала установим сам поисковой движек. Покажу все это на примере CentOS.

```
rpm --import https://packages.elasticsearch.org/GPG-KEY-elasticsearch
```

```
vi /etc/yum.repos.d/elasticsearch.repo
```

```
[elasticsearch-1.4]
name=Elasticsearch repository for 1.4.x packages
baseurl=http://packages.elasticsearch.org/elasticsearch/1.4/centos
gpgcheck=1
gpgkey=http://packages.elasticsearch.org/GPG-KEY-elasticsearch
enabled=1
```

```
yum install elasticsearch java
chkconfig elasticsearch on
service elasticsearch start
```

Рекомендую сразу настроить прослушку только для локальных запросов, если вы не планируете обращаться к ES снаружи.

```
vi /etc/elasticsearch/elasticsearch.yml
```

```
network.host: 127.0.0.1
```

Если же вы настраиваете среду для разработки и работаете под MacOS, вам должно хватить одной команды:

```
brew install elasticsearch
```

Установим плагин для поддержки морфологии.

```
/usr/share/elasticsearch/bin/plugin -install analysis-morphology -url http://dl.bintray.com/content/imotov/elasticsearch-plugins/org/elasticsearch/elasticsearch-analysis-morphology/1.2.0/elasticsearch-analysis-morphology-1.2.0.zip
```

## Тюнинг моделей

Теперь займемся кодом. Для начала установим официальные гемы для поддержки ElasticSearch.

```
gem 'elasticsearch-rails'
gem 'elasticsearch-model'
```

Создадим новый concern под названием searchable по пути `app/models/concerns/searchable.rb`.

```ruby
module Searchable
  extend ActiveSupport::Concern

  included do
    include Elasticsearch::Model

    settings index: {
               number_of_shards: 1
             },
             analysis: {
               analyzer: {
                 my_analyzer: {
                   type: 'custom',
                   tokenizer: 'standard',
                   filter: 'lowercase,russian_morphology,english_morphology,my_stopwords'
                 },
               },
               filter: {
                 my_stopwords: {
                   type: 'stop',
                   stopwords: 'а,без,более,бы,был,была,были,было,быть,в,вам,вас,весь,во,вот,все,всего,всех,вы,где,да,даже,для,до,его,ее,если,есть,еще,же,за,здесь,и,из,или,им,их,к,как,ко,когда,кто,ли,либо,мне,может,мы,на,надо,наш,не,него,нее,нет,ни,них,но,ну,о,об,однако,он,она,они,оно,от,очень,по,под,при,с,со,так,также,такой,там,те,тем,то,того,тоже,той,только,том,ты,у,уже,хотя,чего,чей,чем,что,чтобы,чье,чья,эта,эти,это,я,a,an,and,are,as,at,be,but,by,for,if,in,into,is,it,no,not,of,on,or,such,that,the,their,then,there,these,they,this,to,was,will,with',
                 },
              },
            }

    def self.search(query)
      begin
        __elasticsearch__.search(query)
      rescue Exception => e
        Rails.logger.warn e.message
        nil
      end
    end
  end
end
```

В моделях, которые мы хотим искать через elastic делаем include.

```
include Searchable
```

Дело остается за малым. Необходимо создать контроллер, который будет обрабатывать поисковые запросы.

```ruby
class SearchController < ApplicationController
  def index
    @query = params[:q] || ''
    @query = @query.strip.gsub(/[^а-яА-Яa-zA-Z0-9\- ]/, '')

    pages = Page.search(
        query: {
            query_string: {
                query: @query,
                fields: %w(name content),
            },
        },
        highlight: {
            pre_tags: %w(<strong>),
            post_tags: %w(</strong>),
            fragment_size: 160,
            no_match_size: 160,
            fields: {
                name: { number_of_fragments: 1 },
                content: { number_of_fragments: 5 },
            },
        },
    )

    pp pages.results
  end
end
```

Немного комментариев: здесь мы задаем запрос на поиск по полям name и content для нашей модели Page, выделяя найденные вхождения тегами strong. Размер выводимого фрагмента задается 160 символам. Информацию по остальным параметрам вы можете найти в официальной документации.
