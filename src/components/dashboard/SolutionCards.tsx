"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  DASHBOARD_SOLUTION_COPY,
  solutionRoute,
} from "@/config/solutionPresentation";
import { productSolutionHref } from "@/lib/productSolutions";
import type { WorkspaceSolutionItem } from "@/hooks/useDashboardData";
import type { SolutionStatus } from "@/types";
import { SolutionIcon } from "@/components/solutions/SolutionIcon";

function statusLabel(
  status: SolutionStatus,
  note?: string,
): {
  text: string;
  tone: "ok" | "warn" | "idle" | "error";
} {
  if (note && /ошибк|error|fail/i.test(note))
    return { text: "Ошибка подключения", tone: "error" };
  switch (status) {
    case "active":
      return { text: "Работает", tone: "ok" };
    case "setup_required":
      return { text: "Требует настройки", tone: "warn" };
    case "paused":
      return { text: "Приостановлено", tone: "idle" };
    case "unavailable":
      return { text: "Ошибка подключения", tone: "error" };
    default:
      return { text: "Не подключено", tone: "idle" };
  }
}

export function SolutionCards({
  items,
}: {
  items: WorkspaceSolutionItem[];
}) {
  return (
    <section className="soty-solutions-grid" aria-label="Решения">
      {items.map((item) => {
        const copy = DASHBOARD_SOLUTION_COPY[item.code] ?? {
          title: item.solution.name,
          subtitle: item.solution.description,
        };
        const status = statusLabel(item.status, item.note);
        const href =
          item.status === "available"
            ? "/solutions"
            : productSolutionHref(item.status, item.code) ||
              solutionRoute(item.code);
        const tone =
          item.code === "admin_messages" ? "messages" : item.code;
        return (
          <Link
            key={item.code}
            href={href}
            className={`soty-solution-card soty-solution-card--${tone}`}
          >
            <div className="soty-solution-card__art">
              <SolutionIcon solution={item.code} variant="hero" />
            </div>
            <div className="soty-solution-card__body">
              <h3>{copy.title}</h3>
              <p>{copy.subtitle}</p>
              <div className={`soty-solution-card__status is-${status.tone}`}>
                <span className="soty-solution-card__dot" aria-hidden />
                {status.text}
              </div>
            </div>
            <ChevronRight className="soty-solution-card__chevron" size={18} />
          </Link>
        );
      })}
    </section>
  );
}
