import Image from "next/image";
import Link from "next/link";
import { SREDA_ASSETS } from "@/config/assets";

export function PromoCard() {
  return (
    <section className="relative w-full overflow-hidden rounded-[22px] bg-[linear-gradient(145deg,#f4f0ff_0%,#e4eefe_55%,#f8fbff_100%)] p-5 text-[var(--text-primary)] shadow-[var(--shadow-m)]">
      <Image
        src={SREDA_ASSETS.ui.promoCard}
        alt=""
        width={340}
        height={195}
        className="pointer-events-none absolute -right-6 -bottom-8 w-[150px] rotate-6 opacity-90 drop-shadow-lg"
        aria-hidden
      />
      <div className="relative max-w-[70%]">
        <h2 className="text-base font-semibold tracking-tight">
          Нужны дополнительные функции?
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          Подключайте новые решения в пару кликов.
        </p>
      </div>

      <Link
        href="/solutions"
        className="relative mt-4 inline-flex w-full items-center justify-center rounded-[18px] bg-[#2b3140] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#232834] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d7cff]"
      >
        Посмотреть решения
      </Link>
    </section>
  );
}
