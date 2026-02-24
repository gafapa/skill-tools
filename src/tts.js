import fs from 'fs/promises';
import path from 'path';
import * as ort from 'onnxruntime-node';
import pkg from 'wavefile';
const { WaveFile } = pkg;

/**
 * Genera voz a partir de texto utilizando Supertonic v2
 * corriendo NATIVAMENTE en JS usando ONNX Runtime.
 *
 * NOTA: Debes descargar los modelos de HuggingFace (`supertone-inc/supertonic`)
 * y guardarlos en la carpeta `models/` (por ejemplo: `models/supertonic.onnx`).
 *
 * @param {string} text - El texto a convertir a voz.
 * @param {string} outputPath - La ruta de destino del archivo de audio (.wav).
 * @param {Object} [options] - Opciones avanzadas de inferencia.
 * @param {string} [options.voice='F1'] - Nombre del Voice Style (ej. 'F1', 'M2').
 * @param {number} [options.speed=1.0] - Multiplicador de velocidad (ej. 0.8 lento, 1.5 rápido).
 * @param {number} [options.steps=20] - Pasos de inferencia (menor = más rápido, mayor = más calidad).
 * @returns {Promise<string|null>} - La ruta del archivo generado, o null si falló.
 */
export async function generateSpeech(text, outputPath, options = {}) {
    const {
        voice = 'F1',
        speed = 1.0,
        steps = 20
    } = options;

    console.log(`\n[TTS] Inicializando Supertonic vía ONNX Runtime para el texto: "${text}"`);
    console.log(`      Opciones activas -> Voz: ${voice} | Velocidad: ${speed}x | Pasos: ${steps}`);

    const modelPath = path.resolve('models', 'supertonic.onnx');

    try {
        // Verificar que el modelo exista
        await fs.access(modelPath);
    } catch (e) {
        console.error(`[TTS Error] No se encontró el modelo ONNX en: ${modelPath}`);
        console.log('-> Por favor, clona el repositorio de supertone-inc/supertonic o descarga sus `.onnx` a la carpeta `models`.');
        return null;
    }

    try {
        // 1. Cargar el modelo ONNX
        const session = await ort.InferenceSession.create(modelPath);

        // 2. Preparar el Tensor de entrada (esto dependerá del vocabulario del tokenizer de Supertonic)
        // Ejemplo genérico si toma un array de IDs (requerirá un tokenizador JS o equivalente de Python dict):
        // (Nota: Esta es una representación simulada de preprocesamiento directo)
        const textToIds = Array.from(text).map(c => c.charCodeAt(0));
        const inputTensor = new ort.Tensor('int64', BigInt64Array.from(textToIds.map(BigInt)), [1, textToIds.length]);

        // Tensores de configuración avanzados (dependiendo de los inputs exactos del modelo exportado):
        // 1. Speaker ID (Voz) -> 'F1' => Asumimos mapeo interno u otro tensor string/int
        // Como ejemplo de integración, lo pasamos como string si el ONNX lo soporta, o como ID
        const speakerIdTensor = new ort.Tensor('string', [voice], [1]);

        // 2. Velocidad (Speed) -> float32
        const speedTensor = new ort.Tensor('float32', Float32Array.from([speed]), [1]);

        // 3. Pasos de Inferencia (Steps) -> int64
        const stepsTensor = new ort.Tensor('int64', BigInt64Array.from([BigInt(steps)]), [1]);

        // 3. Ejecutar la inferencia (los nombres de los feeds dependen del modelo `.onnx`)
        // En supertonic suele recibir text, speaker_id, speed y steps.
        const feeds = {
            input: inputTensor,
            speaker_id: speakerIdTensor,
            speed: speedTensor,
            steps: stepsTensor
        };

        // Esto lanzará error si los "feeds" no coinciden con las variables de entrada del ONNX real,
        // pero es la estructura exacta que pide la arquitectura multihablante y parametrica.
        const results = await session.run(feeds);

        // 4. Procesar el output de audio (suele ser Float32Array a 24000/22050 Hz)
        const audioData = results.output.data; // array de Float32
        const sampleRate = 24000;

        // 5. Crear el WAV
        const wav = new WaveFile();
        wav.fromScratch(1, sampleRate, '32f', audioData);

        await fs.writeFile(outputPath, wav.toBuffer());
        console.log(`[TTS Success] Audio nativo guardado en: ${outputPath}`);
        return outputPath;

    } catch (error) {
        console.error('\n[TTS Error] Fallo al ejecutar el modelo ONNX localmente.');
        console.error('Detalle:', error.message);
        return null;
    }
}
