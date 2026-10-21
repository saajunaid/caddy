// Storage rules for original documents. Pure; shared by the browser uploader, server actions and jobs.

export const DOCUMENTS_BUCKET = "household-documents";
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Longest extracted text the browser may send for parsing (the server action body limit is 1 MB). */
export const MAX_EXTRACTED_TEXT_CHARS = 150_000;
/** Signed links to view an original last five minutes. */
export const SIGNED_URL_SECONDS = 300;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const BY_EXTENSION: Record<string, AllowedMimeType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
};

/** The file's type, trusting the browser first and the extension second. Null if not allowed. */
export function resolveMimeType(
  fileName: string,
  browserType: string,
): AllowedMimeType | null {
  const type = browserType.toLowerCase();
  if ((ALLOWED_MIME_TYPES as readonly string[]).includes(type)) {
    return type as AllowedMimeType;
  }
  if (type === "image/jpg") return "image/jpeg";
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  return extension ? (BY_EXTENSION[extension] ?? null) : null;
}

/**
 * A storage-safe file name: ASCII letters, digits, dot, dash and underscore, at most 120 chars,
 * keeping the extension. "Bill – Sept 2026 (1).PDF" → "Bill-Sept-2026-1.pdf".
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const match = /^(.*?)(?:\.([A-Za-z0-9]{1,8}))?$/.exec(base.trim());
  const stem = (match?.[1] ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 100);
  const extension = match?.[2]?.toLowerCase();
  const safeStem = stem || "document";
  return extension ? `${safeStem}.${extension}` : safeStem;
}

export function storagePathFor(
  householdId: string,
  documentId: string,
  fileName: string,
): string {
  return `${householdId}/${documentId}/${safeFileName(fileName)}`;
}

export function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
