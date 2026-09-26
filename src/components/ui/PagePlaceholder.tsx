import Link from "next/link";
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
  stageHint,
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
        БизнеСоты · скоро
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] md:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] md:text-lg">
        {description}
      </p>
      <p
        className="mt-6 text-sm text-[var(--text-muted)]"
        title={stageHint ? "Раздел в разработке" : undefined}
      >
        Этот раздел ещё готовится. Сейчас можно познакомиться с рабочим
        пространством.
      </p>
      <Link href="/dashboard" className="button button--outline mt-6">
        В рабочее пространство
      </Link>
    </section>
  );
}
