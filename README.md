# skill-tools

A Node.js skill/library for AI agents to search PDFs/images, download and validate files, convert PDFs to Markdown, and generate speech locally with Supertone Supertonic ONNX models.

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

- `searchPDFs(query, limit)`: PDF search via Bing HTML scraping (no API key)
- `searchImages(query, limit)`: Google Images via `google-img-scrap` (no API key)
- `downloadFile(url, outputDir, expectedType)`: streaming download + MIME validation + extension fix
- `convertPdfToMarkdown(pdfPath, options)`: PDF to structured Markdown (`unpdf` / PDF.js)
- `generateSpeech(text, outputPath, options)`: local TTS with ONNX Runtime + automatic model download

## Usage

```js
import {
  searchPDFs,
  searchImages,
  downloadFile,
  convertPdfToMarkdown,
  generateSpeech,
} from './index.js';
import fs from 'node:fs/promises';
```

### Search

```js
const pdfs = await searchPDFs('machine learning tutorial', 5);
const images = await searchImages('space wallpaper', 3);
```

### Download

`downloadFile()` expects the destination directory to exist:

```js
await fs.mkdir('./downloads', { recursive: true });
const savedPath = await downloadFile(pdfs[0].url, './downloads', 'pdf');
```

### PDF to Markdown

```js
const markdown = await convertPdfToMarkdown(savedPath, {
  detectHeadings: true,
  joinParagraphs: true,
  normaliseBullets: true,
  fixBrokenUrls: true,
  includeMetadata: false,
});
```

### Text to Speech (automatic asset download)

On first run, the library downloads the required Supertonic 2 assets from Hugging Face into:

- `./models/supertonic-2/onnx/` (multiple ONNX files + JSON metadata)
- `./models/supertonic-2/voice_styles/` (selected voice style JSON)

```js
await generateSpeech('Hello world!', './audio.wav', {
  voice: 'F1',   // F1-F5 or M1-M5, or a local .json voice-style path
  lang: 'en',    // en | ko | es | pt | fr
  speed: 1.0,
  steps: 20,
});
```

### Full pipeline example

```js
await fs.mkdir('./downloads', { recursive: true });

const [first] = await searchPDFs('javascript guide', 3);
const pdfPath = await downloadFile(first.url, './downloads', 'pdf');
const markdown = await convertPdfToMarkdown(pdfPath, { includeMetadata: true });

await fs.writeFile(pdfPath.replace('.pdf', '.md'), markdown);
await generateSpeech(markdown.slice(0, 400), './summary.wav', {
  voice: 'F1',
  lang: 'en',
  steps: 5,
});
```

## Testing

Fast unit tests (default):

```bash
npm test
```

Integration tests are separated:

```bash
npm run test:integration:search   # set RUN_NETWORK_TESTS=1 to actually run
npm run test:integration:tts      # set RUN_TTS_INTEGRATION=1 to actually run
```

PowerShell examples:

```powershell
$env:RUN_NETWORK_TESTS='1'; npm run test:integration:search
$env:RUN_TTS_INTEGRATION='1'; npm run test:integration:tts
```

## Notes

- Search functions return `[]` on recoverable failures.
- Download / PDF conversion / TTS return `null` on recoverable failures.
- TTS inference runs locally after the one-time Supertonic 2 asset download.

## License

MIT
