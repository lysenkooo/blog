---
layout: post
title: "Авторизация в Devise через Битрикс"
date: 2015-05-05 00:00:00 +0300
intro: "Если вы пишите свое Rails-приложение, которое должно уметь делать авторизацию через базу вашего портала Битрикс24, то этот пост окажется для вас полезным."
categories: backend
tags: ruby bitrix
---

Итак, для начала нам нужно создать новую модель.

`app/models/bitrix_user.rb`

```ruby
class BitrixUser < ActiveRecord::Base
  self.table_name = 'b_user'
  establish_connection :bitrix
end
```

Затем добавим строчку в наш файл конфигурации.

`config/database.yml`

```
bitrix:
  adapter: mysql2
  host: 127.0.0.1
  port: 3306
  encoding: utf8
  username: bitrix
  password: bitrix
  database: sitemanager0
```

Не забудьте создать соответствующего пользователя для доступа к БД битрикса как минимум с правами SELECT на таблицу `b_user`.

Наконец, добавляем новый способ авторизации для devise.

`config/initializers/bitrix_authenticatable.rb`

```ruby
require 'devise/strategies/authenticatable'

module Devise
  module Strategies
    class BitrixAuthenticatable < Authenticatable
      def authenticate!
        if params[:user]
          bitrix_user = BitrixUser.find_by('EMAIL = ? AND PASSWORD = CONCAT(SUBSTR(PASSWORD, 1, 8), MD5(CONCAT(SUBSTR(PASSWORD, 1, 8), ?)))', email, password)

          if bitrix_user
            user = User.find_or_create_by(email: bitrix_user.EMAIL)
            success!(user)
          else
            fail(:invalid_login)
          end
        end
      end

      def email
        params[:user][:email]
      end

      def password
        params[:user][:password]
      end
    end
  end
end

Warden::Strategies.add(:bitrix_authenticatable, Devise::Strategies::BitrixAuthenticatable)
```

Таким образом, в ваше приложение можно будет заходить не только через встроенную систему авторизации, но и так же используя данные вашего портала Битрикс24.
