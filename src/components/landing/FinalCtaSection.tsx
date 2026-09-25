import Link from "next/link";
import { SUPPORT_LABEL, SUPPORT_TELEGRAM_URL } from "@/config/brand";

export function FinalCtaSection() {
  return (
    <section className="landing-final" aria-labelledby="landing-final-title">
      <div className="landing-final__inner">
        <h2 id="landing-final-title" className="landing-h2">
          Начните работать проще
        </h2>
        <p className="landing-muted">Один кабинет для продаж, задач и команды.</p>
        <Link href="/register" className="landing-btn landing-btn--primary landing-btn--hero">
          Начать бесплатно
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

export function ContactsSection() {
  return (
    <section
      className="landing-section landing-contacts"
      id="contacts"
      aria-labelledby="landing-contacts-title"
    >
      <div className="landing-section__inner">
        <p className="landing-eyebrow">Контакты</p>
        <h2 id="landing-contacts-title" className="landing-h2">
          Связаться с нами
        </h2>
        <span className="landing-gold-rule" aria-hidden="true" />
        <p className="landing-muted">
          {SUPPORT_LABEL}:{" "}
          <a className="landing-text-link" href={SUPPORT_TELEGRAM_URL} rel="noopener noreferrer">
            Telegram
          </a>
        </p>
      </div>
    </section>
  );
}
