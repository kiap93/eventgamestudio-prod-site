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
 * Detects if a buffer contains SVG markup or XML/SVG declarations
 */
export function isSvgContent(buffer: Uint8Array | ArrayBuffer | Buffer): boolean {
  const bytes = toUint8Array(buffer);
  if (bytes.length === 0) return false;

  // Inspect up to first 1024 bytes
  const limit = Math.min(bytes.length, 1024);
  let text = '';
  for (let i = 0; i < limit; i++) {
    text += String.fromCharCode(bytes[i]);
  }
  const lower = text.toLowerCase();

  return (
    lower.includes('<svg') ||
    lower.includes('xmlns="http://www.w3.org/2000/svg"') ||
    lower.includes("xmlns='http://www.w3.org/2000/svg'") ||
    lower.includes('<!doctype svg') ||
    (lower.includes('<?xml') && lower.includes('<svg'))
  );
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
    // Search first 128 bytes for 'webm' (77 65 62 6D) or 'matroska'
    const scanLimit = Math.min(bytes.length, 128);
    let ebmlText = '';
    for (let i = 0; i < scanLimit; i++) {
      ebmlText += String.fromCharCode(bytes[i]);
    }
    if (ebmlText.includes('webm') || ebmlText.includes('matroska')) {
      return SUPPORTED_FORMATS.WEBM;
    }
  }

  return null;
}

export interface FileValidationOptions {
  originalName?: string;
  declaredMime?: string;
  allowedMediaTypes?: FileMediaType[];
  allowedFormats?: SupportedFileFormat[];
  maxSizeBytes?: number;
}

export interface FileValidationSuccess {
  valid: true;
  format: SupportedFileFormat;
  mediaType: FileMediaType;
  mimeType: string;
  extension: string;
  fileSize: number;
}

export interface FileValidationFailure {
  valid: false;
  error: string;
  code:
    | 'NO_FILE_UPLOADED'
    | 'FILE_TOO_LARGE'
    | 'SVG_NOT_ALLOWED'
    | 'UNSUPPORTED_FILE_TYPE'
    | 'MIME_EXTENSION_MISMATCH'
    | 'CORRUPTED_FILE';
}

export type FileValidationResult = FileValidationSuccess | FileValidationFailure;

/**
 * Comprehensive server-authoritative upload validation:
 * 1. Checks file presence & non-empty buffer
 * 2. Enforces maximum byte size limit
 * 3. Rejects SVG uploads explicitly (both in header, extension, and content)
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

  // 3. Reject SVG uploads explicitly
  if (
    ext === '.svg' ||
    declaredMime === 'image/svg+xml' ||
    declaredMime === 'image/svg' ||
    declaredMime === 'application/xml+svg' ||
    isSvgContent(bytes)
  ) {
    return {
      valid: false,
      error: 'SVG uploads are not permitted for security reasons. Please upload raster images (PNG, JPEG, WEBP).',
      code: 'SVG_NOT_ALLOWED',
    };
  }

  // 4. Validate binary magic bytes / file signature
  const detected = detectFileFormat(bytes);
  if (!detected) {
    const allowedListDesc = options.allowedFormats
      ? options.allowedFormats.join(', ')
      : 'PNG, JPEG, WEBP, MP3, WAV, OGG, MP4, WEBM, MOV';
    return {
      valid: false,
      error: `Unsupported file signature. The file content does not match any allowed format (${allowedListDesc}).`,
      code: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  // 5. Verify allowed media types (e.g., image vs audio vs video)
  if (options.allowedMediaTypes && !options.allowedMediaTypes.includes(detected.mediaType)) {
    return {
      valid: false,
      error: `File type "${detected.mediaType}" (${detected.format}) is not allowed in this category. Allowed types: ${options.allowedMediaTypes.join(', ')}.`,
      code: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  // 6. Verify allowed specific formats
  if (options.allowedFormats && !options.allowedFormats.includes(detected.format)) {
    return {
      valid: false,
      error: `File format "${detected.format}" is not allowed. Allowed formats: ${options.allowedFormats.join(', ')}.`,
      code: 'UNSUPPORTED_FILE_TYPE',
    };
  }

  // 7. Enforce consistency between extension and detected format
  if (ext) {
    if (!detected.allowedExtensions.includes(ext)) {
      // Special case: MP4 vs MOV (both use ISOBMFF; if declared .mov with ftyp, allow MOV)
      const isIsobmffCompatible =
        (detected.format === 'MP4' && ext === '.mov') ||
        (detected.format === 'MOV' && ext === '.mp4');

      if (!isIsobmffCompatible) {
        return {
          valid: false,
          error: `File extension "${ext}" does not match detected file content (${detected.format}).`,
          code: 'MIME_EXTENSION_MISMATCH',
        };
      }
    }
  }

  // 8. Enforce consistency between declared MIME type and detected format
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

  return {
    valid: true,
    format: detected.format,
    mediaType: detected.mediaType,
    mimeType: detected.canonicalMime,
    extension: ext || detected.canonicalExtension,
    fileSize: bytes.length,
  };
}
