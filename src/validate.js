import { fileTypeFromBuffer } from 'file-type';
import path from 'path';

/**
 * Valida si el buffer corresponde al tipo esperado.
 * @param {Buffer} buffer - El contenido del archivo.
 * @param {string} expectedMime - El tipo MIME esperado (ej. 'application/pdf', 'image/jpeg').
 * @returns {Promise<boolean>}
 */
export async function validateBuffer(buffer, expectedMime) {
    const type = await fileTypeFromBuffer(buffer);
    if (!type) return false;

    // Simple check: starts with the expected mime type (e.g. 'image/' strictly or leniently)
    // For PDFs: 'application/pdf'
    // For images: 'image/png', 'image/jpeg', etc.

    if (expectedMime === 'application/pdf') {
        return type.mime === 'application/pdf';
    }

    if (expectedMime.startsWith('image/')) {
        return type.mime.startsWith('image/');
    }

    return type.mime === expectedMime;
}

/**
 * Corrige la extensión del archivo basado en su contenido real.
 * @param {string} filename - Nombre original.
 * @param {Buffer} buffer - Contenido.
 * @returns {Promise<string>} - Nombre con extensión corregida.
 */
export async function fixExtension(filename, buffer) {
    const type = await fileTypeFromBuffer(buffer);
    if (!type) return filename;

    const ext = path.extname(filename);
    if (ext.slice(1) !== type.ext) {
        return `${path.basename(filename, ext)}.${type.ext}`;
    }

    return filename;
}
