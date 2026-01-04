/**
 * Утилиты для LISTENER
 */

/**
 * Задержка на указанное количество миллисекунд
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Форматирует лог с timestamp
 */
export function logWithTimestamp(message: string): string {
  const timestamp = Date.now();
  return `[${timestamp}] ${message}`;
}

/**
 * Декодирует TLS-запись для логирования
 * TLS Record Format:
 * - Content Type (1 byte): 0x16 = Handshake, 0x17 = Application Data, 0x14 = Change Cipher Spec, 0x15 = Alert
 * - Version (2 bytes): 0x03 0x03 = TLS 1.2, 0x03 0x04 = TLS 1.3
 * - Length (2 bytes): длина данных
 * - Data: сами данные
 */
export function decodeTLSRecord(data: Uint8Array): {
  contentType: string;
  version: string;
  length: number;
  handshakeType?: string;
  isTLS: boolean;
} {
  if (data.length < 5) {
    return {
      contentType: "Unknown",
      version: "Unknown",
      length: data.length,
      isTLS: false,
    };
  }

  const contentType = data[0];
  const version = (data[1] << 8) | data[2];
  const length = (data[3] << 8) | data[4];

  const contentTypeNames: Record<number, string> = {
    0x14: "Change Cipher Spec",
    0x15: "Alert",
    0x16: "Handshake",
    0x17: "Application Data",
  };

  const versionNames: Record<number, string> = {
    0x0301: "TLS 1.0",
    0x0302: "TLS 1.1",
    0x0303: "TLS 1.2",
    0x0304: "TLS 1.3",
  };

  const contentTypeName = contentTypeNames[contentType] ||
    `Unknown (0x${contentType.toString(16).padStart(2, "0")})`;
  const versionName = versionNames[version] ||
    `Unknown (0x${version.toString(16).padStart(4, "0")})`;

  // Для Handshake сообщений декодируем тип handshake
  // Handshake сообщение имеет структуру:
  // - Handshake Type (1 byte) - байт 5 в TLS Record
  // - Length (3 bytes) - байты 6-8
  // - Data - байты 9+
  let handshakeType: string | undefined;
  if (contentType === 0x16 && data.length >= 6) {
    const handshakeTypeByte = data[5];
    const handshakeTypeNames: Record<number, string> = {
      0x01: "ClientHello",
      0x02: "ServerHello",
      0x0b: "Certificate",
      0x0c: "ServerKeyExchange",
      0x0d: "CertificateRequest",
      0x0e: "ServerHelloDone",
      0x0f: "CertificateVerify",
      0x10: "ClientKeyExchange",
      0x14: "Finished",
    };
    handshakeType = handshakeTypeNames[handshakeTypeByte] ||
      `Unknown (0x${handshakeTypeByte.toString(16).padStart(2, "0")})`;
  }

  const isTLS = contentType === 0x16 || contentType === 0x17 ||
    contentType === 0x14 || contentType === 0x15;

  return {
    contentType: contentTypeName,
    version: versionName,
    length,
    handshakeType,
    isTLS,
  };
}

/**
 * Декодирует все TLS-записи в данных
 * TLS записи могут быть объединены в один буфер
 */
export function decodeAllTLSRecords(data: Uint8Array): Array<{
  offset: number;
  contentType: string;
  version: string;
  recordLength: number;
  dataLength: number;
  handshakeType?: string;
  isTLS: boolean;
}> {
  const records: Array<{
    offset: number;
    contentType: string;
    version: string;
    recordLength: number;
    dataLength: number;
    handshakeType?: string;
    isTLS: boolean;
  }> = [];

  let offset = 0;

  while (offset < data.length) {
    if (data.length - offset < 5) {
      // Недостаточно данных для TLS-записи
      break;
    }

    const recordInfo = decodeTLSRecord(data.slice(offset));
    const recordLength = 5 + recordInfo.length; // 5 байт заголовка + длина данных

    records.push({
      offset,
      contentType: recordInfo.contentType,
      version: recordInfo.version,
      recordLength,
      dataLength: recordInfo.length,
      handshakeType: recordInfo.handshakeType,
      isTLS: recordInfo.isTLS,
    });

    offset += recordLength;
  }

  return records;
}
