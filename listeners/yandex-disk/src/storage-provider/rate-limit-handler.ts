/**
 * Обработка rate limit (429)
 */

import type { RetryConfig } from "./types.ts";
import { sleep, calculateDelay } from "./utils.ts";

/**
 * Обработка rate limit (429)
 */
export async function handleRateLimit(
  response: Response,
  attempt: number,
  delay: number,
  config: RetryConfig
): Promise<number | null> {
  if (response.status !== 429 || attempt >= config.maxRetries) {
    return null;
  }

  const retryAfter = response.headers.get("Retry-After");
  const newDelay = calculateDelay(delay, retryAfter, config);

  console.warn(
    `Rate limit exceeded. Retrying after ${newDelay}ms (attempt ${attempt + 1}/${config.maxRetries})`
  );

  await sleep(newDelay);
  return newDelay;
}

