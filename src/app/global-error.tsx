"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          background: "#0f1419",
          color: "#f5f7fa",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>Что-то пошло не так</h1>
          <p style={{ opacity: 0.8, marginBottom: 20 }}>
            Обновите страницу. Если ошибка повторяется — напишите в поддержку.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 16 }}>
              Код: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: 44,
              padding: "0 20px",
              borderRadius: 10,
              border: 0,
              background: "#f5c518",
              color: "#1a1f28",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
