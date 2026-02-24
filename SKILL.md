---
name: skill-tools
description: >
  Tools for gathering and processing knowledge from the web. Lets agents search for PDFs and images,
  stream-download and validate files, convert PDFs to well-structured Markdown (headings, bullets,
  paragraphs, metadata), and generate speech locally using Supertonic v2 via ONNX Runtime.
  Zero cloud dependencies — everything runs on-device.
---

# skill-tools

A Node.js utility skill that equips AI agents with file-gathering and knowledge-processing capabilities.

## When to Use This Skill

Use this skill when you need to:
- Search the web for PDF documents or images without an API key
- Download files safely (streaming, MIME validation, auto-extension correction)
- Convert a PDF into clean, readable Markdown suitable for LLM consumption
- Generate speech from text entirely offline using the Supertonic v2 ONNX model

## Setup

Install dependencies from the skill directory:

```bash
npm install
```

Import any function in an ESM script:

```javascript
import { searchPDFs, downloadFile, convertPdfToMarkdown, generateSpeech } from './index.js';
```

## Available Tools

### `searchPDFs(query, limit = 10)`

Searches DuckDuckGo for PDF files. Returns `{ title, url }[]`. Includes a 1–3 s random delay to avoid bot blocks.

```javascript
const pdfs = await searchPDFs('machine learning tutorial', 5);
```

### `searchImages(query, limit = 10)`

Searches Google Images via `google-img-scrap`. No API key needed. Returns `{ title, url }[]`.

```javascript
const images = await searchImages('space wallpaper hd', 3);
```

### `downloadFile(url, outputDir, expectedType)`

Stream-downloads a file to disk using minimal memory. Validates the real MIME type with magic-number detection and fixes the extension automatically.

- `expectedType`: `'pdf'` | `'image'`
- Returns the saved file path, or `null` on failure.

```javascript
const path = await downloadFile(pdfs[0].url, './downloads', 'pdf');
```

### `convertPdfToMarkdown(pdfPath, options?)`

Converts a PDF to structured Markdown using Mozilla PDF.js (`unpdf` v1.4.0 — ESM native, zero dependencies).

**Options** (all default `true` except `includeMetadata`):

| Option             | Default | Effect                                                      |
| ------------------ | ------- | ----------------------------------------------------------- |
| `detectHeadings`   | `true`  | Marks titles as `# H1` / `## H2`                            |
| `joinParagraphs`   | `true`  | Joins lines that form the same paragraph                    |
| `normaliseBullets` | `true`  | Converts `•` `▶` `→` to markdown `-`                        |
| `fixBrokenUrls`    | `true`  | Repairs URLs split across lines                             |
| `includeMetadata`  | `false` | Prepends a YAML frontmatter block with title, author, pages |

```javascript
const md = await convertPdfToMarkdown('./report.pdf', { includeMetadata: true });
```

### `generateSpeech(text, outputPath, options?)`

Generates a WAV audio file from text using the **Supertonic v2** ONNX model on-device via `onnxruntime-node`.

> **Requires model:** Download `supertonic.onnx` from [HuggingFace — supertone-inc/supertonic](https://huggingface.co/supertone-inc/supertonic) and place it at `./models/supertonic.onnx`.

| Option  | Default | Effect                                                  |
| ------- | ------- | ------------------------------------------------------- |
| `voice` | `'F1'`  | `F1`–`F5` female · `M1`–`M5` male                       |
| `speed` | `1.0`   | Rate multiplier (`0.8` slow · `1.5` fast)               |
| `steps` | `20`    | Inference steps (fewer = faster, more = better quality) |

```javascript
await generateSpeech('Hello!', './out.wav', { voice: 'M2', speed: 1.2, steps: 30 });
```

## End-to-End Example

```javascript
import { searchPDFs, downloadFile, convertPdfToMarkdown, generateSpeech } from './index.js';
import fs from 'fs/promises';

await fs.mkdir('./downloads', { recursive: true });

// 1. Find a PDF
const [first] = await searchPDFs('javascript guide', 3);

// 2. Download it
const pdfPath = await downloadFile(first.url, './downloads', 'pdf');

// 3. Convert to Markdown
const markdown = await convertPdfToMarkdown(pdfPath, { includeMetadata: true });
await fs.writeFile(pdfPath.replace('.pdf', '.md'), markdown);

// 4. Narrate a summary (requires ONNX model)
await generateSpeech(markdown.slice(0, 400), './summary.wav', { voice: 'F1' });
```

## Notes

- All functions are async and return `null` on recoverable errors.
- TTS requires the Supertonic ONNX model (not bundled — too large for git).
- No API keys are required for search or download.
