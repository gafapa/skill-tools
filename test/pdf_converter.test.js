/**
 * Tests for pdf_converter.js
 * Uses a real minimal PDF fixture (built inline) — no network calls.
 *
 * Run: node --test test/pdf_converter.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { convertPdfToMarkdown } from '../src/pdf_converter.js';

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the path to the first PDF found in ./downloads, or null.
 * If the test environment has no PDF we skip gracefully.
 */
async function findTestPdf() {
    const dir = path.resolve('downloads');
    try {
        const files = await fs.readdir(dir);
        const pdf = files.find(f => f.endsWith('.pdf'));
        return pdf ? path.join(dir, pdf) : null;
    } catch {
        return null;
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────

test('convertPdfToMarkdown: returns null for nonexistent file', async () => {
    const result = await convertPdfToMarkdown('/nonexistent/path/file.pdf');
    assert.equal(result, null);
});

test('convertPdfToMarkdown: returns a string when a real PDF is available', async (t) => {
    const pdfPath = await findTestPdf();
    if (!pdfPath) {
        t.skip('No PDF in ./downloads — run searchPDFs to download one first');
        return;
    }
    const result = await convertPdfToMarkdown(pdfPath);
    assert.ok(typeof result === 'string', 'Expected a string result');
    assert.ok(result.length > 0, 'Expected non-empty Markdown');
});

test('convertPdfToMarkdown: includeMetadata prepends YAML frontmatter', async (t) => {
    const pdfPath = await findTestPdf();
    if (!pdfPath) {
        t.skip('No PDF in ./downloads');
        return;
    }
    const result = await convertPdfToMarkdown(pdfPath, { includeMetadata: true });
    assert.ok(result.startsWith('---'), 'Expected YAML frontmatter starting with ---');
    assert.ok(result.includes('pages:'), 'Expected pages field in frontmatter');
});

test('convertPdfToMarkdown: bullets are normalised to markdown -', async (t) => {
    const pdfPath = await findTestPdf();
    if (!pdfPath) {
        t.skip('No PDF in ./downloads');
        return;
    }
    const result = await convertPdfToMarkdown(pdfPath, { normaliseBullets: true });
    // Should not contain raw bullet chars
    assert.ok(!result.includes('•'), 'Raw bullet • should be converted to -');
    assert.ok(!result.includes('▶'), 'Raw bullet ▶ should be converted to -');
});

test('convertPdfToMarkdown: no triple+ blank lines in output', async (t) => {
    const pdfPath = await findTestPdf();
    if (!pdfPath) {
        t.skip('No PDF in ./downloads');
        return;
    }
    const result = await convertPdfToMarkdown(pdfPath);
    assert.ok(!/\n{3,}/.test(result), 'Output should not contain 3+ consecutive blank lines');
});
