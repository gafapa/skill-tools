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
    test(`index.js exports ${name}`, () => {
        assert.ok(name in api);
        assert.equal(typeof api[name], 'function');
        assert.equal(api[name].constructor.name, 'AsyncFunction');
    });
}

test('index.js default export contains public API', async () => {
    const mod = await import('../index.js');
    for (const name of EXPECTED_EXPORTS) {
        assert.ok(name in mod.default);
    }
});
