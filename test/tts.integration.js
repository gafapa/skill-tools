import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateSpeech } from '../src/tts.js';

const RUN = process.env.RUN_TTS_INTEGRATION === '1';

test('integration: generateSpeech downloads assets and writes wav', { timeout: 15 * 60 * 1000 }, async (t) => {
    if (!RUN) {
        t.skip('Set RUN_TTS_INTEGRATION=1 to run TTS integration test');
        return;
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-tools-tts-'));
    const outPath = path.join(tmpDir, 'tts.wav');

    try {
        const result = await generateSpeech('Hola mundo, prueba de integracion.', outPath, {
            voice: 'F1',
            lang: 'es',
            steps: 1,
            speed: 1.0,
        });

        assert.equal(result, path.resolve(outPath));
        const buffer = await fs.readFile(outPath);
        assert.equal(buffer.toString('utf8', 0, 4), 'RIFF');
        assert.ok(buffer.length > 44);
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
});
