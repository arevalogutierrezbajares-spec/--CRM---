"use client";

import { useState, useRef } from "react";
import { Upload, X, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_FILES_BUCKET } from "@/lib/project-files/constants";
import { formatBytes } from "@/lib/project-files/limits";

type UploadState = "idle" | "uploading" | "done" | "error";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".zip"];

export function PublicUploadForm({ token }: { token: string }) {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<{ filename: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(`El archivo es muy grande. Máximo ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      setError(`File type not allowed. Accepted: ${ALLOWED_EXTS.join(", ")}`);
      return;
    }
    setError(null);
    setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setState("uploading");
    setProgress(10);
    setError(null);

    try {
      // Step 1: Get signed upload URL from server
      const signRes = await fetch(`/api/access/${token}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign",
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!signRes.ok) {
        const { error: msg } = await signRes.json() as { error?: string };
        throw new Error(msg || "No se pudo preparar la carga");
      }
      const { path, token: uploadToken, bucket } = await signRes.json() as { path: string; token: string; bucket: string };
      setProgress(30);

      // Step 2: Upload directly to Supabase Storage
      const supabase = createClient();
      const body = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from(bucket ?? PROJECT_FILES_BUCKET)
        .uploadToSignedUrl(path, uploadToken, body, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);
      setProgress(80);

      // Step 3: Finalize — create DB record
      const finalRes = await fetch(`/api/access/${token}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          storagePath: path,
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          label: label.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (!finalRes.ok) throw new Error("Se cargó el archivo pero no se pudo guardar");
      setProgress(100);

      setDone((prev) => [...prev, { filename: file.name }]);
      setState("done");
      setFile(null);
      setLabel("");
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "La carga falló");
    }
  }

  return (
    <div className="space-y-4">
      {done.length > 0 && (
        <ul className="space-y-1.5">
          {done.map((d, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">{d.filename} enviado</span>
            </li>
          ))}
        </ul>
      )}

      <div
        className="rounded-xl border-2 border-dashed border-[var(--border)] p-6 text-center cursor-pointer hover:border-[var(--foreground)/30] transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
        <p className="mt-2 text-sm font-medium">
          {file ? file.name : "Haz clic para elegir un archivo"}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          PDF, Word, Excel, imágenes, ZIP — máx. 25 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_EXTS.join(",")}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {file && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] p-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{formatBytes(file.size)}</p>
            </div>
            <button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <input
            type="text"
            placeholder="Etiqueta (opcional) p. ej. NDA firmado"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <textarea
            placeholder="Nota para el equipo (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {state === "uploading" && (
        <div className="h-1.5 w-full rounded-full bg-[var(--secondary)] overflow-hidden">
          <div
            className="h-full bg-[var(--foreground)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {file && state !== "uploading" && (
        <button
          type="button"
          onClick={handleUpload}
          className="w-full rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
        >
          Enviar archivo
        </button>
      )}
    </div>
  );
}
