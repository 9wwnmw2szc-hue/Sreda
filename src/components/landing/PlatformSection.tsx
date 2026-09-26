import Image from "next/image";
import { LANDING_ASSETS } from "./landing-config";

export function PlatformSection() {
  return (
    <section className="landing-platform" aria-labelledby="landing-platform-title">
      <div className="landing-platform__copy">
        <p className="landing-eyebrow">Одна платформа</p>
        <h2 id="landing-platform-title" className="landing-platform__title">
          Развивайте
          <br />
          бизнес проще
        </h2>
        <span className="landing-gold-rule" aria-hidden="true" />
      </div>
      <div className="landing-platform__visual" aria-hidden="true">
        <Image
          src={LANDING_ASSETS.platform}
          alt=""
          width={920}
          height={558}
          className="landing-platform__img"
          sizes="(max-width: 768px) 100vw, min(58vw, 920px)"
        />      </div>
    </section>
  );
}
