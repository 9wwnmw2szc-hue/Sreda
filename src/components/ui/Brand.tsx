import Image from "next/image";
import Link from "next/link";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={`brand${compact ? " brand--compact" : ""}`}
      aria-label="Среда — главная"
    >
      <Image
        src="/assets/sreda/decor/logo-leaf.png"
        alt=""
        width={180}
        height={180}
        className="brand__leaf"
      />
      <span>
        <strong>Среда</strong>
        {!compact && <small>Бизнесу проще</small>}
      </span>
    </Link>
  );
}
