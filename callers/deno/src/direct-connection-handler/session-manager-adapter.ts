/**
 * Адаптер для SessionManager, реализующий интерфейс SessionManager.
 * Позволяет использовать существующий SessionManager через интерфейс.
 */

import type { SessionManager as SessionManagerClass } from "@src/yandex-disk-connection-handler/session/manager.ts";
import type { SessionInfo } from "@src/yandex-disk-connection-handler/session/types.ts";

import type { SessionManager } from "./types.ts";

/**
 * Адаптер, который оборачивает SessionManager и реализует интерфейс SessionManager
 */
export class SessionManagerAdapter implements SessionManager {
  constructor(private sessionManager: SessionManagerClass) {}

  getOrCreateSession(
    targetAddress: string,
    targetPort: number,
    clientConnId?: string,
  ): SessionInfo {
    return this.sessionManager.getOrCreateSession(
      targetAddress,
      targetPort,
      clientConnId,
    );
  }
}
