import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { convertPdfToMarkdown } from '../src/pdf_converter.js';

async function findDownloadedPdf() {
    const dir = path.resolve('downloads');
    try {
        const files = await fs.readdir(dir);
        const pdf = files.find((f) => f.toLowerCase().endsWith('.pdf'));
        return pdf ? path.join(dir, pdf) : null;
    } catch {
        return null;
    }
}

test('convertPdfToMarkdown returns null for missing file', async () => {
    const result = await convertPdfToMarkdown(path.resolve('does-not-exist.pdf'));
    assert.equal(result, null);
});

test('convertPdfToMarkdown converts a local PDF if available', async (t) => {
    const pdfPath = await findDownloadedPdf();
    if (!pdfPath) {
        t.skip('No PDF found in ./downloads');
        return;
    }

    const md = await convertPdfToMarkdown(pdfPath, { includeMetadata: true });
    assert.equal(typeof md, 'string');
    assert.ok(md.length > 0);
    assert.ok(md.startsWith('---'));
    assert.match(md, /pages:\s+\d+/);
    assert.ok(!/\n{3,}/.test(md));
});
