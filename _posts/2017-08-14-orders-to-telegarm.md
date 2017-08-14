---
layout: post
title: Отправка заказов с лендинга в телеграм
date: 2017-08-15 12:00:00 +0300
categories: ru
tags: html
intro: >
  Многие знают, что у телеграма есть крутой API, но мало кто догадывается, что туда можно принимать заказы с ваших лендингов, которые вы состряпали на коленке.
---

Не будем тянуть резину.

```javascript
$(document).on('submit', 'form', function(e) {
  var text = window.location + "\n\n";

  $(e.currentTarget).find('input, textarea').each(function(index) {
    var input = $(this);
    text += input.attr('name') + ': ' + input.val() + "\n";
  })

  $.ajax({
    type: 'GET',
    dataType: 'json',
    url: 'https://api.telegram.org/bot***/sendMessage',
    cache: false,
    async: false,
    data: {
      chat_id: '###',
      text: text,
    },
  });
});
```

Звездочки заменяем на токен бота, который получаем в телеграме. Гугл в помощь. А вот решетки нужно заменить на ID пользователя, которому нужно писать. Если это группа, перед ID будет знак минус. Чтобы узнать ID, как вариант, можно написать боту, затем дернуть метод getUpdates через API тем же способом, и в полученном массивы сообщений найти нужный ID.
