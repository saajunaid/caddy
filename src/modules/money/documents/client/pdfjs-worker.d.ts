// pdf.js ships its worker without type declarations. Importing it registers globalThis.pdfjsWorker,
// which pdf.js uses to run on the main thread when a separate worker can't start.
declare module "pdfjs-dist/build/pdf.worker.min.mjs";
