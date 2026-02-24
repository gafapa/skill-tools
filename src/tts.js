import axios from 'axios';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import * as ort from 'onnxruntime-node';

const HF_REPO_BASE = 'https://huggingface.co/Supertone/supertonic/resolve/main';
const DEFAULT_MODEL_ROOT = path.resolve('models', 'supertonic');
const DEFAULT_ONNX_DIR = path.join(DEFAULT_MODEL_ROOT, 'onnx');
const DEFAULT_VOICE_DIR = path.join(DEFAULT_MODEL_ROOT, 'voice_styles');

const VALID_VOICES = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5']);
const AVAILABLE_LANGS = ['en', 'ko', 'es', 'pt', 'fr'];

const ONNX_ASSETS = [
    { rel: 'onnx/duration_predictor.onnx', minBytes: 10_000 },
    { rel: 'onnx/text_encoder.onnx', minBytes: 10_000 },
    { rel: 'onnx/vector_estimator.onnx', minBytes: 1_000_000 },
    { rel: 'onnx/vocoder.onnx', minBytes: 1_000_000 },
    { rel: 'onnx/tts.json', minBytes: 1_000, json: true },
    { rel: 'onnx/unicode_indexer.json', minBytes: 1_000, json: true },
];

const ttsInstanceCache = new Map();
const ensureDirLocks = new Map();

function log(...args) {
    console.log('[TTS]', ...args);
}

function warn(...args) {
    console.warn('[TTS]', ...args);
}

async function withLock(key, fn) {
    const prev = ensureDirLocks.get(key) || Promise.resolve();
    let release;
    const next = new Promise((resolve) => { release = resolve; });
    const chain = prev.then(() => next);
    ensureDirLocks.set(key, chain);
    try {
        await prev;
        return await fn();
    } finally {
        release();
        if (ensureDirLocks.get(key) === chain) {
            ensureDirLocks.delete(key);
        }
    }
}

async function fileExistsAndLooksValid(filePath, minBytes = 1) {
    try {
        const st = await fsp.stat(filePath);
        return st.isFile() && st.size >= minBytes;
    } catch {
        return false;
    }
}

async function validateJsonFile(filePath) {
    const raw = await fsp.readFile(filePath, 'utf8');
    JSON.parse(raw);
}

async function downloadToFile(url, targetPath, minBytes = 1) {
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });
    const tmpPath = `${targetPath}.part`;

    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: 120000,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        });

        const totalLength = Number(response.headers['content-length'] || 0);
        let downloaded = 0;
        let lastPct = -1;
        const writer = fs.createWriteStream(tmpPath);

        response.data.on('data', (chunk) => {
            downloaded += chunk.length;
            if (!totalLength) return;
            const pct = Math.floor((downloaded / totalLength) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
                process.stdout.write(`\r[TTS] Download ${path.basename(targetPath)} ${pct}%`);
                lastPct = pct;
            }
        });

        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            response.data.on('error', reject);
        });

        if (totalLength) {
            process.stdout.write('\n');
        }

        const st = await fsp.stat(tmpPath);
        if (st.size < minBytes) {
            throw new Error(`downloaded file too small (${st.size} bytes)`);
        }

        await fsp.rename(tmpPath, targetPath);
    } catch (error) {
        try { await fsp.unlink(tmpPath); } catch { /* ignore */ }
        throw error;
    }
}

async function ensureAsset(baseDir, asset) {
    const targetPath = path.join(baseDir, asset.rel.replace(/\//g, path.sep));
    const ok = await fileExistsAndLooksValid(targetPath, asset.minBytes);
    if (ok) {
        if (asset.json) {
            try {
                await validateJsonFile(targetPath);
                return targetPath;
            } catch {
                warn(`Invalid JSON cache detected, re-downloading: ${path.basename(targetPath)}`);
            }
        } else {
            return targetPath;
        }
    }

    const url = `${HF_REPO_BASE}/${asset.rel}?download=true`;
    log(`Downloading ${asset.rel}...`);
    await downloadToFile(url, targetPath, asset.minBytes);
    if (asset.json) {
        await validateJsonFile(targetPath);
    }
    return targetPath;
}

async function ensureOnnxAssets(modelRoot = DEFAULT_MODEL_ROOT) {
    return withLock(`onnx:${modelRoot}`, async () => {
        for (const asset of ONNX_ASSETS) {
            await ensureAsset(modelRoot, asset);
        }
        return path.join(modelRoot, 'onnx');
    });
}

function resolveVoiceSpec(voice, modelRoot = DEFAULT_MODEL_ROOT) {
    if (typeof voice !== 'string' || !voice.trim()) {
        throw new Error('voice must be a non-empty string');
    }
    const trimmed = voice.trim();

    if (trimmed.endsWith('.json') || trimmed.includes('/') || trimmed.includes('\\')) {
        return { voiceId: path.basename(trimmed, '.json'), voicePath: path.resolve(trimmed), remoteRel: null };
    }

    const id = trimmed.toUpperCase();
    if (!VALID_VOICES.has(id)) {
        throw new Error(`Unsupported voice "${voice}". Use one of: ${Array.from(VALID_VOICES).join(', ')}`);
    }
    return {
        voiceId: id,
        voicePath: path.join(modelRoot, 'voice_styles', `${id}.json`),
        remoteRel: `voice_styles/${id}.json`,
    };
}

async function ensureVoiceStyle(voiceSpec) {
    if (!voiceSpec.remoteRel) {
        const ok = await fileExistsAndLooksValid(voiceSpec.voicePath, 100);
        if (!ok) {
            throw new Error(`Voice style file not found: ${voiceSpec.voicePath}`);
        }
        await validateJsonFile(voiceSpec.voicePath);
        return voiceSpec.voicePath;
    }

    return withLock(`voice:${voiceSpec.voiceId}:${path.dirname(path.dirname(voiceSpec.voicePath))}`, async () => {
        const ok = await fileExistsAndLooksValid(voiceSpec.voicePath, 100);
        if (!ok) {
            log(`Downloading voice style ${voiceSpec.voiceId}...`);
            const url = `${HF_REPO_BASE}/${voiceSpec.remoteRel}?download=true`;
            await downloadToFile(url, voiceSpec.voicePath, 100);
        }
        await validateJsonFile(voiceSpec.voicePath);
        return voiceSpec.voicePath;
    });
}

async function ensureSupertonicAssets({ voice, modelRoot = DEFAULT_MODEL_ROOT }) {
    const onnxDir = await ensureOnnxAssets(modelRoot);
    const voiceSpec = resolveVoiceSpec(voice, modelRoot);
    const voicePath = await ensureVoiceStyle(voiceSpec);
    return { onnxDir, voicePath, voiceId: voiceSpec.voiceId };
}

class UnicodeProcessor {
    constructor(unicodeIndexerJsonPath) {
        this.indexer = JSON.parse(fs.readFileSync(unicodeIndexerJsonPath, 'utf8'));
    }

    _preprocessText(text, lang) {
        text = text.normalize('NFKD');

        const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
        text = text.replace(emojiPattern, '');

        const replacements = {
            '\u2013': '-',
            '\u2011': '-',
            '\u2014': '-',
            '_': ' ',
            '\u201C': '"',
            '\u201D': '"',
            '\u2018': "'",
            '\u2019': "'",
            '\u00B4': "'",
            '`': "'",
            '[': ' ',
            ']': ' ',
            '|': ' ',
            '/': ' ',
            '#': ' ',
            '\u2192': ' ',
            '\u2190': ' ',
        };
        for (const [k, v] of Object.entries(replacements)) {
            text = text.replaceAll(k, v);
        }

        text = text.replace(/[\u2665\u2606\u2661\u00A9\\]/g, '');

        const exprReplacements = {
            '@': ' at ',
            'e.g.,': 'for example, ',
            'i.e.,': 'that is, ',
        };
        for (const [k, v] of Object.entries(exprReplacements)) {
            text = text.replaceAll(k, v);
        }

        text = text.replace(/ ,/g, ',');
        text = text.replace(/ \./g, '.');
        text = text.replace(/ !/g, '!');
        text = text.replace(/ \?/g, '?');
        text = text.replace(/ ;/g, ';');
        text = text.replace(/ :/g, ':');
        text = text.replace(/ '/g, "'");

        while (text.includes('""')) text = text.replace('""', '"');
        while (text.includes("''")) text = text.replace("''", "'");
        while (text.includes('``')) text = text.replace('``', '`');

        text = text.replace(/\s+/g, ' ').trim();
        if (!text) {
            throw new Error('Text is empty after preprocessing');
        }

        if (!/[.!?;:,'")\]}\u2026]$/u.test(text)) {
            text += '.';
        }

        if (!AVAILABLE_LANGS.includes(lang)) {
            throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(', ')}`);
        }

        return `<${lang}>${text}</${lang}>`;
    }

    _textToUnicodeValues(text) {
        return Array.from(text).map((char) => char.charCodeAt(0));
    }

    call(textList, langList) {
        const processedTexts = textList.map((t, i) => this._preprocessText(t, langList[i]));
        const lengths = processedTexts.map((t) => t.length);
        const maxLen = Math.max(...lengths);

        const textIds = [];
        for (let i = 0; i < processedTexts.length; i++) {
            const row = new Array(maxLen).fill(0);
            const unicodeVals = this._textToUnicodeValues(processedTexts[i]);
            for (let j = 0; j < unicodeVals.length; j++) {
                const idx = this.indexer[unicodeVals[j]];
                row[j] = idx >= 0 ? idx : 0;
            }
            textIds.push(row);
        }

        const textMask = lengthToMask(lengths);
        return { textIds, textMask };
    }
}

class Style {
    constructor(styleTtlOnnx, styleDpOnnx) {
        this.ttl = styleTtlOnnx;
        this.dp = styleDpOnnx;
    }
}

class TextToSpeech {
    constructor(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt) {
        this.cfgs = cfgs;
        this.textProcessor = textProcessor;
        this.dpOrt = dpOrt;
        this.textEncOrt = textEncOrt;
        this.vectorEstOrt = vectorEstOrt;
        this.vocoderOrt = vocoderOrt;
        this.sampleRate = cfgs.ae.sample_rate;
        this.baseChunkSize = cfgs.ae.base_chunk_size;
        this.chunkCompressFactor = cfgs.ttl.chunk_compress_factor;
        this.ldim = cfgs.ttl.latent_dim;
    }

    sampleNoisyLatent(duration) {
        const wavLenMax = Math.max(...duration) * this.sampleRate;
        const wavLengths = duration.map((d) => Math.floor(d * this.sampleRate));
        const chunkSize = this.baseChunkSize * this.chunkCompressFactor;
        const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
        const latentDim = this.ldim * this.chunkCompressFactor;

        const noisyLatent = [];
        for (let b = 0; b < duration.length; b++) {
            const batch = [];
            for (let d = 0; d < latentDim; d++) {
                const row = [];
                for (let t = 0; t < latentLen; t++) {
                    const eps = 1e-10;
                    const u1 = Math.max(eps, Math.random());
                    const u2 = Math.random();
                    const randNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
                    row.push(randNormal);
                }
                batch.push(row);
            }
            noisyLatent.push(batch);
        }

        const latentMask = getLatentMask(wavLengths, this.baseChunkSize, this.chunkCompressFactor);
        for (let b = 0; b < noisyLatent.length; b++) {
            for (let d = 0; d < noisyLatent[b].length; d++) {
                for (let t = 0; t < noisyLatent[b][d].length; t++) {
                    noisyLatent[b][d][t] *= latentMask[b][0][t];
                }
            }
        }

        return { noisyLatent, latentMask };
    }

    async _infer(textList, langList, style, totalStep, speed = 1.05) {
        if (textList.length !== style.ttl.dims[0]) {
            throw new Error('Number of texts must match number of style vectors');
        }
        const bsz = textList.length;
        const { textIds, textMask } = this.textProcessor.call(textList, langList);
        const textIdsShape = [bsz, textIds[0].length];
        const textMaskShape = [bsz, 1, textMask[0][0].length];

        const textMaskTensor = arrayToTensor(textMask, textMaskShape);

        const dpResult = await this.dpOrt.run({
            text_ids: intArrayToTensor(textIds, textIdsShape),
            style_dp: style.dp,
            text_mask: textMaskTensor
        });

        const durOnnx = Array.from(dpResult.duration.data);
        for (let i = 0; i < durOnnx.length; i++) durOnnx[i] /= speed;

        const textEncResult = await this.textEncOrt.run({
            text_ids: intArrayToTensor(textIds, textIdsShape),
            style_ttl: style.ttl,
            text_mask: textMaskTensor
        });

        const textEmbTensor = textEncResult.text_emb;
        let { noisyLatent, latentMask } = this.sampleNoisyLatent(durOnnx);

        const latentShape = [bsz, noisyLatent[0].length, noisyLatent[0][0].length];
        const latentMaskShape = [bsz, 1, latentMask[0][0].length];
        const latentMaskTensor = arrayToTensor(latentMask, latentMaskShape);

        const scalarShape = [bsz];
        const totalStepTensor = arrayToTensor(new Array(bsz).fill(totalStep), scalarShape);

        for (let step = 0; step < totalStep; step++) {
            const vectorEstResult = await this.vectorEstOrt.run({
                noisy_latent: arrayToTensor(noisyLatent, latentShape),
                text_emb: textEmbTensor,
                style_ttl: style.ttl,
                text_mask: textMaskTensor,
                latent_mask: latentMaskTensor,
                total_step: totalStepTensor,
                current_step: arrayToTensor(new Array(bsz).fill(step), scalarShape)
            });

            const denoisedLatent = Array.from(vectorEstResult.denoised_latent.data);
            let idx = 0;
            for (let b = 0; b < noisyLatent.length; b++) {
                for (let d = 0; d < noisyLatent[b].length; d++) {
                    for (let t = 0; t < noisyLatent[b][d].length; t++) {
                        noisyLatent[b][d][t] = denoisedLatent[idx++];
                    }
                }
            }
        }

        const vocoderResult = await this.vocoderOrt.run({
            latent: arrayToTensor(noisyLatent, latentShape)
        });

        return {
            wav: Array.from(vocoderResult.wav_tts.data),
            duration: durOnnx
        };
    }

    async call(text, lang, style, totalStep, speed = 1.05, silenceDuration = 0.3) {
        if (style.ttl.dims[0] !== 1) {
            throw new Error('Single-speaker synthesis requires one voice style');
        }

        const maxLen = lang === 'ko' ? 120 : 300;
        const textList = chunkText(text, maxLen);
        let wavCat = null;
        let durCat = 0;

        for (const chunk of textList) {
            const { wav, duration } = await this._infer([chunk], [lang], style, totalStep, speed);
            if (wavCat === null) {
                wavCat = wav;
                durCat = duration[0];
                continue;
            }

            const silenceLen = Math.floor(silenceDuration * this.sampleRate);
            wavCat = [...wavCat, ...new Array(silenceLen).fill(0), ...wav];
            durCat += duration[0] + silenceDuration;
        }

        return { wav: wavCat || [], duration: [durCat] };
    }
}

function lengthToMask(lengths, maxLen = null) {
    const m = maxLen || Math.max(...lengths);
    return lengths.map((len) => [[...Array(m)].map((_, j) => (j < len ? 1.0 : 0.0))]);
}

function getLatentMask(wavLengths, baseChunkSize, chunkCompressFactor) {
    const latentSize = baseChunkSize * chunkCompressFactor;
    const latentLengths = wavLengths.map((len) => Math.floor((len + latentSize - 1) / latentSize));
    return lengthToMask(latentLengths);
}

function arrayToTensor(array, dims) {
    return new ort.Tensor('float32', Float32Array.from(array.flat(Infinity)), dims);
}

function intArrayToTensor(array, dims) {
    const flat = array.flat(Infinity);
    return new ort.Tensor('int64', BigInt64Array.from(flat.map((x) => BigInt(x))), dims);
}

async function loadOnnx(onnxPath, opts) {
    return ort.InferenceSession.create(onnxPath, opts);
}

async function loadOnnxAll(onnxDir, opts) {
    const [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt] = await Promise.all([
        loadOnnx(path.join(onnxDir, 'duration_predictor.onnx'), opts),
        loadOnnx(path.join(onnxDir, 'text_encoder.onnx'), opts),
        loadOnnx(path.join(onnxDir, 'vector_estimator.onnx'), opts),
        loadOnnx(path.join(onnxDir, 'vocoder.onnx'), opts),
    ]);
    return { dpOrt, textEncOrt, vectorEstOrt, vocoderOrt };
}

function loadCfgs(onnxDir) {
    return JSON.parse(fs.readFileSync(path.join(onnxDir, 'tts.json'), 'utf8'));
}

function loadTextProcessor(onnxDir) {
    return new UnicodeProcessor(path.join(onnxDir, 'unicode_indexer.json'));
}

export function loadVoiceStyle(voiceStylePaths, verbose = false) {
    const bsz = voiceStylePaths.length;
    const firstStyle = JSON.parse(fs.readFileSync(voiceStylePaths[0], 'utf8'));
    const ttlDims = firstStyle.style_ttl.dims;
    const dpDims = firstStyle.style_dp.dims;

    const ttlDim1 = ttlDims[1];
    const ttlDim2 = ttlDims[2];
    const dpDim1 = dpDims[1];
    const dpDim2 = dpDims[2];

    const ttlFlat = new Float32Array(bsz * ttlDim1 * ttlDim2);
    const dpFlat = new Float32Array(bsz * dpDim1 * dpDim2);

    for (let i = 0; i < bsz; i++) {
        const voiceStyle = JSON.parse(fs.readFileSync(voiceStylePaths[i], 'utf8'));
        ttlFlat.set(voiceStyle.style_ttl.data.flat(Infinity), i * ttlDim1 * ttlDim2);
        dpFlat.set(voiceStyle.style_dp.data.flat(Infinity), i * dpDim1 * dpDim2);
    }

    const ttlStyle = new ort.Tensor('float32', ttlFlat, [bsz, ttlDim1, ttlDim2]);
    const dpStyle = new ort.Tensor('float32', dpFlat, [bsz, dpDim1, dpDim2]);
    if (verbose) log(`Loaded ${bsz} voice style(s)`);
    return new Style(ttlStyle, dpStyle);
}

export async function loadTextToSpeech(onnxDir, useGpu = false) {
    const cacheKey = `${onnxDir}|gpu=${useGpu}`;
    if (ttsInstanceCache.has(cacheKey)) {
        return ttsInstanceCache.get(cacheKey);
    }

    const promise = (async () => {
        const opts = {};
        if (useGpu) {
            throw new Error('GPU mode is not supported yet');
        }
        const cfgs = loadCfgs(onnxDir);
        const { dpOrt, textEncOrt, vectorEstOrt, vocoderOrt } = await loadOnnxAll(onnxDir, opts);
        const textProcessor = loadTextProcessor(onnxDir);
        return new TextToSpeech(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt);
    })();

    ttsInstanceCache.set(cacheKey, promise);
    try {
        return await promise;
    } catch (error) {
        ttsInstanceCache.delete(cacheKey);
        throw error;
    }
}

function writeWavFile(filename, audioData, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = audioData.length * bitsPerSample / 8;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < audioData.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioData[i]));
        const intSample = Math.floor(sample * 32767);
        buffer.writeInt16LE(intSample, 44 + i * 2);
    }

    fs.writeFileSync(filename, buffer);
}

function chunkText(text, maxLen = 300) {
    if (typeof text !== 'string') {
        throw new Error(`chunkText expects a string, got ${typeof text}`);
    }

    const paragraphs = text.trim().split(/\n\s*\n+/).filter((p) => p.trim());
    const chunks = [];

    for (let paragraph of paragraphs) {
        paragraph = paragraph.trim();
        if (!paragraph) continue;

        const sentences = paragraph.split(/(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/);
        let current = '';

        for (const sentence of sentences) {
            if (current.length + sentence.length + 1 <= maxLen) {
                current += (current ? ' ' : '') + sentence;
            } else {
                if (current) chunks.push(current.trim());
                current = sentence;
            }
        }

        if (current) chunks.push(current.trim());
    }

    return chunks.length ? chunks : [text.trim()];
}

/**
 * Generates speech from text using Supertonic ONNX models.
 * Automatically downloads the required ONNX assets and the selected voice style on first run.
 */
export async function generateSpeech(text, outputPath, options = {}) {
    const {
        voice = 'F1',
        speed = 1.0,
        steps = 20,
        lang = 'en',
        useGpu = false,
        modelRoot = DEFAULT_MODEL_ROOT,
    } = options;

    if (typeof text !== 'string' || !text.trim()) {
        console.error('[TTS Error] Text must be a non-empty string.');
        return null;
    }

    if (typeof outputPath !== 'string' || !outputPath.trim()) {
        console.error('[TTS Error] outputPath must be a non-empty string.');
        return null;
    }

    try {
        const resolvedOutputPath = path.resolve(outputPath);
        await fsp.mkdir(path.dirname(resolvedOutputPath), { recursive: true });

        const { onnxDir, voicePath, voiceId } = await ensureSupertonicAssets({ voice, modelRoot: path.resolve(modelRoot) });
        log(`Initializing Supertonic (voice=${voiceId || voice}, lang=${lang}, speed=${speed}, steps=${steps})`);

        const textToSpeech = await loadTextToSpeech(onnxDir, useGpu);
        const style = loadVoiceStyle([voicePath]);
        const { wav, duration } = await textToSpeech.call(text, lang, style, steps, speed);

        const expectedLen = Math.max(0, Math.floor(textToSpeech.sampleRate * (duration[0] || 0)));
        const wavOut = expectedLen > 0 ? wav.slice(0, Math.min(expectedLen, wav.length)) : wav;
        writeWavFile(resolvedOutputPath, wavOut, textToSpeech.sampleRate);

        log(`Audio saved: ${resolvedOutputPath}`);
        return resolvedOutputPath;
    } catch (error) {
        console.error('[TTS Error] Failed to generate speech locally.');
        console.error('Detail:', error.message);
        return null;
    }
}
