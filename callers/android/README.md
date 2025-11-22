# CALLER для Android

SOCKS5 сервер на Kotlin для Android приложения.

## Особенности

- Реализация протокола SOCKS5
- Без аутентификации (No Auth)
- Поддержка IPv4
- Команда CONNECT
- Абстрактный интерфейс `ConnectionHandler` для кастомной логики подключений
- Готовая реализация `DefaultConnectionHandler` для тестирования (стандартное TCP соединение)

## Сборка

```bash
./gradlew build
```

## Запуск

```bash
./gradlew run
```

Сервер запустится на порту **1080**.

## Использование

### Тестирование с curl

```bash
curl --socks5-hostname 127.0.0.1:1080 https://www.google.com
```

### Настройка браузера

Настройте браузер для использования SOCKS5 прокси:
- Хост: `127.0.0.1`
- Порт: `1080`
- Тип: SOCKS5
- Аутентификация: не требуется

## Архитектура

### ConnectionHandler

Интерфейс `ConnectionHandler` позволяет реализовать кастомную логику подключения к целевому серверу вместо стандартного TCP соединения. Это полезно для:

- Реализации собственных протоколов
- Добавления шифрования
- Логирования и мониторинга
- Интеграции с другими системами (например, облачными хранилищами)

### Пример кастомной реализации

```kotlin
class CustomConnectionHandler : ConnectionHandler {
    override fun connect(targetAddress: String, targetPort: Int): Pair<InputStream, OutputStream> {
        // Ваша кастомная логика подключения
        // ...
    }
}

// Использование
val server = Socks5Server(1080, CustomConnectionHandler())
```

## Перенос на Android

Код написан на чистом Kotlin с использованием стандартных библиотек Java, что позволяет легко перенести его на Android:

1. Скопируйте файлы в Android проект
2. Замените `java.net.Socket` на Android-совместимые классы при необходимости
3. Реализуйте свой `ConnectionHandler` для Android-специфичной логики
4. Используйте Android Service для фоновой работы

