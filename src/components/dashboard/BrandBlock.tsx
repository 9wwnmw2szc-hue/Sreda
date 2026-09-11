import Image from "next/image";
import { SREDA_ASSETS } from "@/config/assets";

export function BrandBlock() {
  return (
    <aside className="dashboard-lower-card relative overflow-hidden rounded-[24px] border border-[#d9ebdf] bg-[linear-gradient(145deg,#f3faf5_0%,#e7f4ea_100%)] p-5 md:p-6">
      <div
        className="pointer-events-none absolute -right-6 -bottom-8 h-28 w-28 rounded-full bg-[radial-gradient(circle_at_center,rgba(62,207,142,0.28),transparent_70%)]"
        aria-hidden
      />
      <Image
        src={SREDA_ASSETS.decor.leaves}
        alt=""
        width={290}
        height={195}
        className="pointer-events-none absolute -right-4 -bottom-6 w-[140px] opacity-40"
        aria-hidden
      />
      <div className="relative flex items-start gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_8px_20px_rgba(47,158,107,0.15)]">
          <Image
            src={SREDA_ASSETS.decor.logoLeaf}
            alt=""
            width={180}
            height={180}
            className="h-8 w-8 object-contain"
          />
        </span>
        <div>
          <p className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
            Ваш бизнес растёт.
            <br />
            А рутина уходит.
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Среда — больше времени на главное.
          </p>
        </div>
      </div>
    </aside>
  );
}
