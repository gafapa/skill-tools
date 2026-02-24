import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchImages, searchPDFs } from '../src/search.js';

const RUN = process.env.RUN_NETWORK_TESTS === '1';

test('integration: searchPDFs returns shaped results', async (t) => {
    if (!RUN) {
        t.skip('Set RUN_NETWORK_TESTS=1 to run network search integration tests');
        return;
    }

    const results = await searchPDFs('javascript tutorial', 3);
    assert.ok(Array.isArray(results));
    for (const r of results) {
        assert.equal(typeof r.title, 'string');
        assert.equal(typeof r.url, 'string');
        assert.ok(r.url.toLowerCase().includes('.pdf'));
    }
});

test('integration: searchImages returns shaped results', async (t) => {
    if (!RUN) {
        t.skip('Set RUN_NETWORK_TESTS=1 to run network search integration tests');
        return;
    }

    const results = await searchImages('nebula space', 2);
    assert.ok(Array.isArray(results));
    for (const r of results) {
        assert.equal(typeof r.url, 'string');
    }
});
