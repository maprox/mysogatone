# Протокол обмена через хранилище

Протокол передачи TCP данных между CALLER и LISTENER через облачное хранилище.

## Документация

- [PROTOCOL.md](PROTOCOL.md) - Подробное описание протокола
- [types.ts](types.ts) - TypeScript типы и утилиты для работы с протоколом

## Использование

### TypeScript/Deno

```typescript
import { RequestMetadata, ProtocolPaths, ProtocolUtils } from "../../shared/protocol/types.ts";

// Генерация requestId
const requestId = ProtocolUtils.generateRequestId();

// Создание метаданных запроса
const metadata: RequestMetadata = {
  requestId,
  targetAddress: "example.com",
  targetPort: 443,
  timestamp: Date.now(),
};

// Пути к файлам
const paths = new ProtocolPaths("requests", "responses");
const metadataPath = paths.requestMetadata(requestId);
const dataPath = paths.requestData(requestId);
const responsePath = paths.response(requestId);
```

### Kotlin (Android)

Типы для Kotlin будут определены в `callers/android/src/main/kotlin/protocol/` при реализации CALLER для Android.

