"use client";
import type { ReactNode } from "react";

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="field-hint">{children}</p>;
}

export function StickySaveBar({
  dirty,
  busy,
  onSave,
  onCancel,
  saveLabel = "Сохранить",
  cancelLabel = "Отмена",
  notice,
  error,
}: {
  dirty?: boolean;
  busy?: boolean;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  notice?: string;
  error?: string;
}) {
  return (
    <div className="sticky-save-bar" role="region" aria-label="Сохранение">
      {notice ? (
        <p className="sticky-save-bar__notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="sticky-save-bar__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sticky-save-bar__actions">
        {onCancel ? (
          <button
            type="button"
            className="button button--outline"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="button button--primary"
          disabled={busy || dirty === false}
          onClick={onSave}
        >
          {busy ? "Сохраняем…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

export function SetupProgress({
  steps,
  done,
}: {
  steps: { id: string; label: string; done: boolean }[];
  done: number;
}) {
  return (
    <div className="setup-progress" aria-label="Прогресс настройки">
      <p className="setup-progress__count">
        Прогресс: {done} из {steps.length}
      </p>
      <ul className="setup-progress__list">
        {steps.map((step) => (
          <li key={step.id} className={step.done ? "is-done" : ""}>
            <span aria-hidden>{step.done ? "✓" : "○"}</span> {step.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomerPreview({
  title = "Так это увидит клиент",
  lines,
}: {
  title?: string;
  lines: string[];
}) {
  return (
    <aside className="customer-preview" aria-label={title}>
      <h3>{title}</h3>
      <div className="customer-preview__bubble">
        {lines.map((line, i) => (
          <p key={i}>{line || "\u00a0"}</p>
        ))}
      </div>
    </aside>
  );
}

export function SetupWizardShell({
  title,
  subtitle,
  step,
  stepCount,
  stepTitle,
  children,
  onBack,
  onNext,
  nextLabel,
  busy,
  notice,
  error,
}: {
  title: string;
  subtitle?: string;
  step: number;
  stepCount: number;
  stepTitle: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  busy?: boolean;
  notice?: string;
  error?: string;
}) {
  return (
    <div className="setup-wizard">
      <header className="setup-wizard__header">
        <p className="eyebrow">
          Шаг {step} из {stepCount}
        </p>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
        <h2>{stepTitle}</h2>
      </header>
      {notice ? (
        <p className="account-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="setup-wizard__body">{children}</div>
      <StickySaveBar
        busy={busy}
        onSave={onNext}
        onCancel={onBack}
        cancelLabel="Назад"
        saveLabel={nextLabel}
      />
    </div>
  );
}
