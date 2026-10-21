// Browser-only: hashing, text extraction (PDF text layer → OCR) and upload with progress.
// Everything runs on the device; only the original file and the extracted text leave it.
// No AI: pdf.js reads the text layer, Tesseract (open-source OCR) reads images and scans.

import type { AllowedMimeType } from "../storage";
import { MAX_EXTRACTED_TEXT_CHARS } from "../storage";
import { itemsToLines, looksScanned, type PositionedText } from "./text-layout";

export type TextSource = "text-layer" | "ocr" | "none";

export type ExtractResult = {
  text: string;
  source: TextSource;
  /** Shown to the user when text couldn't be read. */
  note?: string;
};

export type Progress = (fraction: number, detail: string) => void;

/** SHA-256 of the file, hex encoded (Web Crypto). Used to spot duplicates. */
export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Pages OCR'd from a scanned PDF. Bills put what matters on the first pages. */
const MAX_OCR_PAGES = 4;
/** Text layers beyond this many pages are ignored (statements, not bills). */
const MAX_TEXT_PAGES = 30;
/** Longest image side sent to OCR; phone photos are scaled down to keep it quick. */
const MAX_OCR_SIDE = 2400;

type PdfJs = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

/** How long to wait for the bundled pdf.js worker before reading on the main thread instead. */
const WORKER_START_MS = 15_000;

/**
 * Opens a PDF with pdf.js. Uses a module worker bundled from the package (one per document,
 * terminated afterwards). If that worker can't start or never answers, falls back to pdf.js's
 * documented main-thread mode by loading the worker code into the page.
 */
async function openPdf(
  data: Uint8Array,
): Promise<{ pdf: PdfDocument; close: () => Promise<void> }> {
  const pdfjs = await import("pdfjs-dist");
  let worker: Worker | null = null;
  try {
    worker = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      {
        type: "module",
      },
    );
  } catch {
    worker = null;
  }
  if (worker) {
    pdfjs.GlobalWorkerOptions.workerPort = worker;
    const task = pdfjs.getDocument({ data: data.slice() });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const pdf = await Promise.race([
        task.promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("pdf worker timeout")),
            WORKER_START_MS,
          );
        }),
      ]);
      clearTimeout(timer);
      return {
        pdf,
        close: async () => {
          await task.destroy().catch(() => undefined);
          worker?.terminate();
          pdfjs.GlobalWorkerOptions.workerPort = null;
        },
      };
    } catch {
      clearTimeout(timer);
      await task.destroy().catch(() => undefined);
      worker.terminate();
      pdfjs.GlobalWorkerOptions.workerPort = null;
    }
  }
  await import("pdfjs-dist/build/pdf.worker.min.mjs");
  const task = pdfjs.getDocument({ data });
  const pdf = await task.promise;
  return { pdf, close: () => task.destroy().catch(() => undefined) };
}

async function ocr(
  images: (HTMLCanvasElement | Blob)[],
  onProgress: Progress,
  base = 0,
  span = 1,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  let current = 0;
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        const fraction = (current + m.progress) / images.length;
        onProgress(
          base + span * fraction,
          `Reading text (OCR) ${Math.round(fraction * 100)}%`,
        );
      } else if (m.status.startsWith("loading")) {
        onProgress(base, "Loading the text reader…");
      }
    },
  });
  try {
    const pages: string[] = [];
    for (const [index, image] of images.entries()) {
      current = index;
      const { data } = await worker.recognize(image);
      pages.push(data.text);
    }
    return pages.join("\n");
  } finally {
    await worker.terminate();
  }
}

/** Draws an image file onto a canvas no larger than MAX_OCR_SIDE (fixes huge phone photos). */
async function imageToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_OCR_SIDE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function extractPdf(
  file: File,
  onProgress: Progress,
): Promise<ExtractResult> {
  onProgress(0, "Opening the PDF…");
  const { pdf, close } = await openPdf(
    new Uint8Array(await file.arrayBuffer()),
  );
  try {
    const pageCount = Math.min(pdf.numPages, MAX_TEXT_PAGES);
    const pages: string[] = [];
    for (let n = 1; n <= pageCount; n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const item of content.items) {
        if ("str" in item) {
          items.push({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
            height: item.height,
          });
        }
      }
      pages.push(itemsToLines(items).join("\n"));
      onProgress((n / pageCount) * 0.3, `Reading page ${n} of ${pageCount}`);
    }
    const text = pages.join("\n");
    if (!looksScanned(text, pageCount)) return { text, source: "text-layer" };

    // A scan with no usable text layer: render the first pages and OCR them.
    const canvases: HTMLCanvasElement[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_OCR_PAGES); n += 1) {
      const page = await pdf.getPage(n);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(
        2.5,
        MAX_OCR_SIDE / Math.max(unscaled.width, unscaled.height),
      );
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      canvases.push(canvas);
    }
    const scanned = await ocr(canvases, onProgress, 0.3, 0.7);
    return scanned.trim()
      ? { text: scanned, source: "ocr" }
      : {
          text: "",
          source: "none",
          note: "No readable text found in this scan.",
        };
  } finally {
    await close();
  }
}

/**
 * Extracts text from a bill or receipt: the PDF text layer when there is one, otherwise OCR.
 * Never throws: a failure becomes source "none" with a note, and the user enters details by hand.
 */
export async function extractText(
  file: File,
  mimeType: AllowedMimeType,
  onProgress: Progress,
): Promise<ExtractResult> {
  try {
    let result: ExtractResult;
    if (mimeType === "application/pdf") {
      result = await extractPdf(file, onProgress);
    } else {
      let canvas: HTMLCanvasElement;
      try {
        canvas = await imageToCanvas(file);
      } catch {
        return {
          text: "",
          source: "none",
          note:
            mimeType === "image/heic" || mimeType === "image/heif"
              ? "This browser can't open HEIC photos, so the text wasn't read. Enter the details yourself, or upload a JPEG."
              : "This image couldn't be opened for reading.",
        };
      }
      const text = await ocr([canvas], onProgress);
      result = text.trim()
        ? { text, source: "ocr" }
        : {
            text: "",
            source: "none",
            note: "No readable text found in this photo.",
          };
    }
    return { ...result, text: result.text.slice(0, MAX_EXTRACTED_TEXT_CHARS) };
  } catch {
    return {
      text: "",
      source: "none",
      note: "The text couldn't be read on this device. Enter the details yourself.",
    };
  }
}

/** PUTs the file to a signed upload URL, reporting progress (fetch can't report upload progress). */
export function uploadWithProgress(
  signedUrl: string,
  file: Blob,
  contentType: string,
  apiKey: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("content-type", contentType);
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("apikey", apiKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(file);
  });
}
