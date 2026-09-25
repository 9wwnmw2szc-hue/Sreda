import Image from "next/image";
import Link from "next/link";
import { LANDING_ASSETS } from "./landing-config";

export function LandingLogo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`landing-logo ${className}`.trim()} aria-label="БизнеСоты — на главную">
      <Image
        src={LANDING_ASSETS.mark}
        alt=""
        width={46}
        height={46}
        className="landing-logo__mark"
        priority
      />
      <span className="landing-logo__word" aria-hidden="false">
        <span className="landing-logo__bizne">Бизне</span>
        <span className="landing-logo__soty">Соты</span>
      </span>
    </Link>
  );
}
