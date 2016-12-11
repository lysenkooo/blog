---
layout: post
title: "Способ ручного профилирования JavaScript"
date: 2014-06-25 00:00:00 +0300
intro: "Недавно просматривал слайды с DevConf 2014 и наткнулся на довольно элегантный способ ручного профилирования JavaScript-функций, которым делюсь сегодня с вами."
categories: ru
tags: javascript
---

В принципе, здесь объяснять нечего и код говорит сам за себя, так что просто возьмите на вооружение.

Объявляем нашу функцию.

```javascript
function profile(func) {
  var wrapper = function() {
    var start = +new Date();
    var result = func.apply(null, arguments);
    console.log(func.name, +new Data() - start, 'ms');
    return result;
  };
  return wrapper;
}
```

И используем.

```javascript
code_to_measure = profile(code_to_measure);
code_to_measure();
```

Все гениальное просто!
