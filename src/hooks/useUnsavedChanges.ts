"use client";
import { useEffect, useRef } from "react";

/** Warn before leaving when the form is dirty. */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
}

export function confirmLeaveIfDirty(dirty: boolean): boolean {
  if (!dirty) return true;
  return window.confirm(
    "Есть несохранённые изменения.\n\nНажмите «OK», чтобы выйти без сохранения, или «Отмена», чтобы остаться.",
  );
}
