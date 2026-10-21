"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { Camera, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/browser";
import { btn, btnPrimary, link } from "../../ui";
import {
  cancelUploadAction,
  finishUploadAction,
  startUploadAction,
} from "../actions";
import { extractText, sha256Hex, uploadWithProgress } from "../client/extract";
import {
  DOCUMENTS_BUCKET,
  MAX_DOCUMENT_BYTES,
  resolveMimeType,
} from "../storage";

type Step = "checking" | "uploading" | "reading" | "saving";

type UploadState =
  | { phase: "idle" }
  | {
      phase: "working";
      fileName: string;
      step: Step;
      fraction: number;
      detail: string;
    }
  | { phase: "duplicate"; fileName: string; documentId?: string }
  | { phase: "error"; fileName: string; message: string };

const STEPS: { id: Step; label: string }[] = [
  { id: "checking", label: "Check" },
  { id: "uploading", label: "Upload" },
  { id: "reading", label: "Read" },
  { id: "saving", label: "Save" },
];

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** "Add bill or receipt": hashes, uploads privately, reads the text on this device, then opens the review. */
export function Uploader() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const busy = state.phase === "working";

  async function handle(file: File) {
    const fileName = file.name || "photo.jpg";
    const mimeType = resolveMimeType(fileName, file.type);
    if (!mimeType) {
      setState({
        phase: "error",
        fileName,
        message: "Choose a PDF or a photo (JPEG, PNG, HEIC or WebP).",
      });
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setState({
        phase: "error",
        fileName,
        message: "That file is over 20 MB.",
      });
      return;
    }
    const progress = (step: Step, fraction: number, detail: string) =>
      setState({ phase: "working", fileName, step, fraction, detail });

    progress("checking", 0, "Checking whether you've added this before…");
    let documentId: string | null = null;
    try {
      const sha256 = await sha256Hex(file);
      const started = await startUploadAction({
        fileName,
        mimeType,
        sizeBytes: file.size,
        sha256,
      });
      if (!started.ok) {
        setState(
          started.duplicateId !== undefined ||
            started.error.startsWith("You've already")
            ? { phase: "duplicate", fileName, documentId: started.duplicateId }
            : { phase: "error", fileName, message: started.error },
        );
        return;
      }
      documentId = started.documentId;

      progress("uploading", 0, "Uploading privately…");
      const supabase = createClient();
      const signed = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUploadUrl(started.storagePath);
      if (signed.error) throw new Error("upload-url");
      await uploadWithProgress(
        signed.data.signedUrl,
        file,
        started.mimeType,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
        (f) =>
          progress(
            "uploading",
            f,
            `Uploading privately… ${Math.round(f * 100)}%`,
          ),
      );

      progress("reading", 0, "Reading the text on this device…");
      const extracted = await extractText(file, mimeType, (f, detail) =>
        progress("reading", f, detail),
      );

      progress("saving", 1, "Saving what Caddy read…");
      const finished = await finishUploadAction({
        documentId,
        text: extracted.text,
        textSource: extracted.source,
      });
      if (!finished.ok) {
        setState({ phase: "error", fileName, message: finished.error });
        return;
      }
      setState({ phase: "idle" });
      router.push(
        `/money/bills/${finished.documentId}${extracted.note ? "?unread=1" : ""}`,
      );
    } catch {
      if (documentId)
        await cancelUploadAction(documentId).catch(() => undefined);
      setState({
        phase: "error",
        fileName,
        message: online
          ? "The upload didn't finish. Check your connection and try again."
          : "You're offline. Try again when you're back online.",
      });
    }
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void handle(file);
  }

  const stepIndex =
    state.phase === "working"
      ? STEPS.findIndex((s) => s.id === state.step)
      : -1;

  return (
    <Card className="grid gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnPrimary}
          disabled={busy || !online}
          onClick={() => fileInput.current?.click()}
        >
          <Upload aria-hidden="true" />
          Add bill or receipt
        </button>
        <button
          type="button"
          className={btn}
          disabled={busy || !online}
          onClick={() => cameraInput.current?.click()}
        >
          <Camera aria-hidden="true" />
          Take photo
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onPick}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onPick}
        />
        <span className="text-sm text-muted">PDF or photo, up to 20 MB</span>
      </div>

      {!online ? (
        <p className="text-sm text-due">
          You&apos;re offline. Adding bills needs a connection.
        </p>
      ) : null}

      <div aria-live="polite" className="contents">
        {state.phase === "working" ? (
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">
                {state.fileName}
              </span>
              <span className="text-sm text-info">{state.detail}</span>
            </div>
            <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
              {STEPS.map((step, index) => (
                <li key={step.id} className="grid gap-1">
                  <span
                    role={index === stepIndex ? "progressbar" : undefined}
                    aria-label={index === stepIndex ? step.label : undefined}
                    aria-valuemin={index === stepIndex ? 0 : undefined}
                    aria-valuemax={index === stepIndex ? 100 : undefined}
                    aria-valuenow={
                      index === stepIndex
                        ? Math.round(state.fraction * 100)
                        : undefined
                    }
                    className="h-1.5 overflow-hidden rounded-full bg-line"
                  >
                    <span
                      className="block h-full rounded-full bg-info transition-[width]"
                      style={{
                        width:
                          index < stepIndex
                            ? "100%"
                            : index === stepIndex
                              ? `${Math.max(4, state.fraction * 100)}%`
                              : "0%",
                      }}
                    />
                  </span>
                  <span
                    className={
                      index <= stepIndex
                        ? "text-xs font-semibold"
                        : "text-xs text-muted"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {state.phase === "duplicate" ? (
          <p role="status" className="text-sm">
            <span className="text-due">
              You&apos;ve already added {state.fileName}.
            </span>{" "}
            {state.documentId ? (
              <Link className={link} href={`/money/bills/${state.documentId}`}>
                Open the existing copy
              </Link>
            ) : null}
          </p>
        ) : null}

        {state.phase === "error" ? (
          <p role="alert" className="text-sm text-bad">
            {state.fileName}: {state.message}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
