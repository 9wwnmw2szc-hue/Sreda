"use client";

import type { ReactNode } from "react";

export type AdminColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Field shown in mobile card title; defaults to first column */
  mobilePrimary?: boolean;
};

export function AdminDataTable<T>({
  columns,
  rows,
  loading,
  empty = "Нет данных",
  error,
  getRowKey,
  pagination,
}: {
  columns: AdminColumn<T>[];
  rows: T[];
  loading?: boolean;
  empty?: string;
  error?: string | null;
  getRowKey: (row: T) => string;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
  };
}) {
  const primary =
    columns.find((c) => c.mobilePrimary) ?? columns[0] ?? null;
  const secondary = columns.filter((c) => c !== primary);
  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;

  if (error) {
    return (
      <div className="admin-state admin-state--error" role="alert">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-state" role="status" aria-live="polite">
        Загрузка…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="admin-state" role="status">
        {empty}
      </div>
    );
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="admin-card-list">
        {rows.map((row) => (
          <li key={getRowKey(row)} className="admin-card-list__item">
            {primary ? (
              <div className="admin-card-list__title">{primary.render(row)}</div>
            ) : null}
            <dl className="admin-card-list__meta">
              {secondary.map((col) => (
                <div key={col.key}>
                  <dt>{col.header}</dt>
                  <dd>{col.render(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {pagination && pagination.total > pagination.pageSize ? (
        <nav className="admin-pagination" aria-label="Страницы">
          <button
            type="button"
            className="button button--outline button--sm"
            disabled={pagination.page <= 1}
            onClick={() => pagination.onPage(pagination.page - 1)}
          >
            Назад
          </button>
          <span className="admin-pagination__info">
            {pagination.page} / {totalPages} · {pagination.total}
          </span>
          <button
            type="button"
            className="button button--outline button--sm"
            disabled={pagination.page >= totalPages}
            onClick={() => pagination.onPage(pagination.page + 1)}
          >
            Далее
          </button>
        </nav>
      ) : null}
    </div>
  );
}
