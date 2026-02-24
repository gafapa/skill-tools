import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { downloadFile } from '../src/download.js';

const pdfBuffer = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(128, 0)]);
const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C,
]);

async function withServer(handler, fn) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    try {
        return await fn(baseUrl);
    } finally {
        await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
}

async function withTempDir(fn) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-tools-download-'));
    try {
        return await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

test('downloadFile downloads and fixes PDF extension', async () => {
    await withServer((req, res) => {
        if (req.url === '/doc.bin') {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(pdfBuffer);
            return;
        }
        res.writeHead(404).end();
    }, async (baseUrl) => {
        await withTempDir(async (dir) => {
            const saved = await downloadFile(`${baseUrl}/doc.bin`, dir, 'pdf');
            assert.ok(saved);
            assert.ok(saved.endsWith('.pdf'), `Expected .pdf output, got ${saved}`);
            const st = await fs.stat(saved);
            assert.ok(st.size > 0);
        });
    });
});

test('downloadFile downloads image when expectedType=image', async () => {
    await withServer((req, res) => {
        if (req.url === '/image.file') {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(pngBuffer);
            return;
        }
        res.writeHead(404).end();
    }, async (baseUrl) => {
        await withTempDir(async (dir) => {
            const saved = await downloadFile(`${baseUrl}/image.file`, dir, 'image');
            assert.ok(saved);
            assert.ok(saved.endsWith('.png'), `Expected .png output, got ${saved}`);
        });
    });
});

test('downloadFile returns null for MIME mismatch', async () => {
    await withServer((req, res) => {
        if (req.url === '/not-a-pdf.bin') {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(pngBuffer);
            return;
        }
        res.writeHead(404).end();
    }, async (baseUrl) => {
        await withTempDir(async (dir) => {
            const saved = await downloadFile(`${baseUrl}/not-a-pdf.bin`, dir, 'pdf');
            assert.equal(saved, null);
            const files = await fs.readdir(dir);
            assert.equal(files.length, 0, `Expected no files left behind, found: ${files.join(', ')}`);
        });
    });
});
