/**
 * Сервис для применения задержек.
 */

import type { DelayApplier } from "./types.ts";

/**
 * Реализация применения задержек
 */
export class DelayApplierImpl implements DelayApplier {
  /**
   * Применяет задержку если она настроена
   */
  async apply(delayMs: number | undefined, _stage: string): Promise<void> {
    if (delayMs && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
