export function WorkspaceGlassHints() {
  return (
    <div
      className="solution-scene__glass pointer-events-none absolute inset-0 hidden lg:block"
      aria-hidden
    >
      <aside className="solution-hint-card absolute top-[18%] left-0 xl:left-2">
        <p className="text-[10px] font-medium tracking-[0.12em] text-white/55 uppercase">
          Подключено
        </p>
        <p className="mt-1.5 text-[12px] leading-snug font-medium">
          Telegram и VK
        </p>
        <p className="mt-1 text-[11px] text-white/60">Работают вместе</p>
      </aside>

      <aside className="solution-hint-card absolute top-[20%] right-0 xl:right-2">
        <p className="text-[12px] leading-snug font-medium">
          Одно решение
          <br />
          от 250 ₽/мес.
        </p>
        <p className="mt-1.5 text-[11px] text-white/60">
          Подключается за 5 минут
        </p>
      </aside>
    </div>
  );
}
