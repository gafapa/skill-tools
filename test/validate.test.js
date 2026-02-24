import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixExtension, validateBuffer } from '../src/validate.js';

const pdfBuffer = Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.alloc(64, 0),
]);

const jpegBuffer = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10,
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
]);

const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C,
]);

const textBuffer = Buffer.alloc(64, 0x41);

test('validateBuffer accepts PDF', async () => {
    assert.equal(await validateBuffer(pdfBuffer, 'application/pdf'), true);
});

test('validateBuffer rejects JPEG as PDF', async () => {
    assert.equal(await validateBuffer(jpegBuffer, 'application/pdf'), false);
});

test('validateBuffer accepts image wildcard', async () => {
    assert.equal(await validateBuffer(jpegBuffer, 'image/'), true);
    assert.equal(await validateBuffer(pngBuffer, 'image/'), true);
});

test('validateBuffer rejects PDF as image wildcard', async () => {
    assert.equal(await validateBuffer(pdfBuffer, 'image/'), false);
});

test('validateBuffer returns false for unknown buffer', async () => {
    assert.equal(await validateBuffer(textBuffer, 'application/pdf'), false);
});

test('fixExtension corrects PDF extension', async () => {
    const fixed = await fixExtension('document.txt', pdfBuffer);
    assert.ok(fixed.endsWith('.pdf'));
});

test('fixExtension preserves JPEG extension', async () => {
    const fixed = await fixExtension('photo.jpg', jpegBuffer);
    assert.match(fixed, /\.(jpg|jpeg)$/);
});

test('fixExtension preserves unknown extension when type is unknown', async () => {
    assert.equal(await fixExtension('file.dat', textBuffer), 'file.dat');
});
