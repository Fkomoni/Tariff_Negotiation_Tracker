/**
 * The client's <input accept> attribute and the File API's reported
 * name/type are both purely advisory — a request can set either to anything
 * regardless of what bytes actually follow. This only trusts the file's
 * leading bytes (magic numbers) to decide what it actually is.
 */

interface FileSignature {
  mimeType: string;
  extension: string;
  signature: number[];
}

const ALLOWED_SIGNATURES: FileSignature[] = [
  { mimeType: "application/pdf", extension: "pdf", signature: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mimeType: "image/png", extension: "png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", extension: "jpg", signature: [0xff, 0xd8, 0xff] },
];

export interface DetectedFile {
  mimeType: string;
  extension: string;
}

/** Returns the detected type if the buffer's leading bytes match an allowed
 * signature (PDF/PNG/JPEG), else null — callers should reject on null rather
 * than falling back to the caller-supplied MIME type or file extension. */
export function detectAllowedFileType(buffer: Buffer): DetectedFile | null {
  for (const candidate of ALLOWED_SIGNATURES) {
    if (buffer.length < candidate.signature.length) continue;
    if (candidate.signature.every((byte, i) => buffer[i] === byte)) {
      return { mimeType: candidate.mimeType, extension: candidate.extension };
    }
  }
  return null;
}

const UNSAFE_FILENAME_CHARS = /[^a-zA-Z0-9._ -]/g;

/** Strips quotes, control characters, path separators, and anything else
 * that isn't a safe filename character before a name is stored and later
 * echoed back into a Content-Disposition header. */
export function sanitizeFilename(name: string, fallbackExtension: string): string {
  const cleaned = name.replace(UNSAFE_FILENAME_CHARS, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 150) : `attachment.${fallbackExtension}`;
}
