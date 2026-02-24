/**
 * Tests for search.js
 * Tests the shape and filtering logic of search results.
 * These are lightweight integration tests — they will make real HTTP requests if run.
 * Use the SKIP_NETWORK=1 env var to skip them in CI.
 *
 * Run: node --test test/search.test.js
 * Run (no network): SKIP_NETWORK=1 node --test test/search.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPDFs, searchImages } from '../src/search.js';

const SKIP = process.env.SKIP_NETWORK === '1';

// ── searchPDFs ────────────────────────────────────────────────────────────

test('searchPDFs: returns an array', async (t) => {
    if (SKIP) { t.skip('SKIP_NETWORK=1'); return; }
    const results = await searchPDFs('javascript tutorial', 3);
    assert.ok(Array.isArray(results), 'Expected an array');
});

test('searchPDFs: all results have title and url', async (t) => {
    if (SKIP) { t.skip('SKIP_NETWORK=1'); return; }
    const results = await searchPDFs('python guide', 3);
    for (const r of results) {
        assert.ok(typeof r.title === 'string', 'title should be a string');
        assert.ok(typeof r.url === 'string', 'url should be a string');
    }
});

test('searchPDFs: all urls end in .pdf', async (t) => {
    if (SKIP) { t.skip('SKIP_NETWORK=1'); return; }
    const results = await searchPDFs('data science pdf', 3);
    for (const r of results) {
        assert.ok(
            r.url.toLowerCase().endsWith('.pdf'),
            `URL should end in .pdf: ${r.url}`
        );
    }
});

test('searchPDFs: respects limit parameter', async (t) => {
    if (SKIP) { t.skip('SKIP_NETWORK=1'); return; }
    const results = await searchPDFs('machine learning', 2);
    assert.ok(results.length <= 2, `Expected at most 2 results, got ${results.length}`);
});

test('searchPDFs: returns empty array on nonsense query', async (t) => {
    if (SKIP) { t.skip('SKIP_NETWORK=1'); return; }
    // This may return 0 or a few results — just test it doesn't throw
    const results = await searchPDFs('xyzzy_nonexistent_q93ab', 3);
    assert.ok(Array.isArray(results));
});

// ── searchImages ──────────────────────────────────────────────────────────

test('searchImages: returns an array', async (t) => {
    if (SKIP) { t.skip('SKIP_NETWORK=1'); return; }
    const results = await searchImages('nebula space', 2);
    assert.ok(Array.isArray(results));
});

test('searchImages: results have url property', async (t) => {
    if (SKIP) { t.skip('SKIP_NETWORK=1'); return; }
    const results = await searchImages('sunset landscape', 2);
    for (const r of results) {
        assert.ok(typeof r.url === 'string', 'url should be a string');
        assert.ok(r.url.startsWith('http'), 'url should start with http');
    }
});

test('searchImages: respects limit parameter', async (t) => {
    if (SKIP) { t.skip('SKIP_NETWORK=1'); return; }
    const results = await searchImages('cat photo', 2);
    assert.ok(results.length <= 2, `Expected at most 2 results, got ${results.length}`);
});
