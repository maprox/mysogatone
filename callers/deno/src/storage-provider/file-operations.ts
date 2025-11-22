/**
 * Операции с файлами через Яндекс Диск API
 */

import { YandexDiskApiError } from "./errors.ts";
import type { FileInfo } from "./types.ts";

/**
 * Преобразование элемента API в FileInfo
 */
export function mapToFileInfo(item: {
  name: string;
  path: string;
  size?: number;
  modified: string;
}): FileInfo {
  return {
    name: item.name,
    path: item.path,
    size: item.size || 0,
    modified: new Date(item.modified),
  };
}

/**
 * Получение ссылки для загрузки/скачивания из ответа API
 */
export async function getOperationLink(
  response: Response,
  operationType: "download" | "upload"
): Promise<string> {
  const data = await response.json();
  if (!data.href) {
    throw new YandexDiskApiError(
      `${operationType === "download" ? "Download" : "Upload"} link not found in API response`,
      500
    );
  }
  return data.href;
}

/**
 * Выполнение финального запроса загрузки/скачивания файла
 */
export async function executeFileOperation(
  href: string,
  data: Uint8Array | null,
  method: "GET" | "PUT"
): Promise<Uint8Array | void> {
  const options: RequestInit = { 
    method,
    body: data as BodyInit | null,
  };

  const response = await fetch(href, options);
  if (!response.ok) {
    throw new YandexDiskApiError(
      `Failed to ${method === "GET" ? "download" : "upload"} file: ${response.statusText}`,
      response.status
    );
  }

  if (method === "GET") {
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }
}

