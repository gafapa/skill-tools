/**
 * Tests for index.js public API exports
 * Smoke tests that verify all expected functions are exported and are async functions.
 *
 * Run: node --test test/exports.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../index.js';

const EXPECTED_EXPORTS = [
    'searchPDFs',
    'searchImages',
    'downloadFile',
    'convertPdfToMarkdown',
    'generateSpeech',
];

for (const name of EXPECTED_EXPORTS) {
    test(`index.js exports '${name}' as an async function`, () => {
        assert.ok(name in api, `'${name}' should be exported from index.js`);
        assert.equal(
            typeof api[name], 'function',
            `'${name}' should be a function`
        );
        // All exported functions should return a Promise (async)
        // We verify by checking constructor name (AsyncFunction)
        assert.equal(
            api[name].constructor.name, 'AsyncFunction',
            `'${name}' should be an async function`
        );
    });
}

test('index.js default export contains all expected functions', async () => {
    const def = (await import('../index.js')).default;
    for (const name of EXPECTED_EXPORTS) {
        assert.ok(name in def, `default export should include '${name}'`);
    }
});
