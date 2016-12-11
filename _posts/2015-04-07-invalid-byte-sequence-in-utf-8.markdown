
---
layout: post
title: "Чиним invalid byte sequence in UTF-8"
date: 2015-04-07 00:00:00 +0300
intro: >
    Почти в каждом приложении на Rails, которое принимает пользовательский ввод,
    у меня вылезает куча эксепшенов с сообщением "invalid byte sequence in
    UTF-8". В буржунете много решений проблемы, которые обычно сводятся к
    использованию стороннего гема и фильтрации ввода через middleware.
categories: backend
tags: ruby
---

Я нашел простое решение, которое позволяет фильтровать данные во входящих параметрах первого уровня.

Добавляем в наш `ApplicationController` следующие строки.

```ruby
before_action :clear_params

def clear_params
  params.each_key do |key|
    params[key] = params[key].encode('UTF-8', 'binary', invalid: :replace, undef: :replace, replace: '') if params[key].is_a?(String)
  end
end
```

Если вы хотите фильтровать все параметры без исключения, можете самостоятельно добавить немного рекурссии :)
