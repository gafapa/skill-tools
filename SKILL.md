---
name: knowledge-compiler
description: >
  Skill for compiling knowledge from the web. Provides tools to search the web for PDFs and images,
  download and validate them, convert PDFs to structured Markdown, and generate speech from text
  using Supertonic v2 via ONNX Runtime — all running 100% on-device with no cloud dependencies.
---

# Knowledge Compiler Skill

## Overview

This skill exposes a Node.js library (`knowledge_compiler`) located at:
```
c:/Users/pablo/Proyectos IA/nodejs tools/knowledge_compiler/
```

It provides the following capabilities, all importable from `index.js`:

| Function                                    | Description                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `searchPDFs(query, limit)`                  | Search DuckDuckGo for PDF files and return a list of URLs                          |
| `searchImages(query, limit)`                | Search Google Images and return a list of image URLs                               |
| `downloadFile(url, outputDir, type)`        | Stream-download a file to disk, validate its MIME type, and auto-fix its extension |
| `convertPdfToMarkdown(pdfPath, options)`    | Convert a local PDF to clean Markdown using Mozilla PDF.js (via `unpdf`)           |
| `generateSpeech(text, outputPath, options)` | Generate speech from text using Supertonic v2 ONNX model locally                   |

---

## How to Use This Skill

### 1. Setup

Make sure dependencies are installed:
```bash
cd "c:/Users/pablo/Proyectos IA/nodejs tools/knowledge_compiler"
npm install
```

### 2. Importing Functions

All functions are exported from `index.js` and can be imported in any ESM script:

```javascript
import {
  searchPDFs,
  searchImages,
  downloadFile,
  convertPdfToMarkdown,
  generateSpeech
} from 'c:/Users/pablo/Proyectos IA/nodejs tools/knowledge_compiler/index.js';
```

---

## Function Reference

### `searchPDFs(query, limit = 10)`
Searches DuckDuckGo HTML for PDF files matching the query.  
Returns an array of `{ title, url }` objects.

**Important:** Includes a random 1–3 second delay between requests to avoid bot-detection blocks.

```javascript
const results = await searchPDFs('javascript tutorial', 5);
// [{ title: 'JS Guide', url: 'https://example.com/guide.pdf' }, ...]
```

---

### `searchImages(query, limit = 10)`
Uses `google-img-scrap` to search Google Images.  
Returns an array of `{ title, url }` objects.

```javascript
const images = await searchImages('nebula wallpaper hd', 3);
```

---

### `downloadFile(url, outputDir, expectedType)`
Downloads a file via streaming (memory-efficient), validates its real MIME type using magic-number detection, and saves it to disk with the correct extension.

- `expectedType`: `'pdf'` or `'image'`
- Returns the saved file path, or `null` if validation fails.

```javascript
const savedPath = await downloadFile(result.url, './downloads', 'pdf');
```

---

### `convertPdfToMarkdown(pdfPath, options = {})`
Converts a local PDF to structured Markdown using Mozilla PDF.js (via `unpdf` v1.4.0).

**Options:**

| Option             | Default | Description                                         |
| ------------------ | ------- | --------------------------------------------------- |
| `detectHeadings`   | `true`  | Auto-detect and format headings as `# H1`, `## H2`  |
| `joinParagraphs`   | `true`  | Join broken lines that belong to the same paragraph |
| `normaliseBullets` | `true`  | Convert `•`, `▶`, `→` etc. to markdown `-`          |
| `fixBrokenUrls`    | `true`  | Repair URLs that were split across lines            |
| `includeMetadata`  | `false` | Prepend a YAML frontmatter block with PDF metadata  |

```javascript
const markdown = await convertPdfToMarkdown('./doc.pdf', {
  detectHeadings: true,
  includeMetadata: true,
});
```

---

### `generateSpeech(text, outputPath, options = {})`
Generates speech from text using **Supertonic v2** ONNX model running natively via `onnxruntime-node`.  
Output is a `.wav` file.

> **IMPORTANT:** The model must be downloaded separately from [HuggingFace (supertone-inc/supertonic)](https://huggingface.co/supertone-inc/supertonic) and placed at:
> `c:/Users/pablo/Proyectos IA/nodejs tools/knowledge_compiler/models/supertonic.onnx`

**Options:**

| Option  | Default | Description                                                  |
| ------- | ------- | ------------------------------------------------------------ |
| `voice` | `'F1'`  | Voice style: `F1`–`F5` (female), `M1`–`M5` (male)            |
| `speed` | `1.0`   | Speech rate multiplier (e.g. `0.8` = slower, `1.5` = faster) |
| `steps` | `20`    | Inference steps: fewer = faster, more = higher quality       |

```javascript
await generateSpeech('Hello world!', './audio.wav', {
  voice: 'M2',
  speed: 1.2,
  steps: 30,
});
```

---

## End-to-End Pipeline Example

```javascript
import { searchPDFs, downloadFile, convertPdfToMarkdown, generateSpeech } from './index.js';
import fs from 'fs/promises';
import path from 'path';

const outputDir = './downloads';
await fs.mkdir(outputDir, { recursive: true });

// 1. Search
const pdfs = await searchPDFs('machine learning tutorial', 3);

// 2. Download the first result
const pdfPath = await downloadFile(pdfs[0].url, outputDir, 'pdf');

// 3. Convert to Markdown
const markdown = await convertPdfToMarkdown(pdfPath, { includeMetadata: true });

// 4. Save Markdown
const mdPath = pdfPath.replace('.pdf', '.md');
await fs.writeFile(mdPath, markdown);

// 5. Read the title aloud (first 300 chars)
await generateSpeech(markdown.substring(0, 300), './summary.wav', { voice: 'F1' });
```

---

## Notes

- All downloads use streaming to be RAM-efficient even with large PDFs.
- Image search uses Google Images via `google-img-scrap`; no API key required.
- PDF search uses the DuckDuckGo HTML interface; no API key required.
- The Supertonic TTS model runs entirely offline once the ONNX model is present.
- The `unpdf` library is zero-dependency and uses Mozilla PDF.js (the same engine as Firefox).
