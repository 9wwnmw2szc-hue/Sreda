import Link from "next/link";
import { LandingLogo } from "./LandingLogo";

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <LandingLogo />
        <nav className="landing-footer__nav" aria-label="Подвал">
          <a href="#features">Возможности</a>
          <a href="#pricing">Тарифы</a>
          <a href="#contacts">Контакты</a>
          <Link href="/login">Войти</Link>
          <Link href="/register">Регистрация</Link>
        </nav>
        <p className="landing-footer__legal">© {new Date().getFullYear()} БизнеСоты</p>
      </div>
    </footer>
  );
}
