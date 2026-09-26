"use client";

import { useId, useState } from "react";

const FAQ = [
  {
    q: "Что такое БизнеСоты?",
    a: "Это пространство, где малый бизнес ведёт заявки, заказы, запись, сообщения и автопостинг в одном кабинете.",
  },
  {
    q: "Нужна ли карта для старта?",
    a: "Регистрация бесплатна. Подключайте только те решения, которые вам нужны.",
  },
  {
    q: "С какими площадками работает сервис?",
    a: "Сейчас — Telegram и ВКонтакте. Подключение идёт из кабинета после регистрации.",
  },
  {
    q: "Можно ли работать командой?",
    a: "Да. Владелец приглашает сотрудников и выдаёт роли в настройках бизнеса.",
  },
  {
    q: "Где получить поддержку?",
    a: "Напишите в Telegram поддержки из раздела «Контакты» на этой странице.",
  },
] as const;

export function FaqSection() {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="landing-section landing-faq" aria-labelledby="landing-faq-title">
      <div className="landing-section__inner landing-faq__inner">
        <p className="landing-eyebrow">FAQ</p>
        <h2 id="landing-faq-title" className="landing-h2">
          Частые вопросы
        </h2>
        <span className="landing-gold-rule" aria-hidden="true" />
        <div className="landing-faq__list">
          {FAQ.map((item, index) => {
            const panelId = `${baseId}-panel-${index}`;
            const buttonId = `${baseId}-btn-${index}`;
            const isOpen = open === index;
            return (
              <div key={item.q} className={`landing-faq__item${isOpen ? " is-open" : ""}`}>
                <button
                  type="button"
                  id={buttonId}
                  className="landing-faq__q"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : index)}
                >
                  <span>{item.q}</span>
                  <span className="landing-faq__chevron" aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="landing-faq__a"
                >
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
