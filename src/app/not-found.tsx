import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div>
        <h1 style={{ fontSize: "1.5rem", marginBottom: 8 }}>Страница не найдена</h1>
        <p style={{ marginBottom: 16, opacity: 0.8 }}>
          Проверьте адрес или вернитесь на главную.
        </p>
        <Link href="/dashboard">На главную</Link>
      </div>
    </main>
  );
}
