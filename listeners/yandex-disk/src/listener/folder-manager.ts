/**
 * Управление папками на Яндекс Диске
 */

import type { StorageProvider } from "@src/storage-provider/index.ts";
import { normalizePath, buildApiUrl } from "@src/storage-provider/utils.ts";
import { createAuthHeaders } from "@src/storage-provider/http-client.ts";

/**
 * Создает папку на Яндекс Диске
 */
export async function createFolder(
  folderPath: string,
  accessToken: string
): Promise<void> {
  const baseUrl = "https://cloud-api.yandex.net/v1/disk";
  const path = normalizePath(folderPath);
  const url = buildApiUrl(baseUrl, "/resources", {
    path: `/${path}`,
  });

  const headers = createAuthHeaders(accessToken);
  const response = await fetch(url, {
    method: "PUT",
    headers,
  });

  if (!response.ok && response.status !== 409) {
    // 409 означает, что папка уже существует, это нормально
    const errorText = await response.text();
    throw new Error(`Failed to create folder: ${response.status} ${errorText}`);
  }
}

/**
 * Проверяет существование папки и создает её при необходимости
 */
export async function ensureFolderExists(
  folderPath: string,
  storageProvider: StorageProvider,
  accessToken: string
): Promise<void> {
  try {
    await storageProvider.listFiles(folderPath);
    console.log(`✅ Папка ${folderPath} существует`);
  } catch (error) {
    // Если папка не существует (404), создаем её
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("404") || errorMessage.includes("NotFound")) {
      console.log(`📁 Создание папки ${folderPath}...`);
      try {
        await createFolder(folderPath, accessToken);
        console.log(`✅ Папка ${folderPath} создана`);
      } catch (createError) {
        console.warn(`⚠️  Не удалось создать папку ${folderPath}:`, createError);
      }
    } else {
      console.warn(`⚠️  Ошибка при проверке папки ${folderPath}:`, error);
    }
  }
}

/**
 * Создает все необходимые папки для работы LISTENER
 */
export async function ensureFoldersExist(
  baseFolder: string,
  requestsFolder: string,
  responsesFolder: string,
  storageProvider: StorageProvider,
  accessToken: string
): Promise<void> {
  // Создаем базовую папку .mysogatone, если её нет
  try {
    await storageProvider.listFiles(baseFolder);
    console.log(`✅ Базовая папка ${baseFolder} существует`);
  } catch (_error) {
    console.log(`📁 Создание базовой папки ${baseFolder}...`);
    try {
      await createFolder(baseFolder, accessToken);
      console.log(`✅ Базовая папка ${baseFolder} создана`);
    } catch (createError) {
      console.warn(`⚠️  Не удалось создать базовую папку ${baseFolder}:`, createError);
    }
  }

  // Создаем папку requests, если её нет (нужна для Monitor)
  await ensureFolderExists(requestsFolder, storageProvider, accessToken);

  // Создаем папку responses, если её нет
  await ensureFolderExists(responsesFolder, storageProvider, accessToken);
}

