import { cn } from "@/lib/cn";

interface PagePlaceholderProps {
  title: string;
  description: string;
  stageHint?: string;
  className?: string;
}

export function PagePlaceholder({
  title,
  description,
  stageHint = "Раздел будет наполнен на следующих этапах.",
  className,
}: PagePlaceholderProps) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-[var(--border-light)] bg-[var(--surface)] p-8 shadow-[var(--shadow-soft)] md:p-10",
        className,
      )}
    >
      <p className="mb-3 text-sm font-medium tracking-wide text-[var(--text-muted)] uppercase">
        Среда · этап 1
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
        {description}
      </p>
      <p className="mt-6 text-sm text-[var(--text-muted)]">{stageHint}</p>
    </section>
  );
}
