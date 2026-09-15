import Link from "next/link";
import styles from "./Login.module.css";

/** The approved botanical composition, with live HTML above the decorative scene. */
export function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.scene} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Среда — главная">
          <svg viewBox="0 0 52 34" width="48" height="32" aria-hidden="true">
            <path fill="currentColor" d="M24 31C8 32 2 22 1 8c15-1 25 5 23 23ZM28 31C27 12 35 4 51 1c0 18-8 30-23 30Z" />
          </svg>
          <span>Среда</span>
        </Link>
      </header>
      <section className={styles.story} aria-label="Бизнесу проще">
        <h1>Ваш бизнес.<br />В своей среде.</h1>
        <p>Бизнесу проще</p>
      </section>
      <section className={styles.formPane} aria-label="Вход в аккаунт">
        <div className={styles.shell}>{children}</div>
      </section>
    </main>
  );
}
