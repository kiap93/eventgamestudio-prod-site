import { validateUploadedFile, detectFileFormat, isSvgContent } from '../fileValidation.js';

console.log('--- Starting Magic Bytes & SVG Rejection Comprehensive Tests ---');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`, detail || '');
    process.exit(1);
  }
}

// 1. Valid file signatures (magic bytes)
const validPngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const validJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const validWebpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const validMp3Id3Bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const validMp3SyncBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00]);
const validWavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
const validOggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const validMp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const validMovBytes = new Uint8Array([0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]);
const validWebmBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]);

// 2. Malicious fake files
const maliciousPhpInPng = new TextEncoder().encode('<?php echo "pwned"; ?>');
const maliciousHtmlInPng = new TextEncoder().encode('<html><script>alert("xss")</script></html>');
const maliciousSvgInPng = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>');
const maliciousXmlSvgInPng = new TextEncoder().encode('<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">\n<svg width="100" height="100"></svg>');
const randomGarbageBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a]);

console.log('\n--- Section 1: Magic Bytes Detection ---');
assert(detectFileFormat(validPngBytes)?.format === 'PNG', 'detectFileFormat identifies PNG correctly');
assert(detectFileFormat(validJpegBytes)?.format === 'JPEG', 'detectFileFormat identifies JPEG correctly');
assert(detectFileFormat(validWebpBytes)?.format === 'WEBP', 'detectFileFormat identifies WEBP correctly');
assert(detectFileFormat(validMp3Id3Bytes)?.format === 'MP3', 'detectFileFormat identifies MP3 (ID3) correctly');
assert(detectFileFormat(validMp3SyncBytes)?.format === 'MP3', 'detectFileFormat identifies MP3 (sync word) correctly');
assert(detectFileFormat(validWavBytes)?.format === 'WAV', 'detectFileFormat identifies WAV correctly');
assert(detectFileFormat(validOggBytes)?.format === 'OGG', 'detectFileFormat identifies OGG correctly');
assert(detectFileFormat(validMp4Bytes)?.format === 'MP4', 'detectFileFormat identifies MP4 correctly');
assert(detectFileFormat(validMovBytes)?.format === 'MOV', 'detectFileFormat identifies MOV correctly');
assert(detectFileFormat(validWebmBytes)?.format === 'WEBM', 'detectFileFormat identifies WEBM correctly');
assert(detectFileFormat(maliciousPhpInPng) === null, 'detectFileFormat rejects arbitrary PHP code');
assert(detectFileFormat(randomGarbageBytes) === null, 'detectFileFormat rejects random garbage bytes');

console.log('\n--- Section 2: SVG Content Detection & Rejection ---');
assert(isSvgContent(maliciousSvgInPng) === true, 'isSvgContent detects plain SVG markup');
assert(isSvgContent(maliciousXmlSvgInPng) === true, 'isSvgContent detects XML SVG markup');
assert(isSvgContent(validPngBytes) === false, 'isSvgContent returns false for legitimate PNG bytes');
assert(isSvgContent(validJpegBytes) === false, 'isSvgContent returns false for legitimate JPEG bytes');

console.log('\n--- Section 3: Fake File Name vs Contents (MIME & Extension Spoofing) ---');
// File named something.png but contains PHP code
const spoofedPhp = validateUploadedFile(maliciousPhpInPng, {
  originalName: 'something.png',
  declaredMime: 'image/png',
});
assert(spoofedPhp.valid === false, 'Fake PNG with PHP content is rejected');
assert(spoofedPhp.code === 'UNSUPPORTED_FILE_TYPE', 'Fake PNG error code is UNSUPPORTED_FILE_TYPE');

// File named something.png but contains HTML code
const spoofedHtml = validateUploadedFile(maliciousHtmlInPng, {
  originalName: 'something.png',
  declaredMime: 'image/png',
});
assert(spoofedHtml.valid === false, 'Fake PNG with HTML content is rejected');

// File named something.png but contains SVG code
const spoofedSvg = validateUploadedFile(maliciousSvgInPng, {
  originalName: 'something.png',
  declaredMime: 'image/png',
});
assert(spoofedSvg.valid === false, 'Fake PNG containing SVG payload is rejected');
assert(spoofedSvg.code === 'SVG_NOT_ALLOWED', 'SVG payload in fake PNG returns SVG_NOT_ALLOWED');

// File named something.svg explicitly
const explicitSvg = validateUploadedFile(maliciousSvgInPng, {
  originalName: 'icon.svg',
  declaredMime: 'image/svg+xml',
});
assert(explicitSvg.valid === false, 'Explicit SVG file is rejected');
assert(explicitSvg.code === 'SVG_NOT_ALLOWED', 'Explicit SVG file code is SVG_NOT_ALLOWED');

// File named something.png with image/png MIME but actual JPEG magic bytes (Mismatched)
const mismatchedContent = validateUploadedFile(validJpegBytes, {
  originalName: 'something.png',
  declaredMime: 'image/png',
});
assert(mismatchedContent.valid === false, 'JPEG content with PNG extension/MIME is rejected');
assert(mismatchedContent.code === 'MIME_EXTENSION_MISMATCH', 'Mismatched content error code is MIME_EXTENSION_MISMATCH');

console.log('\n--- Section 4: Valid Uploads for All Supported Formats ---');
// PNG
const okPng = validateUploadedFile(validPngBytes, { originalName: 'hero.png', declaredMime: 'image/png' });
assert(okPng.valid === true, 'Valid PNG upload accepted');
assert(okPng.format === 'PNG', 'PNG format resolved correctly');
assert(okPng.mediaType === 'image', 'PNG mediaType is image');

// JPEG
const okJpeg = validateUploadedFile(validJpegBytes, { originalName: 'banner.jpg', declaredMime: 'image/jpeg' });
assert(okJpeg.valid === true, 'Valid JPEG upload accepted');
assert(okJpeg.format === 'JPEG', 'JPEG format resolved correctly');

// WEBP
const okWebp = validateUploadedFile(validWebpBytes, { originalName: 'sticker.webp', declaredMime: 'image/webp' });
assert(okWebp.valid === true, 'Valid WEBP upload accepted');
assert(okWebp.format === 'WEBP', 'WEBP format resolved correctly');

// MP3
const okMp3 = validateUploadedFile(validMp3Id3Bytes, { originalName: 'bgm.mp3', declaredMime: 'audio/mpeg' });
assert(okMp3.valid === true, 'Valid MP3 upload accepted');
assert(okMp3.mediaType === 'audio', 'MP3 mediaType is audio');

// WAV
const okWav = validateUploadedFile(validWavBytes, { originalName: 'sfx.wav', declaredMime: 'audio/wav' });
assert(okWav.valid === true, 'Valid WAV upload accepted');
assert(okWav.mediaType === 'audio', 'WAV mediaType is audio');

// OGG
const okOgg = validateUploadedFile(validOggBytes, { originalName: 'track.ogg', declaredMime: 'audio/ogg' });
assert(okOgg.valid === true, 'Valid OGG upload accepted');
assert(okOgg.mediaType === 'audio', 'OGG mediaType is audio');

// MP4
const okMp4 = validateUploadedFile(validMp4Bytes, { originalName: 'clip.mp4', declaredMime: 'video/mp4' });
assert(okMp4.valid === true, 'Valid MP4 upload accepted');
assert(okMp4.mediaType === 'video', 'MP4 mediaType is video');

// WEBM
const okWebm = validateUploadedFile(validWebmBytes, { originalName: 'reel.webm', declaredMime: 'video/webm' });
assert(okWebm.valid === true, 'Valid WEBM upload accepted');
assert(okWebm.mediaType === 'video', 'WEBM mediaType is video');

// MOV
const okMov = validateUploadedFile(validMovBytes, { originalName: 'raw.mov', declaredMime: 'video/quicktime' });
assert(okMov.valid === true, 'Valid MOV upload accepted');
assert(okMov.mediaType === 'video', 'MOV mediaType is video');

console.log('\n--- Section 5: Category & Media Type Isolation ---');
// Video uploaded when only image is allowed
const videoToImage = validateUploadedFile(validMp4Bytes, {
  originalName: 'clip.mp4',
  declaredMime: 'video/mp4',
  allowedMediaTypes: ['image'],
});
assert(videoToImage.valid === false, 'Video uploaded to image-only category is rejected');
assert(videoToImage.code === 'MEDIA_TYPE_NOT_ALLOWED', 'Video to image category returns MEDIA_TYPE_NOT_ALLOWED');

// Audio uploaded when only image is allowed
const audioToImage = validateUploadedFile(validMp3Id3Bytes, {
  originalName: 'sound.mp3',
  declaredMime: 'audio/mpeg',
  allowedMediaTypes: ['image'],
});
assert(audioToImage.valid === false, 'Audio uploaded to image-only category is rejected');
assert(audioToImage.code === 'MEDIA_TYPE_NOT_ALLOWED', 'Audio to image category returns MEDIA_TYPE_NOT_ALLOWED');

// Image uploaded when only audio is allowed
const imageToAudio = validateUploadedFile(validPngBytes, {
  originalName: 'pic.png',
  declaredMime: 'image/png',
  allowedMediaTypes: ['audio'],
});
assert(imageToAudio.valid === false, 'Image uploaded to audio-only category is rejected');
assert(imageToAudio.code === 'MEDIA_TYPE_NOT_ALLOWED', 'Image to audio category returns MEDIA_TYPE_NOT_ALLOWED');

console.log(`\n======================================================`);
console.log(` ALL ${passedTests}/${totalTests} MAGIC BYTES & SVG REJECTION TESTS PASSED!`);
console.log(`======================================================`);
