export function AboutSection() {
  return (
    <section className="landing-section landing-about" id="about" aria-labelledby="landing-about-title">
      <div className="landing-section__inner landing-about__grid">
        <div>
          <p className="landing-eyebrow">О нас</p>
          <h2 id="landing-about-title" className="landing-h2">
            О БизнеСотах
          </h2>
          <span className="landing-gold-rule" aria-hidden="true" />
          <p className="landing-lead">
            БизнеСоты объединяют повседневные инструменты малого бизнеса в одном
            понятном пространстве.
          </p>
          <p className="landing-muted">
            Заявки, заказы, запись, сообщения и автопостинг — без разрозненных
            сервисов и лишней сложности.
          </p>
        </div>
        <div className="landing-about__visual" aria-hidden="true">
          <div className="landing-hex-cluster">
            <span className="landing-hex landing-hex--lg" />
            <span className="landing-hex landing-hex--md landing-hex--gold" />
            <span className="landing-hex landing-hex--sm" />
          </div>
        </div>
      </div>
    </section>
  );
}
