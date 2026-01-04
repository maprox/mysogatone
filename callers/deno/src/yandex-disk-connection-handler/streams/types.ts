/**
 * Типы для потоков передачи данных
 */

import type { ProtocolPaths } from "@shared/protocol/paths.ts";

import type { StorageProvider } from "@src/storage-provider/types.ts";

/**
 * Параметры для создания потоков
 */
export interface CreateStreamsParams {
  requestId: string;
  dataBuffer: Uint8Array[];
  storageProvider: StorageProvider;
  protocolPaths: ProtocolPaths;
  pollInterval: number;
  responseTimeout: number;
  onDataUploaded: () => void;
  onConnectionClosed?: () => void;
  keepSessionAlive?: boolean; // Для HTTPS - продолжать polling после первого ответа
  // Для поддержки множественных раундов (HTTPS)
  sessionId?: string;
  targetAddress?: string;
  targetPort?: number;
  onCreateNextRequest?: (data: Uint8Array[]) => Promise<{ requestId: string }>;
}
