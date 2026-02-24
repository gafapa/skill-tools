/**
 * Tests for validate.js
 * Uses real magic-byte buffers — no network calls.
 *
 * Run: node --test test/validate.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBuffer, fixExtension } from '../src/validate.js';

// ── Minimal real magic-bytes ──────────────────────────────────────────────

// PDF: starts with %PDF — file-type detects this reliably even from small buffers
const pdfBuffer = Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.alloc(64, 0),
]);

// JPEG: FFD8FFE0 followed by JFIF header (must be at least 12 bytes)
const jpegBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
]);

// PNG: 8-byte signature + IHDR chunk (at least 33 bytes total for detection)
const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR length + type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth, color type, ...
    0xDE, 0x00, 0x00, 0x00, 0x0C,                   // CRC + IDAT length
]);

// Invalid / plaintext — no recognisable signature
const textBuffer = Buffer.alloc(64, 0x41); // 64 'A' bytes

// ── validateBuffer ────────────────────────────────────────────────────────

test('validateBuffer: valid PDF accepted as application/pdf', async () => {
    const result = await validateBuffer(pdfBuffer, 'application/pdf');
    assert.equal(result, true);
});

test('validateBuffer: JPEG rejected as application/pdf', async () => {
    const result = await validateBuffer(jpegBuffer, 'application/pdf');
    assert.equal(result, false);
});

test('validateBuffer: JPEG accepted as image/', async () => {
    const result = await validateBuffer(jpegBuffer, 'image/');
    assert.equal(result, true);
});

test('validateBuffer: PNG accepted as image/', async () => {
    const result = await validateBuffer(pngBuffer, 'image/');
    assert.equal(result, true);
});

test('validateBuffer: PDF rejected as image/', async () => {
    const result = await validateBuffer(pdfBuffer, 'image/');
    assert.equal(result, false);
});

test('validateBuffer: unknown buffer returns false', async () => {
    const result = await validateBuffer(textBuffer, 'application/pdf');
    assert.equal(result, false);
});

// ── fixExtension ──────────────────────────────────────────────────────────

test('fixExtension: wrong extension is corrected for PDF', async () => {
    const fixed = await fixExtension('document.txt', pdfBuffer);
    assert.ok(fixed.endsWith('.pdf'), `Expected .pdf extension, got: ${fixed}`);
});

test('fixExtension: correct extension is preserved for JPEG', async () => {
    const fixed = await fixExtension('photo.jpg', jpegBuffer);
    assert.match(fixed, /\.(jpg|jpeg)$/, `Expected .jpg/.jpeg, got: ${fixed}`);
});

test('fixExtension: unknown buffer keeps original name', async () => {
    const fixed = await fixExtension('file.dat', textBuffer);
    assert.equal(fixed, 'file.dat');
});
