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
 * Convierte un archivo PDF a Markdown estructurado utilizando `unpdf` (Mozilla PDF.js).
 *
 * Mejoras respecto a pdf-parse:
 * - Motor Mozilla PDF.js actualizado (el mismo de Firefox)
 * - Extracción de texto por página con merge inteligente
 * - Detección de encabezados, viñetas, párrafos y URLs rotas
 * - Eliminación de cabeceras/pies repetidos
 * - Soporte opcional de frontmatter YAML con metadata
 *
 * @param {string} pdfPath - Ruta al PDF.
 * @param {Object} [options]
 * @param {boolean} [options.detectHeadings=true]   - Detectar encabezados automáticamente.
 * @param {boolean} [options.joinParagraphs=true]   - Unir líneas rotas de un mismo párrafo.
 * @param {boolean} [options.normaliseBullets=true] - Normalizar viñetas a markdown `-`.
 * @param {boolean} [options.fixBrokenUrls=true]    - Reparar URLs cortadas entre líneas.
 * @param {boolean} [options.includeMetadata=false] - Añadir frontmatter YAML al inicio.
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

        // 1. Cargar el PDF con Mozilla PDF.js vía unpdf
        // Extraemos página por página y las unimos manualmente para preservar estructura
        const pdf = await getDocumentProxy(new Uint8Array(dataBuffer));
        const { totalPages, text: pages } = await extractText(pdf, { mergePages: false });

        // Unir páginas con doble salto de línea para preservar la estructura de párrafos
        let text = pages.join('\n\n');

        // 2. Normalizar saltos de línea
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // 3. Eliminar cabeceras/pies de página repetidos en varias páginas
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

        // 4. Reparar URLs cortadas por salto de línea
        if (fixBrokenUrls) {
            text = joinBrokenUrls(text);
        }

        // 5. Normalizar viñetas tipográficas → markdown
        if (normaliseBullets) {
            text = text.split('\n').map(normaliseBullet).join('\n');
        }

        // 6. Reconstruir párrafos rotos
        if (joinParagraphs) {
            // Palabras partidas con guión al final de línea: "pa-\nlabra" → "palabra"
            text = text.replace(/(\w)-\n(\w)/g, '$1$2');
            // Línea que no cierra oración + siguiente que empieza en minúscula
            text = text.replace(/([^\.\!\?\:\n])\n([a-záéíóúa-z0-9])/g, '$1 $2');
        }

        // 7. Comprimir saltos de línea excesivos
        text = text.replace(/\n{3,}/g, '\n\n');

        // 8. Detectar y marcar encabezados
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

        // 9. Trim final de espacios por línea y espacios múltiples
        text = text.split('\n').map(l => l.trimEnd()).join('\n');
        text = text.replace(/ {2,}/g, ' ').trim();

        // 10. Frontmatter YAML opcional con metadata del doc
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

        console.log(`[PDF→MD] ✓ Convertido (${totalPages} página/s): ${pdfPath}`);
        return text;

    } catch (error) {
        console.error(`[PDF→MD Error] No se pudo convertir ${pdfPath}:`, error.message);
        return null;
    }
}
