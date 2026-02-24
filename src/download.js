import axios from 'axios';
import { createWriteStream } from 'fs';
import { rename, unlink } from 'fs/promises';
import { fileTypeFromFile } from 'file-type';
import path from 'path';

/**
 * Downloads a file via streaming directly to disk to save RAM,
 * validates its real type, and renames it if necessary.
 * @param {string} url - URL del archivo.
 * @param {string} outputDir - Directorio de destino.
 * @param {string} expectedType - 'pdf' o 'image'.
 * @returns {Promise<string|null>} - Ruta del archivo guardado o null si falló.
 */
export async function downloadFile(url, outputDir, expectedType) {
    let tempPath;
    try {
        const response = await axios.get(url, { responseType: 'stream' });

        // Determine initial filename
        let filename = path.basename(new URL(url).pathname);
        if (!filename || filename.length > 100) filename = `downloaded_${Date.now()}`;

        tempPath = path.join(outputDir, `${filename}.tmp`);
        const writer = createWriteStream(tempPath);

        response.data.pipe(writer);

        // Wait for the stream to finish writing to disk
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // Validate type with the file on disk (consumes less memory)
        const typeInfo = await fileTypeFromFile(tempPath);

        let isValid = false;
        if (typeInfo) {
            if (expectedType === 'pdf' && typeInfo.mime === 'application/pdf') isValid = true;
            else if (expectedType === 'image' && typeInfo.mime.startsWith('image/')) isValid = true;
        }

        if (!isValid) {
            console.warn(`Validation failed for ${url} (got ${typeInfo?.mime || 'unknown'}). Expected ${expectedType}.`);
            await unlink(tempPath); // Delete temporary file
            return null;
        }

        // Rename with correct extension if it doesn't match
        const ext = path.extname(filename);
        if (ext.slice(1) !== typeInfo.ext) {
            filename = `${path.basename(filename, ext)}.${typeInfo.ext}`;
        }

        const outputPath = path.join(outputDir, filename);
        await rename(tempPath, outputPath);

        console.log(`Saved: ${outputPath}`);
        return outputPath;

    } catch (error) {
        console.error(`Error downloading ${url}:`, error.message);
        if (tempPath) {
            try { await unlink(tempPath); } catch (e) { /* ignore */ }
        }
        return null;
    }
}
