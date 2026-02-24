import { fileTypeFromBuffer } from 'file-type';
import path from 'path';

/**
 * Validates if the buffer corresponds to the expected type.
 * @param {Buffer} buffer - The file content.
 * @param {string} expectedMime - The expected MIME type (e.g. 'application/pdf', 'image/jpeg').
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
 * Fixes the file extension based on its real content.
 * @param {string} filename - Original filename.
 * @param {Buffer} buffer - Content.
 * @returns {Promise<string>} - Filename with the fixed extension.
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
