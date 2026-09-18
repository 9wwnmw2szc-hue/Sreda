"use client";
import { useEffect } from "react";

/** Warn before leaving when the form is dirty. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

export function confirmLeaveIfDirty(dirty: boolean): boolean {
  if (!dirty) return true;
  return window.confirm(
    "Есть несохранённые изменения.\n\nНажмите «OK», чтобы выйти без сохранения, или «Отмена», чтобы остаться.",
  );
}
