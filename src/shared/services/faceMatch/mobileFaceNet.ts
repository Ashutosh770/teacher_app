/**
 * On-device MobileFaceNet inference.
 *
 * MUST mirror `face-recognition-service/app/models/mobile_embedding.py` exactly
 * — same crop, same input size, same normalisation, same L2 step. The server
 * generates the templates this matches against, so any divergence puts the two
 * in different vector spaces and produces scores that look plausible and mean
 * nothing. If you change one, change the other.
 *
 * Everything here fails soft. Offline matching is an enhancement; online
 * verification is the real path and must never be affected by a missing or
 * broken model.
 */
import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';

/** Matches MOBILE_MODEL_VERSION on the server. */
export const MOBILE_MODEL_VERSION = 'mobilefacenet-128';
export const MOBILE_EMBEDDING_DIM = 128;

/** MobileFaceNet's input geometry — same as the server's `_INPUT_SIZE`. */
const INPUT_WIDTH = 112;
const INPUT_HEIGHT = 112;

let model: TensorflowModel | null = null;
let loadAttempted = false;
let loadFailureReason: string | null = null;

/**
 * Loads the bundled model once.
 *
 * The repo ships a text placeholder pending a licence decision on real weights,
 * so failure here is expected today and must stay quiet — a thrown error would
 * take down a screen whose primary job (online attendance) works perfectly.
 */
export async function loadMobileModel(): Promise<boolean> {
  if (loadAttempted) return model !== null;
  loadAttempted = true;

  try {
    // Empty delegate list = the standard CPU delegate. GPU delegates are
    // available but not every model runs on them, and a face embedding at this
    // size is not compute-bound on a modern tablet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    model = await loadTensorflowModel(
      require('../../../../assets/models/mobilefacenet.tflite'),
      [],
    );
    return true;
  } catch (error) {
    loadFailureReason = error instanceof Error ? error.message : String(error);
    if (__DEV__) {
      console.warn(
        `[mobileFaceNet] model unavailable — offline matching disabled. ${loadFailureReason}`,
      );
    }
    model = null;
    return false;
  }
}

export function isMobileModelLoaded(): boolean {
  return model !== null;
}

export function mobileModelFailureReason(): string | null {
  return loadFailureReason;
}

/**
 * Embeds a pre-cropped, resized face.
 *
 * Takes RGB bytes rather than a frame URI because decoding and cropping are the
 * caller's concern — this keeps the numerical contract with the server in one
 * small, checkable place.
 *
 * `rgb` must be INPUT_WIDTH * INPUT_HEIGHT * 3 bytes.
 */
export function embedFace(rgb: Uint8Array): Float32Array | null {
  if (model === null) return null;

  const expected = INPUT_WIDTH * INPUT_HEIGHT * 3;
  if (rgb.length !== expected) {
    if (__DEV__) {
      console.warn(`[mobileFaceNet] expected ${expected} bytes, got ${rgb.length}`);
    }
    return null;
  }

  try {
    // [-1, 1] normalisation — the convention MobileFaceNet exports are trained
    // with, and exactly what the server applies. A mismatch yields embeddings
    // that are stable and meaningless rather than obviously broken.
    const input = new Float32Array(expected);
    for (let i = 0; i < expected; i += 1) {
      input[i] = (rgb[i] - 127.5) / 128.0;
    }

    // The native bridge works in raw ArrayBuffers, so the typed array is passed
    // and read back through its underlying buffer.
    const [outputBuffer] = model.runSync([input.buffer as ArrayBuffer]);
    const embedding = new Float32Array(outputBuffer);

    // L2-normalise so cosine similarity is a plain dot product, matching how the
    // server stores its templates.
    let sumSquares = 0;
    for (let i = 0; i < embedding.length; i += 1) sumSquares += embedding[i] * embedding[i];
    const norm = Math.sqrt(sumSquares);
    if (norm === 0) return null;
    for (let i = 0; i < embedding.length; i += 1) embedding[i] /= norm;

    return embedding;
  } catch (error) {
    if (__DEV__) {
      console.warn('[mobileFaceNet] inference failed:', error);
    }
    return null;
  }
}

/**
 * Cosine similarity between two L2-normalised vectors.
 *
 * Both sides are already normalised, so this is a dot product. Returns 0 on a
 * dimension mismatch rather than throwing — that case means the device and
 * server disagree about the model, and scoring across spaces would produce a
 * confident wrong answer where zero is honest.
 */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}
