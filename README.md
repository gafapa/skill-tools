# skill-tools

> A Node.js skill for AI agents — search the web for PDFs and images, download and validate files, convert PDFs to Markdown, and generate speech locally with Supertonic v2.

[![npm skills](https://img.shields.io/badge/install-npx%20skills%20add%20gafapa%2Fskill--tools-blue)](https://skills.sh/gafapa/skill-tools)

## Install

```bash
npx skills add gafapa/skill-tools
```

Or clone manually:

```bash
git clone https://github.com/gafapa/skill-tools.git
cd skill-tools
npm install
```

## Features

| Capability           | Details                                                              |
| -------------------- | -------------------------------------------------------------------- |
| 🔍 **PDF Search**     | DuckDuckGo HTML scraping — no API key                                |
| 🖼️ **Image Search**   | Google Images via `google-img-scrap` — no API key                    |
| ⬇️ **Safe Download**  | Streaming (RAM-efficient), MIME validation, auto-fix extension       |
| 📄 **PDF → Markdown** | Mozilla PDF.js via `unpdf` — headings, bullets, URL repair, metadata |
| 🔊 **Text to Speech** | Supertonic v2 ONNX — fully offline, configurable voice/speed/steps   |

## Usage

```javascript
import {
  searchPDFs,
  searchImages,
  downloadFile,
  convertPdfToMarkdown,
  generateSpeech,
} from './index.js';
```

### Search

```javascript
const pdfs   = await searchPDFs('machine learning tutorial', 5);
const images = await searchImages('space wallpaper', 3);
```

### Download

```javascript
// expectedType: 'pdf' | 'image'
const savedPath = await downloadFile(pdfs[0].url, './downloads', 'pdf');
```

### PDF → Markdown

```javascript
const markdown = await convertPdfToMarkdown(savedPath, {
  detectHeadings:   true,   // auto-detect h1/h2
  joinParagraphs:   true,   // join broken lines
  normaliseBullets: true,   // • ▶ → to -
  fixBrokenUrls:    true,   // repair split URLs
  includeMetadata:  false,  // prepend YAML frontmatter
});
```

### Text to Speech

> Requires the Supertonic v2 ONNX model in `./models/supertonic.onnx`.  
> Download from [HuggingFace — supertone-inc/supertonic](https://huggingface.co/supertone-inc/supertonic).

```javascript
await generateSpeech('Hello world!', './audio.wav', {
  voice: 'F1',   // F1–F5 (female) · M1–M5 (male)
  speed: 1.0,    // 0.8 = slower · 1.5 = faster
  steps: 20,     // fewer = faster · more = higher quality
});
```

### Full Pipeline

```javascript
import { searchPDFs, downloadFile, convertPdfToMarkdown, generateSpeech } from './index.js';
import fs from 'fs/promises';

await fs.mkdir('./downloads', { recursive: true });

const [first] = await searchPDFs('javascript guide', 3);
const pdfPath  = await downloadFile(first.url, './downloads', 'pdf');
const markdown = await convertPdfToMarkdown(pdfPath, { includeMetadata: true });

await fs.writeFile(pdfPath.replace('.pdf', '.md'), markdown);
await generateSpeech(markdown.slice(0, 400), './summary.wav', { voice: 'F1' });
```

## Project Structure

```
skill-tools/
├── SKILL.md          ← Skill definition (compatible with skills.sh)
├── index.js          ← Public API
├── package.json
└── src/
    ├── search.js         searchPDFs · searchImages
    ├── download.js       downloadFile
    ├── validate.js       validateBuffer · fixExtension
    ├── pdf_converter.js  convertPdfToMarkdown
    └── tts.js            generateSpeech
```

## Requirements

- Node.js ≥ 18 (ESM)
- For TTS: `supertonic.onnx` model in `./models/` (see above)

## Dependencies

| Package            | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `unpdf`            | PDF text extraction (Mozilla PDF.js, ESM-native) |
| `onnxruntime-node` | ONNX inference for Supertonic v2 TTS             |
| `wavefile`         | Write WAV audio output                           |
| `axios`            | HTTP requests for downloads                      |
| `file-type`        | MIME magic-number validation                     |
| `google-img-scrap` | Google Image search (no key)                     |
| `cheerio`          | HTML parsing for PDF search                      |

## License

MIT
