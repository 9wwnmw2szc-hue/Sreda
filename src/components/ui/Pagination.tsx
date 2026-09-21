"use client";

export function Pagination({
  page,
  hasNext,
  busy,
  onPage,
}: {
  page: number;
  hasNext: boolean;
  busy?: boolean;
  onPage: (page: number) => void;
}) {
  if (page <= 0 && !hasNext) return null;
  const current = page + 1;
  return (
    <nav className="pagination" aria-label="Страницы">
      <button
        type="button"
        className="pagination__btn"
        disabled={page <= 0 || busy}
        onClick={() => onPage(page - 1)}
        aria-label="Предыдущая страница"
      >
        <span className="pagination__icon" aria-hidden>
          ←
        </span>
        <span className="pagination__label">Назад</span>
      </button>
      <span className="pagination__status">Страница {current}</span>
      <button
        type="button"
        className="pagination__btn"
        disabled={!hasNext || busy}
        onClick={() => onPage(page + 1)}
        aria-label="Следующая страница"
      >
        <span className="pagination__label">Вперёд</span>
        <span className="pagination__icon" aria-hidden>
          →
        </span>
      </button>
    </nav>
  );
}
