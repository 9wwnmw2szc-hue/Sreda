"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/apiClient";
export type FileItem = { id: string; filename: string; type: string };
export function AttachmentPicker({
  businessId,
  files,
  onChange,
  mediaOnly = false,
  disabled = false,
  onBusy,
}: {
  businessId: string;
  files: FileItem[];
  onChange: (files: FileItem[]) => void;
  mediaOnly?: boolean;
  disabled?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      if (file.size > 50 * 1024 * 1024)
        throw Error("Максимальный размер файла — 50 МБ.");
      const type = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "voice"
            : "document";
      const result = await apiRequest<FileItem>(
        `/api/v1/businesses/${businessId}/attachments`,
        {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Type": type,
            "X-File-Name": encodeURIComponent(file.name),
          },
          body: file,
        },
      );
      onChange([...files, result]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить файл.");
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <div>
      <label>
        Вложения
        <input
          type="file"
          accept={
            mediaOnly
              ? "image/jpeg,image/png,image/webp,video/mp4,video/webm"
              : "image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/ogg,audio/mpeg,application/pdf,text/plain"
          }
          disabled={disabled || busy || files.length >= 10}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>
      {busy && <p role="status">Загрузка файла…</p>}
      {error && <p role="alert">{error}</p>}
      <ul>
        {files.map((f) => (
          <li key={f.id}>
            <a href={`/api/v1/businesses/${businessId}/attachments/${f.id}`}>
              {f.filename}
            </a>{" "}
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => onChange(files.filter((x) => x.id !== f.id))}
            >
              Убрать
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
