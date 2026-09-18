import Image from "next/image";
import Link from "next/link";
import {
  APP_NAME,
  APP_TAGLINE,
  APP_TAGLINE_LONG,
  BRAND_ASSETS,
} from "@/config/brand";
import styles from "./Login.module.css";

export function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.scene} aria-hidden="true" />
      <header className={styles.header}>
        <Link
          href="/"
          className={styles.brand}
          aria-label={`${APP_NAME} — главная`}
        >
          <Image
            src={BRAND_ASSETS.mark}
            alt=""
            width={40}
            height={40}
            priority
          />
          <span>{APP_NAME}</span>
        </Link>
      </header>
      <section className={styles.story} aria-label={APP_TAGLINE}>
        <h1>
          Ваш бизнес.
          <br />В гармонии.
        </h1>
        <p>{APP_TAGLINE_LONG}</p>
      </section>
      <section className={styles.formPane} aria-label="Вход в аккаунт">
        <div className={styles.shell}>{children}</div>
      </section>
    </main>
  );
}
