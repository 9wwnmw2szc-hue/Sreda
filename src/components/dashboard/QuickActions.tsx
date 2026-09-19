import Link from "next/link";
import {
  ShoppingBag,
  Inbox,
  CalendarDays,
  PencilLine,
  MessageCircle,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

type Action = {
  href: string;
  label: string;
  tone: "orders" | "leads" | "booking" | "autopost" | "messages";
  Icon: LucideIcon;
  desktopOnly?: boolean;
};

/** Labels match navigation (no create-flow query params exist yet). */
const ACTIONS: Action[] = [
  { href: "/orders", label: "Заказы", tone: "orders", Icon: ShoppingBag },
  { href: "/leads", label: "Заявки", tone: "leads", Icon: Inbox },
  { href: "/bookings", label: "Запись", tone: "booking", Icon: CalendarDays },
  { href: "/posts", label: "Посты", tone: "autopost", Icon: PencilLine },
  {
    href: "/messages",
    label: "Сообщения",
    tone: "messages",
    Icon: MessageCircle,
    desktopOnly: true,
  },
];

export function QuickActions() {
  return (
    <section className="soty-quick" aria-labelledby="soty-quick-title">
      <div className="soty-section-head">
        <h2 id="soty-quick-title">Быстрые действия</h2>
        <p>Переход к основным разделам</p>
      </div>
      <ul className="soty-quick__grid">
        {ACTIONS.map(({ href, label, tone, Icon, desktopOnly }) => (
          <li
            key={href}
            className={
              desktopOnly
                ? "soty-quick__item soty-quick__item--desktop"
                : "soty-quick__item"
            }
          >
            <Link
              href={href}
              className={`soty-quick__btn soty-quick__btn--${tone}`}
            >
              <span className="soty-quick__icon" aria-hidden>
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <span className="soty-quick__label">{label}</span>
              <ChevronRight
                size={16}
                className="soty-quick__chevron"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
