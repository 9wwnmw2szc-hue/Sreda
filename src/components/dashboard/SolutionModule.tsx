"use client";
import Image from "next/image";
import { ChevronRight, Plus } from "lucide-react";
import type { WorkspaceSolutionItem } from "@/hooks/useDashboardData";
export function solutionState(item: WorkspaceSolutionItem): {
  label: string;
  tone: string;
} {
  switch (item.status) {
    case "active":
      return { label: "Подключено", tone: "success" };
    case "setup_required":
      return { label: "Продолжить настройку", tone: "warning" };
    case "paused":
      return { label: "Нужна проверка", tone: "muted" };
    case "unavailable":
      return { label: "Недоступно", tone: "muted" };
    case "available":
      return { label: "Подключить", tone: "available" };
    default:
      return {
        label:
          item.solution.price <= 0
            ? "Бесплатно"
            : `${item.solution.price} ₽/мес.`,
        tone: "available",
      };
  }
}
interface Props {
  item: WorkspaceSolutionItem;
  onSelect: (item: WorkspaceSolutionItem) => void;
  placement?: "scene" | "card";
  debug?: boolean;
  /** Soft ordering hint from parent; no badge UI. */
  recommended?: boolean;
}
export function SolutionModule({
  item,
  onSelect,
  placement = "card",
  debug = false,
}: Props) {
  const { dock } = item.visual;
  const state = solutionState(item);
  const image = (
    <Image
      src={item.visual.assetSrc}
      alt=""
      width={1024}
      height={1024}
      sizes={
        placement === "scene" ? "(min-width: 1500px) 210px, 170px" : "80px"
      }
      className="module-art"
    />
  );
  if (placement === "scene")
    return (
      <>
        <button
          type="button"
          className={`scene-module scene-module--${item.code}`}
          onClick={() => onSelect(item)}
          aria-label={`${item.solution.name}: ${state.label}`}
          style={{
            left: `${dock.x}%`,
            top: `${dock.y}%`,
            width: `${dock.width}%`,
            zIndex: dock.zIndex,
          }}
        >
          {image}
        </button>
        <button
          type="button"
          className={`scene-label scene-label--${dock.side}`}
          onClick={() => onSelect(item)}
          style={{ left: `${dock.labelX}%`, top: `${dock.labelY}%` }}
        >
          <span>
            <strong>{item.solution.name}</strong>
            <span className={`solution-state tone-${state.tone}`}>
              {item.status !== "available" && <i aria-hidden />}
              {state.label}
            </span>
          </span>
          {item.status === "available" && (
            <span className="scene-label__plus">
              <Plus size={19} />
            </span>
          )}
        </button>
        {debug && (
          <span
            className="dock-marker"
            style={{ left: `${dock.x}%`, top: `${dock.y}%` }}
            aria-hidden
          />
        )}
      </>
    );
  return (
    <button
      type="button"
      className={`solution-card solution-card--${item.code}`}
      onClick={() => onSelect(item)}
    >
      <span className="solution-card__art">{image}</span>
      <span className="solution-card__text">
        <strong>{item.solution.name}</strong>
        <span className={`solution-state tone-${state.tone}`}>
          {item.status !== "available" && <i aria-hidden />}
          {state.label}
        </span>
      </span>
      <ChevronRight size={18} aria-hidden />
    </button>
  );
}
