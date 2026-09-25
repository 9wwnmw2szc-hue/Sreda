import Image from "next/image";
import Link from "next/link";
import { LANDING_ASSETS, LANDING_COPY } from "./landing-config";

export function HeroSection() {
  return (
    <section className="landing-hero" aria-labelledby="landing-hero-title">
      <div className="landing-hero__copy">
        <h1 id="landing-hero-title" className="landing-hero__title">
          <span className="landing-hero__title-line">{LANDING_COPY.heroTitleLine1}</span>
          <span className="landing-hero__title-line">
            <span className="landing-hero__gold">{LANDING_COPY.heroTitleLine2Before}</span>
            {LANDING_COPY.heroTitleLine2After}
          </span>
        </h1>
        <p className="landing-hero__subtitle">
          {LANDING_COPY.heroSubtitleLines[0]}
          <br />
          {LANDING_COPY.heroSubtitleLines[1]}
        </p>
        <div className="landing-hero__cta">
          <Link href="/register" className="landing-btn landing-btn--primary landing-btn--hero">
            {LANDING_COPY.tryCta}
            <span aria-hidden="true">→</span>
          </Link>
          <a href="#features" className="landing-btn landing-btn--secondary landing-btn--hero">
            <span className="landing-btn__play" aria-hidden="true">
              ▶
            </span>
            {LANDING_COPY.demoCta}
          </a>
        </div>
      </div>
      <div className="landing-hero__visual" aria-hidden="true">
        <Image
          src={LANDING_ASSETS.heroDesktop}
          alt=""
          width={1152}
          height={864}
          className="landing-hero__img landing-hero__img--desktop"
          priority
          sizes="(max-width: 768px) 0px, min(58vw, 720px)"
        />
        <Image
          src={LANDING_ASSETS.heroMobile}
          alt=""
          width={1152}
          height={864}
          className="landing-hero__img landing-hero__img--mobile"
          priority
          sizes="(min-width: 769px) 0px, 100vw"
        />
      </div>
    </section>
  );
}
