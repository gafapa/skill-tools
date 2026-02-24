import fs from 'fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLikelyHeading(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 80) return false;
    if (/^[\-\•\*\d\[\(]/.test(trimmed)) return false;
    if (trimmed.endsWith('.') || trimmed.endsWith(',') || trimmed.endsWith(':')) return false;
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 2 && /[A-Z]/.test(trimmed)) return true;
    const words = trimmed.split(/\s+/);
    const capitalised = words.filter(w => /^[A-ZÁÉÍÓÚ]/.test(w)).length;
    if (capitalised >= words.length * 0.6 && words.length <= 8) return true;
    return false;
}

function normaliseBullet(line) {
    return line.replace(/^[\s]*[•▶►→–▸◆◇]\s+/, '- ');
}

function joinBrokenUrls(text) {
    return text
        .replace(/(https?:\/\/[^\s\n]+)-\n([a-z0-9\-\.\/?%=&_#]+)/g, '$1$2')
        .replace(/(https?:\/\/[^\s\n]+)\n([a-z0-9\-\.\/?%=&_#]+)/g, '$1$2');
}

function assignHeadingLevel(line, isFirst) {
    return isFirst ? `# ${line}` : `## ${line}`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Converts a PDF file to structured Markdown using `unpdf` (Mozilla PDF.js).
 *
 * Improvements over pdf-parse:
 * - Updated Mozilla PDF.js engine (the same as Firefox)
 * - Page-by-page text extraction with smart merge
 * - Detection of headings, bullets, paragraphs, and broken URLs
 * - Removal of repeated headers/footers
 * - Optional support for YAML frontmatter with metadata
 *
 * @param {string} pdfPath - Path to the PDF.
 * @param {Object} [options]
 * @param {boolean} [options.detectHeadings=true]   - Automatically detect headings.
 * @param {boolean} [options.joinParagraphs=true]   - Join broken lines of the same paragraph.
 * @param {boolean} [options.normaliseBullets=true] - Normalize bullets to markdown `-`.
 * @param {boolean} [options.fixBrokenUrls=true]    - Repair URLs cut between lines.
 * @param {boolean} [options.includeMetadata=false] - Add YAML frontmatter at the beginning.
 * @returns {Promise<string|null>}
 */
export async function convertPdfToMarkdown(pdfPath, options = {}) {
    const {
        detectHeadings = true,
        joinParagraphs = true,
        normaliseBullets = true,
        fixBrokenUrls = true,
        includeMetadata = false,
    } = options;

    try {
        const dataBuffer = await fs.readFile(pdfPath);

        // 1. Load the PDF with Mozilla PDF.js via unpdf
        // Extract page by page and join them manually to preserve structure
        const pdf = await getDocumentProxy(new Uint8Array(dataBuffer));
        const { totalPages, text: pages } = await extractText(pdf, { mergePages: false });

        // Join pages with a double newline to preserve paragraph structure
        let text = pages.join('\n\n');

        // 2. Normalize line breaks
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 3. Remove headers/footers repeated across multiple pages
        {
            const lines = text.split('\n');
            const freq = {};
            for (const l of lines) {
                const k = l.trim();
                if (k) freq[k] = (freq[k] || 0) + 1;
            }
            const threshold = Math.max(3, Math.floor(totalPages / 2));
            text = lines.filter(l => (freq[l.trim()] || 0) < threshold).join('\n');
        }

        // 4. Repair URLs cut by line breaks
        if (fixBrokenUrls) {
            text = joinBrokenUrls(text);
        }

        // 5. Normalize typographic bullets → markdown
        if (normaliseBullets) {
            text = text.split('\n').map(normaliseBullet).join('\n');
        }

        // 6. Reconstruct broken paragraphs
        if (joinParagraphs) {
            // Hyphenated words split across lines: "pa-\nlabra" → "palabra"
            text = text.replace(/(\w)-\n(\w)/g, '$1$2');
            // Line that doesn't end a sentence + following line starting with lowercase
            text = text.replace(/([^\.\!\?\:\n])\n([a-záéíóúa-z0-9])/g, '$1 $2');
        }

        // 7. Compress excessive line breaks
        text = text.replace(/\n{3,}/g, '\n\n');

        // 8. Detect and mark headings
        if (detectHeadings) {
            let firstFound = false;
            text = text.split('\n').map(line => {
                const trimmed = line.trim();
                if (isLikelyHeading(trimmed)) {
                    const h = assignHeadingLevel(trimmed, !firstFound);
                    firstFound = true;
                    return h;
                }
                return line;
            }).join('\n');
        }

        // 9. Final trim of whitespace per line and multiple spaces
        text = text.split('\n').map(l => l.trimEnd()).join('\n');
        text = text.replace(/ {2,}/g, ' ').trim();

        // 10. Optional YAML frontmatter with doc metadata
        if (includeMetadata) {
            const info = await pdf.getMetadata().catch(() => ({}));
            const meta = info?.info || {};
            const frontmatter = [
                '---',
                `title: "${meta.Title || ''}"`,
                `author: "${meta.Author || ''}"`,
                `pages: ${totalPages}`,
                `created: "${meta.CreationDate || ''}"`,
                '---',
                '',
            ].join('\n');
            text = frontmatter + text;
        }

        console.log(`[PDF→MD] ✓ Converted (${totalPages} page/s): ${pdfPath}`);
        return text;

    } catch (error) {
        console.error(`[PDF→MD Error] Could not convert ${pdfPath}:`, error.message);
        return null;
    }
}
