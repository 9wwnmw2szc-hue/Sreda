"use client";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Plus, Layers2 } from "lucide-react";
import { SCENE_PAINT_ORDER, SCENE_FRAME } from "@/config/scene";
import { SolutionModule } from "./SolutionModule";
import type { WorkspaceSolutionItem } from "@/hooks/useDashboardData";
interface Props {
  items: WorkspaceSolutionItem[];
  onSelect: (item: WorkspaceSolutionItem) => void;
  onCatalog: () => void;
}
export function SolutionWorkspace({ items, onSelect, onCatalog }: Props) {
  const debug = useSearchParams().get("debugScene") === "1";
  const installed = items.filter((item) =>
    ["active", "setup_required", "paused"].includes(item.status),
  );
  return (
    <>
      <div
        className={`workspace-scene${debug ? " workspace-scene--debug" : ""}`}
        style={{
          aspectRatio: `${SCENE_FRAME.width}/${SCENE_FRAME.visibleHeight}`,
        }}
        aria-label="Решения вашего бизнеса"
      >
        <div className="scene-frame">
          <Image
            src="/assets/sreda/v2/desk-platform.webp"
            alt=""
            width={1536}
            height={1024}
            unoptimized
            priority
            className="workspace-scene__background"
            sizes="(max-width: 767px) 1px, (max-width: 1099px) 100vw, 70vw"
          />
          {SCENE_PAINT_ORDER.map((code) => {
            const item = items.find((i) => i.code === code);
            return item ? (
              <SolutionModule
                key={code}
                item={item}
                onSelect={onSelect}
                placement="scene"
                debug={debug}
              />
            ) : null;
          })}
        </div>
      </div>
      <section className="mobile-solutions panel">
        <div className="panel-heading">
          <h2>Мои решения</h2>
          <span className="subtle-count">{installed.length}</span>
        </div>
        {installed.length ? (
          <div className="solution-card-list">
            {installed.map((item) => (
              <SolutionModule
                key={item.solution.id}
                item={item}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Layers2 size={25} />
            <p>Выберите первый инструмент для вашего бизнеса.</p>
          </div>
        )}
        <button
          className="button button--outline button--full"
          onClick={onCatalog}
        >
          <Plus size={20} />
          Добавить решение
        </button>
      </section>
    </>
  );
}
