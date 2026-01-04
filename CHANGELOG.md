# Changelog

Все значимые изменения в проекте будут документироваться в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
и этот проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

## [Unreleased]

### Добавлено
- Реализация Session Management для переиспользования TCP соединений в HTTPS запросах
  - SessionManager для управления сессиями в CALLER и LISTENER
  - Поддержка keep-alive сессий для HTTPS (порт 443)
  - Ephemeral сессии для HTTP (порт 80)
  - Автоматическая очистка неактивных сессий (таймаут 60 секунд)
  - Переиспользование TCP соединений между запросами к одному серверу
- DirectConnectionHandler для прямых TCP соединений с поддержкой сессий
  - Используется для тестирования без файловой системы
  - Позволяет проверить работу Session Management без задержек файловой системы
- DelayedConnectionHandler для эмуляции задержек при отладке TLS handshake
  - Эмулирует задержки, возникающие при работе через YandexDiskConnectionHandler
  - Запись задержек в лог (delay-log.jsonl)
  - Загрузка и применение задержек из лога
  - Настройка задержек через переменные окружения
  - Скрипты для анализа задержек (find-threshold, test-delay)
- Система логирования (shared/logger/)
  - FileLogger с записью в файл и stdout
  - Поддержка уровней логирования (DEBUG, INFO, WARN, ERROR)
  - Настройка через переменные окружения (CALLER_LOG_PATH, LISTENER_LOG_PATH, LOG_LEVEL)
  - Адаптеры для console и shared логгера
- Реорганизация структуры кода в yandex-disk-connection-handler
  - request-creation/ - создание запросов (index.ts, types.ts)
  - response-poller/ - polling ответов (index.ts, types.ts)
  - streams/ - работа с потоками (index.ts, types.ts)
  - session/ - управление сессиями (manager.ts, types.ts, utils.ts)
- Конфигурация для CALLER Deno (config/)
  - Парсинг переменных окружения
  - Поддержка различных режимов работы (YandexDisk, Direct, Delayed)
  - Настройка задержек через переменные окружения
- Документация
  - HTTPS_SESSION_TESTING.md - инструкция по тестированию Session Management
  - QUICK_HTTPS_TEST.md - быстрый тест Session Management
  - LOGGING.md - документация по системе логирования
  - DELAYED_HANDLER.md - документация по DelayedConnectionHandler
  - FIND_THRESHOLD.md - документация по поиску пороговых значений задержек
  - SIMULATE_IDLE_CONNECTION.md - документация по эмуляции idle соединений
  - TEST_TIMELINE.md - временная шкала тестирования
- Скрипты для тестирования и анализа
  - test-https-automated.ps1 - автоматизированное тестирование HTTPS
  - find-threshold.ps1, find-threshold-simple.ps1 - поиск пороговых значений
  - find-threshold-delay.ps1, find-threshold-delay-simple.ps1 - поиск задержек
  - test-delay.ps1 - тестирование задержек

### Изменено
- Реорганизована структура модулей yandex-disk-connection-handler в отдельные директории
- Улучшена обработка сессий в connection-handler для LISTENER
- Обновлена структура метаданных запросов для поддержки Session Management
- Улучшена обработка ошибок и логирование в storage-provider

### Исправлено
- Исправлена обработка TLS handshake через несколько раундов при переиспользовании сессий
- Улучшена обработка потоков данных при работе с сессиями
- Исправлена нормализация путей в ProtocolPaths

### Планируется
- Реализация StorageProvider для CALLER Android
- Оптимизация производительности
- Улучшение обработки ошибок

## [1.1.2] - 2025-01-22

### Добавлено
- Тестовый скрипт для проверки SOCKS5 сервера в реальных условиях (callers/deno/scripts/test-socks5-server.ts)
- Упрощенный тестовый скрипт для быстрого тестирования (callers/deno/scripts/test-socks5-simple.ts)
- Логирование для диагностики работы SOCKS5 сервера и polling механизма
- Поддержка обработки файлов, найденных при инициализации LISTENER
- Поддержка пустых запросов в LISTENER (если файл данных не появился за отведенное время)

### Исправлено
- Исправлена обработка SIGTERM для Windows в CALLER и LISTENER
- Исправлена нормализация путей в polling для поиска файлов ответов (учитывается префикс "disk:" и начальный "/")
- Исправлен размер массива CONNECT запроса в тестовом скрипте (добавлен байт длины домена)
- Увеличен таймаут ожидания файла данных в LISTENER до 60 секунд

## [1.1.1] - 2025-01-22

### Добавлено
- Тесты для YandexDiskConnectionHandler для CALLER Deno (callers/deno/)
  - Комплексные тесты для всех модулей YandexDiskConnectionHandler (15 тестов)
    - Тесты для request-creation.ts (3 теста): создание метаданных, загрузка данных, обработка ошибок
    - Тесты для response-poller.ts (5 тестов): успешное получение ответа, polling с несколькими попытками, обработка ошибок от LISTENER, таймауты, продолжение polling при ошибках проверки
    - Тесты для streams.ts (3 теста): создание потоков и передача данных, обработка ошибок при загрузке, обработка ошибок от LISTENER
    - Тесты для YandexDiskConnectionHandler (2 теста): создание соединения, обработка ошибок при создании метаданных
  - MockStorageProvider для тестирования с автоматическим обновлением listFilesResult
  - Исправлена обработка ошибок в streams.ts при ошибке загрузки данных

### Исправлено
- Исправлены тесты DefaultConnectionHandler: добавлены таймауты для предотвращения зависаний при подключении к недоступным серверам

## [1.1.0] - 2025-01-22

### Добавлено
- Реализация SOCKS5 сервера для CALLER Deno (callers/deno/)
  - SOCKS5 сервер (socks5-server.ts) с поддержкой множественных соединений
  - SOCKS5 обработчик протокола (socks5-handler.ts) с полной поддержкой протокола
    - Handshake с поддержкой No Auth
    - Обработка CONNECT запросов
    - Поддержка IPv4 и доменных имен
    - Передача данных между клиентом и целевым сервером
    - Буферизация данных для корректного чтения
  - Интерфейс ConnectionHandler для абстракции подключений
  - DefaultConnectionHandler для прямых TCP соединений (для тестирования)
  - Комплексные тесты для SOCKS5 компонентов (11 тестов)
    - Тесты для DefaultConnectionHandler (3 теста)
    - Тесты для Socks5Handler (5 тестов)
    - Тесты для Socks5Server (3 теста)
- Реализация ConnectionHandler через StorageProvider для CALLER Deno (callers/deno/)
  - Модульная архитектура yandex-disk-connection-handler/
    - types.ts - типы и конфигурация
    - request-creation.ts - создание запросов в хранилище
    - response-poller.ts - polling для проверки ответов от LISTENER
    - streams.ts - создание потоков для передачи данных
    - index.ts - основной класс YandexDiskConnectionHandler
  - Создание метаданных запросов (.req файлы)
  - Загрузка данных запросов (.data файлы)
  - Polling для проверки ответов (.resp файлы)
  - Обработка ошибок от LISTENER (.error файлы)
  - Очистка файлов после получения ответа
  - Интеграция с SOCKS5 сервером через интерфейс ConnectionHandler
  - Точка входа main.ts с поддержкой переменных окружения

## [1.0.1] - 2025-11-22

### Добавлено
- Тесты для утилит протокола (28 тестов)
  - Тесты для генерации UUID (generateRequestId)
  - Тесты для парсинга requestId из имени файла (parseRequestId)
  - Тесты для проверки типов файлов (isRequestMetadata, isRequestData, isResponse, isError)
  - Интеграционные тесты для комбинаций функций
- Правило в .cursorrules: запрет на использование `--no-verify` при коммитах
  - Pre-commit hooks должны всегда выполняться для обеспечения качества кода
  - При блокировке коммита необходимо исправить проблему, а не обходить проверки

### Изменено
- Преобразован класс `ProtocolUtils` в набор обычных функций в `shared/protocol/utils.ts`
  - Убрана избыточность: класс со статическими методами заменен на простые функции
  - Улучшена читаемость и простота использования: `generateRequestId()` вместо `ProtocolUtils.generateRequestId()`
  - Обновлены все импорты в проекте для использования функций напрямую
- Вынесен класс `ProtocolUtils` из `shared/protocol/types.ts` в отдельный файл `shared/protocol/utils.ts`
  - Улучшена структура проекта: типы отделены от утилит
  - Обновлены все импорты в проекте для использования нового расположения

### Исправлено
- Улучшен pre-commit hook для более надежной работы на Windows
  - Добавлена явная проверка кода выхода тестов
  - Добавлены понятные сообщения об ошибках при блокировке коммита

## [0.1.0] - 2025-11-22

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

#### LISTENER для Яндекс Диск
- Полная реализация StorageProvider для Яндекс Диск API
  - Модульная архитектура (storage-provider/ с разделением на типы, ошибки, утилиты, HTTP клиент, операции с файлами)
  - Методы listFiles, downloadFile, uploadFile, deleteFile
  - Обработка OAuth аутентификации
  - Retry механизм с exponential backoff
  - Обработка rate limits (429) с поддержкой Retry-After заголовка
  - Обработка ошибок API с детальными сообщениями
- Настройка линтера Deno с рекомендуемыми правилами
- Комплексные юнит тесты (47 тестов)
  - Тесты для утилит (11 тестов)
  - Тесты для классов ошибок (3 теста)
  - Тесты для операций с файлами (8 тестов)
  - Тесты для HTTP клиента и retry логики (17 тестов)
  - Тесты для основного провайдера (8 тестов)
- Скрипты для проверки работоспособности
  - `scripts/verify-setup.ts` - проверка настройки без реального API
  - `scripts/check-health.ts` - полная проверка с реальным API
  - `scripts/get-token.ts` - помощь в получении OAuth токена
- Документация
  - `GETTING_TOKEN.md` - подробная инструкция по получению OAuth токена
  - `QUICK_START.md` - быстрый старт для получения токена
  - `CHECKING.md` - руководство по проверке работоспособности
  - Обновлен README с инструкциями по использованию

### Изменено
- Рефакторинг кода StorageProvider:
  - Разбиение большого файла на модульную структуру
  - Использование function declarations вместо const для функций
  - Разделение на мелкие функции для лучшей читаемости
  - Функциональный подход к организации кода

### Исправлено
- Исправлены ошибки типов в тестах
- Исправлена обработка Response body (клонирование для повторного чтения)
- Исправлена проверка URL параметров в тестах

