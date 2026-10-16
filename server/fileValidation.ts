/**
 * Server-side File Validation & Magic Byte Signature Verification
 * 
 * Provides cryptographic/binary inspection of file signatures (magic bytes) to prevent
 * MIME spoofing, extension renaming, and malicious payload uploads (e.g. renaming an
 * executable or SVG with embedded scripts to something.png).
 * 
 * Recommended Formats:
 * - Normal game assets: PNG, JPEG (JPG), WEBP
 * - Audio: MP3, WAV, OGG
 * - Video: MP4, WEBM, MOV
 * 
 * Security Policy:
 * - SVG files are strictly rejected (cannot be stored in public buckets without XSS/XXE risks).
 * - Both MIME type and file extension must be allowed AND consistent with detected magic bytes.
 * - Files that do not match known, safe binary signatures are rejected.
 */

export type SupportedFileFormat =
  | 'PNG'
  | 'JPEG'
  | 'WEBP'
  | 'SVG'
  | 'MP3'
  | 'WAV'
  | 'OGG'
  | 'MP4'
  | 'WEBM'
  | 'MOV';

export type FileMediaType = 'image' | 'audio' | 'video';

export interface FileFormatDefinition {
  format: SupportedFileFormat;
  mediaType: FileMediaType;
  allowedMimes: string[];
  allowedExtensions: string[];
  canonicalMime: string;
  canonicalExtension: string;
}

export const SUPPORTED_FORMATS: Record<SupportedFileFormat, FileFormatDefinition> = {
  PNG: {
    format: 'PNG',
    mediaType: 'image',
    allowedMimes: ['image/png'],
    allowedExtensions: ['.png'],
    canonicalMime: 'image/png',
    canonicalExtension: '.png',
  },
  JPEG: {
    format: 'JPEG',
    mediaType: 'image',
    allowedMimes: ['image/jpeg', 'image/jpg'],
    allowedExtensions: ['.jpg', '.jpeg'],
    canonicalMime: 'image/jpeg',
    canonicalExtension: '.jpg',
  },
  WEBP: {
    format: 'WEBP',
    mediaType: 'image',
    allowedMimes: ['image/webp'],
    allowedExtensions: ['.webp'],
    canonicalMime: 'image/webp',
    canonicalExtension: '.webp',
  },
  SVG: {
    format: 'SVG',
    mediaType: 'image',
    allowedMimes: ['image/svg+xml', 'image/svg', 'application/xml+svg'],
    allowedExtensions: ['.svg'],
    canonicalMime: 'image/svg+xml',
    canonicalExtension: '.svg',
  },
  MP3: {
    format: 'MP3',
    mediaType: 'audio',
    allowedMimes: ['audio/mpeg', 'audio/mp3'],
    allowedExtensions: ['.mp3'],
    canonicalMime: 'audio/mpeg',
    canonicalExtension: '.mp3',
  },
  WAV: {
    format: 'WAV',
    mediaType: 'audio',
    allowedMimes: ['audio/wav', 'audio/x-wav', 'audio/wave'],
    allowedExtensions: ['.wav'],
    canonicalMime: 'audio/wav',
    canonicalExtension: '.wav',
  },
  OGG: {
    format: 'OGG',
    mediaType: 'audio',
    allowedMimes: ['audio/ogg', 'application/ogg', 'video/ogg'],
    allowedExtensions: ['.ogg'],
    canonicalMime: 'audio/ogg',
    canonicalExtension: '.ogg',
  },
  MP4: {
    format: 'MP4',
    mediaType: 'video',
    allowedMimes: ['video/mp4'],
    allowedExtensions: ['.mp4'],
    canonicalMime: 'video/mp4',
    canonicalExtension: '.mp4',
  },
  WEBM: {
    format: 'WEBM',
    mediaType: 'video',
    allowedMimes: ['video/webm'],
    allowedExtensions: ['.webm'],
    canonicalMime: 'video/webm',
    canonicalExtension: '.webm',
  },
  MOV: {
    format: 'MOV',
    mediaType: 'video',
    allowedMimes: ['video/quicktime'],
    allowedExtensions: ['.mov'],
    canonicalMime: 'video/quicktime',
    canonicalExtension: '.mov',
  },
};

/**
 * Extracts width and height from PNG, JPEG, and WEBP buffers without native libraries.
 * Fully compatible with Cloudflare Workers (V8 isolate) and Node.js.
 */
export function extractRasterImageDimensions(
  buffer: Uint8Array | ArrayBuffer | Buffer
): { width: number; height: number } | null {
  const bytes = toUint8Array(buffer);
  if (!bytes || bytes.length < 16) return null;

  // 1. PNG: Inspect IHDR chunk
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    if (
      bytes[12] === 0x49 &&
      bytes[13] === 0x48 &&
      bytes[14] === 0x44 &&
      bytes[15] === 0x52
    ) {
      const width =
        ((bytes[16] << 24) >>> 0) +
        (bytes[17] << 16) +
        (bytes[18] << 8) +
        bytes[19];
      const height =
        ((bytes[20] << 24) >>> 0) +
        (bytes[21] << 16) +
        (bytes[22] << 8) +
        bytes[23];
      return { width, height };
    }
  }

  // 2. JPEG: Scan markers for SOF
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) {
        offset++;
      }
      if (offset >= bytes.length) break;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break; // EOI or SOS
      if (offset + 2 > bytes.length) break;
      const len = (bytes[offset] << 8) | bytes[offset + 1];
      const isSof = [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
        0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
      ].includes(marker);
      if (isSof && offset + 7 <= bytes.length) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
        return { width, height };
      }
      offset += len;
    }
  }

  // 3. WEBP: RIFF container with WEBP chunk
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    // Lossy VP8
    if (
      chunkType === 'VP8 ' &&
      bytes.length >= 30 &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      return { width, height };
    }
    // Lossless VP8L
    if (chunkType === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const b1 = bytes[21];
      const b2 = bytes[22];
      const b3 = bytes[23];
      const b4 = bytes[24];
      const val = b1 | (b2 << 8) | (b3 << 16) | (b4 << 24);
      const width = 1 + (val & 0x3fff);
      const height = 1 + ((val >>> 14) & 0x3fff);
      return { width, height };
    }
    // Extended VP8X
    if (chunkType === 'VP8X' && bytes.length >= 30) {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
  }

  return null;
}

/**
 * Normalizes any buffer-like input into a standard Uint8Array
 */
export function toUint8Array(input: Uint8Array | ArrayBuffer | Buffer | any): Uint8Array {
  if (!input) return new Uint8Array(0);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return new Uint8Array(0);
}

/**
 * Inspects raw bytes to detect known, safe file signatures (magic bytes)
 */
export function detectFileFormat(buffer: Uint8Array | ArrayBuffer | Buffer): FileFormatDefinition | null {
  const bytes = toUint8Array(buffer);
  if (bytes.length < 3) return null;

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return SUPPORTED_FORMATS.PNG;
  }

  // 2. JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return SUPPORTED_FORMATS.JPEG;
  }

  // 3. RIFF Container: bytes 0..3 === 'RIFF' (52 49 46 46)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    // Check bytes 8..11: 'WEBP' (57 45 42 50)
    if (
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return SUPPORTED_FORMATS.WEBP;
    }

    // Check bytes 8..11: 'WAVE' (57 41 56 45)
    if (
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45
    ) {
      return SUPPORTED_FORMATS.WAV;
    }
  }

  // 4. Ogg Container: bytes 0..3 === 'OggS' (4F 67 67 53)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return SUPPORTED_FORMATS.OGG;
  }

  // 5. MP3:
  // Case A: ID3v2 tag (49 44 33 -> 'ID3')
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return SUPPORTED_FORMATS.MP3;
  }
  // Case B: Raw MPEG frame sync word (0xFF, upper 3 bits of next byte set)
  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    (bytes[1] & 0xe0) === 0xe0 &&
    (bytes[1] & 0x18) !== 0x08 && // MPEG audio version not reserved
    (bytes[1] & 0x06) !== 0x00    // Layer not reserved
  ) {
    return SUPPORTED_FORMATS.MP3;
  }

  // 6. MP4 & MOV (ISOBMFF):
  // Typically contains 'ftyp' at bytes 4..7 (66 74 79 70)
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    // Check if brand is QuickTime 'qt  ' (71 74 20 20)
    if (
      bytes.length >= 12 &&
      bytes[8] === 0x71 &&
      bytes[9] === 0x74 &&
      bytes[10] === 0x20 &&
      bytes[11] === 0x20
    ) {
      return SUPPORTED_FORMATS.MOV;
    }
    return SUPPORTED_FORMATS.MP4;
  }

  // QuickTime container alternatives: 'moov', 'wide', 'mdat', 'free' at bytes 4..7
  if (bytes.length >= 8) {
    const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (box === 'moov' || box === 'wide' || box === 'mdat' || box === 'free') {
      return SUPPORTED_FORMATS.MOV;
    }
  }

  // 7. WEBM: EBML container (1A 45 DF A3)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    // Search first 512 bytes for 'webm' or 'matroska' DocType, or allow short valid EBML headers
    const scanLimit = Math.min(bytes.length, 512);
    let ebmlText = '';
    for (let i = 0; i < scanLimit; i++) {
      ebmlText += String.fromCharCode(bytes[i]);
    }
    if (ebmlText.includes('webm') || ebmlText.includes('matroska') || bytes.length <= 32) {
      return SUPPORTED_FORMATS.WEBM;
    }
  }

  return null;
}

/**
 * Detects if a buffer contains genuine SVG markup or XML/SVG declarations.
 * Strictly verifies that binary raster/media files are not classified as SVG.
 */
export function isSvgContent(buffer: Uint8Array | ArrayBuffer | Buffer): boolean {
  const bytes = toUint8Array(buffer);
  if (bytes.length === 0) return false;

  // 1. Files matching known binary magic bytes (PNG, JPEG, WEBP, etc.) are never SVG
  if (detectFileFormat(bytes) !== null) {
    return false;
  }

  // 2. GIF signature check ('GIF87a' or 'GIF89a')
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return false;
  }

  // 3. Binary check: SVG is XML text. Leading bytes of text (UTF-8/ASCII) never contain null bytes (0x00)
  // unless UTF-16 with BOM (0xFE 0xFF or 0xFF 0xFE).
  const isUtf16 =
    bytes.length >= 2 &&
    ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0xff && bytes[1] === 0xfe));
  if (!isUtf16) {
    const scanLimit = Math.min(bytes.length, 256);
    for (let i = 0; i < scanLimit; i++) {
      if (bytes[i] === 0x00) {
        return false;
      }
    }
  }

  // Inspect up to first 8192 bytes for SVG tags, XML definitions, or namespaces
  const limit = Math.min(bytes.length, 8192);
  let text = '';
  for (let i = 0; i < limit; i++) {
    text += String.fromCharCode(bytes[i]);
  }
  const lower = text.toLowerCase();

  // Must contain an actual SVG root tag, DOCTYPE svg, or SVG namespace
  const hasSvgTag = /<svg[\s>/]/i.test(text);
  const hasSvgNamespace =
    lower.includes('xmlns="http://www.w3.org/2000/svg"') ||
    lower.includes("xmlns='http://www.w3.org/2000/svg'");
  const hasSvgDoctype = /<!doctype\s+svg/i.test(text);

  return hasSvgTag || hasSvgNamespace || hasSvgDoctype;
}

export interface FileValidationOptions {
  originalName?: string;
  declaredMime?: string;
  allowedMediaTypes?: FileMediaType[];
  allowedFormats?: SupportedFileFormat[];
  maxSizeBytes?: number;
  allowSvg?: boolean;
  isEdgeRuntime?: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

export interface FileValidationSuccess {
  valid: true;
  error?: undefined;
  code?: undefined;
  format: SupportedFileFormat;
  mediaType: FileMediaType;
  mimeType: string;
  extension: string;
  fileSize: number;
  processedBuffer?: Uint8Array | Buffer;
  originalFormat?: SupportedFileFormat;
  width?: number;
  height?: number;
}

export interface FileValidationFailure {
  valid: false;
  error: string;
  code:
    | 'NO_FILE_UPLOADED'
    | 'FILE_TOO_LARGE'
    | 'SVG_NOT_ALLOWED'
    | 'SVG_CONVERSION_UNAVAILABLE'
    | 'SVG_SECURITY_VIOLATION'
    | 'SVG_XXE_FORBIDDEN'
    | 'MALFORMED_SVG'
    | 'INVALID_SVG_ROOT'
    | 'UNSUPPORTED_FILE_TYPE'
    | 'MEDIA_TYPE_NOT_ALLOWED'
    | 'MIME_EXTENSION_MISMATCH'
    | 'CORRUPTED_FILE'
    | 'DIMENSIONS_EXCEEDED';
  format?: undefined;
  mediaType?: undefined;
  mimeType?: string;
  extension?: string;
  fileSize?: number;
}

export type FileValidationResult = FileValidationSuccess | FileValidationFailure;

/**
 * Comprehensive server-authoritative upload validation:
 * 1. Checks file presence & non-empty buffer
 * 2. Enforces maximum byte size limit
 * 3. Handles SVG uploads (rejects unless explicitly enabled with allowSvg)
 * 4. Validates actual binary magic bytes / file signature
 * 5. Enforces consistency between declared MIME, file extension, and detected magic bytes
 * 6. Verifies media category compliance (e.g. image vs audio vs video)
 */
export function validateUploadedFile(
  buffer: Uint8Array | ArrayBuffer | Buffer | any,
  options: FileValidationOptions = {}
): FileValidationResult {
  const bytes = toUint8Array(buffer);

  // 1. File presence
  if (!bytes || bytes.length === 0) {
    return {
      valid: false,
      error: 'No file uploaded or file is empty',
      code: 'NO_FILE_UPLOADED',
    };
  }

  // 2. File size limit
  const maxBytes = options.maxSizeBytes || 25 * 1024 * 1024; // Default 25MB
  if (bytes.length > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(1);
    const actualMb = (bytes.length / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size exceeds maximum allowed limit of ${maxMb}MB (${actualMb}MB provided).`,
      code: 'FILE_TOO_LARGE',
    };
  }

  const rawName = (options.originalName || '').trim();
  const dotIndex = rawName.lastIndexOf('.');
  const ext = dotIndex !== -1 ? rawName.slice(dotIndex).toLowerCase() : '';
  const declaredMime = (options.declaredMime || 'application/octet-stream').toLowerCase().trim();

  // 3. Binary magic bytes / file signature detection (PNG, JPEG, WEBP, MP3, etc.)
  const detected = detectFileFormat(bytes);

  if (detected) {
    // If genuine binary content is renamed with .svg extension or SVG MIME type, reject as spoofing
    if (ext === '.svg' || declaredMime === 'image/svg+xml' || declaredMime === 'image/svg') {
      return {
        valid: false,
        error: `File extension "${ext}" does not match detected file content (${detected.format}).`,
        code: 'MIME_EXTENSION_MISMATCH',
      };
    }

    // Verify allowed media types (e.g., image vs audio vs video)
    if (options.allowedMediaTypes && !options.allowedMediaTypes.includes(detected.mediaType)) {
      return {
        valid: false,
        error: `File type "${detected.mediaType}" (${detected.format}) is not allowed in this category. Allowed types: ${options.allowedMediaTypes.join(', ')}.`,
        code: 'MEDIA_TYPE_NOT_ALLOWED',
      };
    }

    // Verify allowed specific formats
    if (options.allowedFormats && !options.allowedFormats.includes(detected.format)) {
      return {
        valid: false,
        error: `File format "${detected.format}" is not allowed. Allowed formats: ${options.allowedFormats.join(', ')}.`,
        code: 'UNSUPPORTED_FILE_TYPE',
      };
    }

    // Enforce consistency between extension and detected format
    if (ext) {
      const isIsobmffCompatible =
        (detected.format === 'MP4' && ext === '.mov') ||
        (detected.format === 'MOV' && ext === '.mp4');

      if (!detected.allowedExtensions.includes(ext) && !isIsobmffCompatible) {
        return {
          valid: false,
          error: `File extension "${ext}" does not match detected file content (${detected.format}).`,
          code: 'MIME_EXTENSION_MISMATCH',
        };
      }
    }

    // Enforce consistency between declared MIME type and detected format
    if (declaredMime && declaredMime !== 'application/octet-stream') {
      const isMimeAllowed = detected.allowedMimes.includes(declaredMime);
      const isIsobmffMime =
        (detected.format === 'MP4' && declaredMime === 'video/quicktime') ||
        (detected.format === 'MOV' && declaredMime === 'video/mp4');

      if (!isMimeAllowed && !isIsobmffMime) {
        return {
          valid: false,
          error: `Declared MIME type "${declaredMime}" does not match detected file content (${detected.format}).`,
          code: 'MIME_EXTENSION_MISMATCH',
        };
      }
    }

    // Check dimensions for raster images if constraints are set
    let width: number | undefined;
    let height: number | undefined;
    if (detected.mediaType === 'image') {
      const dims = extractRasterImageDimensions(bytes);
      if (dims) {
        width = dims.width;
        height = dims.height;
        if (options.maxWidth && dims.width > options.maxWidth) {
          return {
            valid: false,
            error: `Image width (${dims.width}px) exceeds maximum allowed width (${options.maxWidth}px).`,
            code: 'DIMENSIONS_EXCEEDED',
          };
        }
        if (options.maxHeight && dims.height > options.maxHeight) {
          return {
            valid: false,
            error: `Image height (${dims.height}px) exceeds maximum allowed height (${options.maxHeight}px).`,
            code: 'DIMENSIONS_EXCEEDED',
          };
        }
      }
    }

    return {
      valid: true,
      format: detected.format,
      mediaType: detected.mediaType,
      mimeType: detected.canonicalMime,
      extension: ext || detected.canonicalExtension,
      fileSize: bytes.length,
      processedBuffer: bytes,
      width,
      height,
    };
  }

  // 4. Non-binary files: Check for SVG content
  const isSvg =
    ext === '.svg' ||
    declaredMime === 'image/svg+xml' ||
    declaredMime === 'image/svg' ||
    declaredMime === 'application/xml+svg' ||
    isSvgContent(bytes);

  if (isSvg) {
    if (!options.allowSvg) {
      return {
        valid: false,
        error: 'SVG uploads are not permitted for security reasons. Please upload raster images (PNG, JPEG, WEBP).',
        code: 'SVG_NOT_ALLOWED',
      };
    }

    if (ext && ext !== '.svg') {
      return {
        valid: false,
        error: `File content is SVG but declared extension is "${ext}". File renaming/spoofing is forbidden.`,
        code: 'MIME_EXTENSION_MISMATCH',
      };
    }

    if (options.isEdgeRuntime) {
      return {
        valid: false,
        error: 'SVG conversion is unavailable in this runtime environment. Please upload a raster image (PNG, JPEG, or WEBP).',
        code: 'SVG_CONVERSION_UNAVAILABLE',
      };
    }

    return {
      valid: true,
      format: 'SVG',
      mediaType: 'image',
      mimeType: 'image/svg+xml',
      extension: '.svg',
      fileSize: bytes.length,
      processedBuffer: bytes,
    };
  }

  // 5. Neither detected binary format nor SVG
  const allowedListDesc = options.allowedFormats
    ? options.allowedFormats.join(', ')
    : 'PNG, JPEG, WEBP, MP3, WAV, OGG, MP4, WEBM, MOV';
  return {
    valid: false,
    error: `Unsupported file signature. The file content does not match any allowed format (${allowedListDesc}).`,
    code: 'UNSUPPORTED_FILE_TYPE',
  };
}

