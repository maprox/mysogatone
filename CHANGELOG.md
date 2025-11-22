# Changelog

Все значимые изменения в проекте будут документироваться в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
и этот проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

### Добавлено
- Базовая структура монорепозитория
- Архитектурная документация (ARCHITECTURE.md)
- Описание протокола передачи данных через файлы (shared/protocol/PROTOCOL.md)
- TypeScript типы для протокола (shared/protocol/types.ts)
- Базовая структура LISTENER для Яндекс Диск (listeners/yandex-disk/)
- Базовая структура CALLER для Android (callers/android/)
  - SOCKS5 сервер (Socks5Server.kt)
  - SOCKS5 обработчик протокола (Socks5Handler.kt)
  - Абстракция ConnectionHandler (ConnectionHandler.kt)
  - Базовая реализация DefaultConnectionHandler (DefaultConnectionHandler.kt)
- Базовая структура CALLER для Deno (callers/deno/)
- README с описанием проекта и быстрым стартом

### Планируется
- Реализация StorageProvider для Яндекс Диск API
- Реализация OAuth аутентификации для LISTENER
- Реализация polling механизма для мониторинга изменений
- Реализация connection-handler для подключения к целевым серверам
- Реализация StorageProvider для CALLER (Deno и Android)
- Интеграция CALLER с облачным хранилищем через StorageProvider
- Обработка rate limits и ошибок API
- Тестирование интеграции между LISTENER и CALLER

