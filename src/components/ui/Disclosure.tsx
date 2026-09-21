"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";

export function Disclosure({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <div className={`disclosure${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="disclosure__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight className="disclosure__chevron" size={18} aria-hidden />
        <span className="disclosure__copy">
          <span className="disclosure__title">{title}</span>
          {hint ? <span className="disclosure__hint">{hint}</span> : null}
        </span>
      </button>
      {open ? (
        <div className="disclosure__panel" id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
