/**
 * Обработка сигналов для graceful shutdown
 */

/**
 * Настраивает обработчики сигналов для graceful shutdown
 */
export function setupSignalHandlers(
  onShutdown: () => Promise<void>
): void {
  // Обработка SIGINT (Ctrl+C)
  Deno.addSignalListener("SIGINT", async () => {
    await onShutdown();
    Deno.exit(0);
  });

  // Обработка SIGTERM
  Deno.addSignalListener("SIGTERM", async () => {
    await onShutdown();
    Deno.exit(0);
  });
}

