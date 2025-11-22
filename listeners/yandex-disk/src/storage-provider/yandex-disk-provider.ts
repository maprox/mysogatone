/**
 * Реализация StorageProvider для Яндекс Диск
 */

import type { StorageProvider, FileInfo, RetryConfig } from "./types.ts";
import { normalizePath, buildApiUrl } from "./utils.ts";
import { createAuthHeaders, executeWithRetry } from "./http-client.ts";
import { mapToFileInfo, getOperationLink, executeFileOperation } from "./file-operations.ts";

/**
 * Реализация StorageProvider для Яндекс Диск
 */
export class YandexDiskProvider implements StorageProvider {
  private accessToken: string;
  private baseUrl = "https://cloud-api.yandex.net/v1/disk";
  private retryConfig: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  };

  constructor(accessToken: string) {
    if (!accessToken) {
      throw new Error("Access token is required");
    }
    this.accessToken = accessToken;
  }

  /**
   * Выполняет HTTP запрос с обработкой ошибок и retry механизмом
   */
  private makeRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const headers = createAuthHeaders(this.accessToken);
    if (options.headers) {
      new Headers(options.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    return executeWithRetry(
      url,
      { ...options, headers },
      this.retryConfig
    );
  }

  /**
   * Читает список файлов в указанной папке
   */
  async listFiles(folderPath: string): Promise<FileInfo[]> {
    const path = normalizePath(folderPath);
    const url = buildApiUrl(this.baseUrl, "/resources", {
      path: `/${path}`,
      limit: "1000",
    });

    const response = await this.makeRequest(url);
    const data = await response.json();

    if (!data._embedded?.items) {
      return [];
    }

    return data._embedded.items.map(mapToFileInfo);
  }

  /**
   * Загружает файл из хранилища
   */
  async downloadFile(filePath: string): Promise<Uint8Array> {
    const path = normalizePath(filePath);
    const url = buildApiUrl(this.baseUrl, "/resources/download", {
      path: `/${path}`,
    });

    const response = await this.makeRequest(url);
    const downloadHref = await getOperationLink(response, "download");
    return await executeFileOperation(downloadHref, null, "GET") as Uint8Array;
  }

  /**
   * Загружает файл в хранилище
   */
  async uploadFile(filePath: string, data: Uint8Array): Promise<void> {
    const path = normalizePath(filePath);
    const url = buildApiUrl(this.baseUrl, "/resources/upload", {
      path: `/${path}`,
      overwrite: "true",
    });

    const response = await this.makeRequest(url, { method: "GET" });
    const uploadHref = await getOperationLink(response, "upload");
    await executeFileOperation(uploadHref, data, "PUT");
  }

  /**
   * Удаляет файл из хранилища
   */
  async deleteFile(filePath: string): Promise<void> {
    const path = normalizePath(filePath);
    const url = buildApiUrl(this.baseUrl, "/resources", {
      path: `/${path}`,
      permanently: "true",
    });

    await this.makeRequest(url, { method: "DELETE" });
  }
}

