import { searchPDFs, searchImages } from './src/search.js';
import { downloadFile } from './src/download.js';
import { generateSpeech } from './src/tts.js';
import { convertPdfToMarkdown } from './src/pdf_converter.js';
import { validateBuffer, fixExtension } from './src/validate.js';

export {
    searchPDFs,
    searchImages,
    downloadFile,
    generateSpeech,
    convertPdfToMarkdown
};

export default {
    searchPDFs,
    searchImages,
    downloadFile,
    generateSpeech,
    convertPdfToMarkdown
};
