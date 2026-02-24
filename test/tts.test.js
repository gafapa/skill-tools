import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSpeech } from '../src/tts.js';

test('generateSpeech returns null for empty text', async () => {
    const result = await generateSpeech('', './out.wav');
    assert.equal(result, null);
});

test('generateSpeech returns null for empty outputPath', async () => {
    const result = await generateSpeech('hello', '');
    assert.equal(result, null);
});

test('generateSpeech returns null for unsupported voice before download', async () => {
    const result = await generateSpeech('hello', './out.wav', { voice: 'Z9' });
    assert.equal(result, null);
});
