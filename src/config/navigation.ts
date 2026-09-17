import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarDays,
  MessageCircle,
  Bell,
  CreditCard,
  FileText,
  Home,
  Inbox,
  Link2,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Главная", icon: Home },
  { href: "/solutions", label: "Мои решения", icon: Sparkles },
  { href: "/leads", label: "Заявки", icon: Inbox },
  { href: "/orders", label: "Приём заказов", icon: ShoppingBag },
  { href: "/posts", label: "Посты", icon: FileText },
  { href: "/clients", label: "Клиенты", icon: Users },
  { href: "/connections", label: "Подключения", icon: Link2 },
  { href: "/billing", label: "Тариф и оплата", icon: CreditCard },
  { href: "/bookings", label: "Онлайн-запись", icon: CalendarDays },
  { href: "/calendar", label: "Календарь", icon: Calendar },
  { href: "/messages", label: "Сообщения", icon: MessageCircle },
  { href: "/notifications", label: "Уведомления", icon: Bell },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export const APP_NAME = "Среда";
export const APP_TAGLINE = "Бизнесу проще";
export const SUPPORT_TELEGRAM_URL = "https://t.me/sreda_support";
