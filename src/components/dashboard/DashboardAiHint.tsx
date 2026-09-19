import Link from "next/link";
import { Sparkles } from "lucide-react";

export function DashboardAiHint({
  hint,
  primaryHref = "/posts",
  primaryLabel = "Создать пост",
  secondaryHref = "/analytics",
  secondaryLabel = "Другие идеи",
}: {
  hint?: string | null;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const fromContext = Boolean(hint?.trim());
  const text =
    hint?.trim() ||
    "Короткий пост о новинке или акции помогает клиентам быстрее откликнуться.";

  return (
    <section className="soty-ai" aria-labelledby="soty-ai-title">
      <div className="soty-ai__mark" aria-hidden>
        <Sparkles size={22} strokeWidth={1.7} />
      </div>
      <div className="soty-ai__body">
        <h2 id="soty-ai-title">
          {fromContext ? "Подсказка по настройке" : "Идея для продвижения"}
        </h2>
        <p>{text}</p>
        <div className="soty-ai__actions">
          <Link href={primaryHref} className="button button--primary button--sm">
            {primaryLabel}
          </Link>
          <Link href={secondaryHref} className="button button--ghost button--sm">
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
