"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { apiRequest } from "@/lib/apiClient";
import { DetailDialog } from "@/components/dashboard/DetailDialog";
import {
  EmptyStateCta,
  SolutionSetupBanner,
} from "@/components/solutions/SolutionSetupBanner";

type OrderRow = {
  id: string;
  status: string;
  fulfillment: string;
  customer_name: string;
  customer_phone: string;
  total: string;
  currency: string;
  client_id: string;
  client_name?: string;
  conversation_id: string | null;
  created_at: string;
};

type OrderItem = {
  id: string;
  name: string;
  variant_label: string;
  quantity: number;
  unit_price: string;
  line_total: string;
};

type StatusHistory = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string;
  created_at: string;
};

type OrderDetail = OrderRow & {
  delivery_address?: string;
  comment?: string;
  items: OrderItem[];
  history: StatusHistory[];
};

type Category = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  position: number;
};

type Product = {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  active: boolean;
  category_id: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: "Новый",
  accepted: "Принят",
  assembling: "Сборка",
  ready: "Готов",
  handed_over: "Выдан",
  delivered: "Доставлен",
  completed: "Завершён",
  cancelled: "Отменён",
};

const STATUS_FLOW: Record<string, string[]> = {
  new: ["accepted", "cancelled"],
  accepted: ["assembling", "cancelled"],
  assembling: ["ready", "cancelled"],
  ready: ["handed_over", "delivered", "cancelled"],
  handed_over: ["completed"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

export function OrdersView() {
  const { currentBusiness } = useBusinessContext();
  return currentBusiness ? (
    <Orders
      key={currentBusiness.id}
      businessId={currentBusiness.id}
      timezone={currentBusiness.timezone ?? "UTC"}
    />
  ) : (
    <p>Выберите бизнес.</p>
  );
}

function Orders({
  businessId,
  timezone,
}: {
  businessId: string;
  timezone: string;
}) {
  const search = useSearchParams();
  const initialTab =
    search.get("tab") === "catalog" ? "catalog" : "orders";
  const [tab, setTab] = useState<"orders" | "catalog">(initialTab);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (search.get("tab") === "catalog") setTab("catalog");
  }, [search]);

  return (
    <div className="crm-page">
      <header>
        <h1>Приём заказов</h1>
        <p>Каталог, товары и обработка заказов из бота.</p>
      </header>
      <SolutionSetupBanner code="orders" />
      <section className="panel crm-panel">
        <nav aria-label="Разделы заказов">
          <button
            type="button"
            className={
              tab === "orders" ? "button button--primary" : "button button--outline"
            }
            aria-pressed={tab === "orders"}
            onClick={() => {
              setTab("orders");
              setError("");
              setNotice("");
            }}
          >
            Заказы
          </button>
          <button
            type="button"
            className={
              tab === "catalog"
                ? "button button--primary"
                : "button button--outline"
            }
            aria-pressed={tab === "catalog"}
            onClick={() => {
              setTab("catalog");
              setError("");
              setNotice("");
            }}
          >
            Каталог
          </button>
        </nav>
      </section>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="account-notice">
          {notice}
        </p>
      )}
      {tab === "orders" ? (
        <OrdersPanel
          businessId={businessId}
          timezone={timezone}
          onError={setError}
          onNotice={setNotice}
        />
      ) : (
        <CatalogPanel
          businessId={businessId}
          onError={setError}
          onNotice={setNotice}
        />
      )}
    </div>
  );
}

function OrdersPanel({
  businessId,
  timezone,
  onError,
  onNotice,
}: {
  businessId: string;
  timezone: string;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/v1/businesses/${businessId}/orders`;

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void apiRequest<OrderRow[]>(
        base + (status ? "?status=" + encodeURIComponent(status) : ""),
      )
        .then((rows) => {
          if (alive) {
            setOrders(rows);
            onError("");
          }
        })
        .catch((e) => {
          if (alive)
            onError(e instanceof Error ? e.message : "Ошибка загрузки.");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [base, status, onError]);

  useEffect(() => {
    let alive = true;
    if (!selected) {
      const timer = setTimeout(() => {
        if (alive) setDetail(null);
      }, 0);
      return () => {
        alive = false;
        clearTimeout(timer);
      };
    }
    void apiRequest<OrderDetail>(base + "/" + selected)
      .then((row) => {
        if (alive) setDetail(row);
      })
      .catch((e) => {
        if (alive) {
          onError(e instanceof Error ? e.message : "Не удалось открыть заказ.");
          setSelected(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [base, selected, onError]);

  async function transition(next: string) {
    if (!selected || busy) return;
    setBusy(true);
    onError("");
    onNotice("");
    try {
      await apiRequest(base + "/" + selected, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      const updated = await apiRequest<OrderDetail>(base + "/" + selected);
      setDetail(updated);
      setOrders((rows) =>
        rows.map((row) =>
          row.id === selected ? { ...row, status: updated.status } : row,
        ),
      );
      onNotice("Статус заказа обновлён.");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Не удалось сменить статус.");
    } finally {
      setBusy(false);
    }
  }

  const nextStatuses = detail ? (STATUS_FLOW[detail.status] ?? []) : [];

  return (
    <>
      <section className="panel crm-panel">
        <label>
          Статус
          <select
            value={status}
            disabled={busy}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Все</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {loading ? (
          <p role="status">Загрузка…</p>
        ) : !orders.length ? (
          <EmptyStateCta
            title="Заказов пока нет"
            description="Когда клиенты оформят заказ в боте, он появится здесь. Сначала добавьте товары в каталог."
            href="/orders?tab=catalog"
            action="Открыть каталог"
          />
        ) : (
          <ul className="crm-list">
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={selected === o.id}
                  onClick={() => {
                    setSelected(o.id);
                    onError("");
                    onNotice("");
                  }}
                >
                  <strong>
                    {o.customer_name} · {STATUS_LABEL[o.status] ?? o.status}
                  </strong>
                  <span>
                    {o.total} {o.currency} ·{" "}
                    {o.fulfillment === "delivery" ? "Доставка" : "Самовывоз"}
                  </span>
                  <small>
                    {new Date(o.created_at).toLocaleString("ru", {
                      timeZone: timezone,
                    })}
                  </small>
                  <span>
                    <Link href="/clients" onClick={(e) => e.stopPropagation()}>
                      Клиент
                    </Link>
                    {o.conversation_id ? (
                      <>
                        {" · "}
                        <Link
                          href="/messages"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Диалог
                        </Link>
                      </>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {detail && (
        <DetailDialog
          title={"Заказ · " + (STATUS_LABEL[detail.status] ?? detail.status)}
          onClose={() => setSelected(null)}
        >
          <div className="detail-facts">
            <span>Клиент</span>
            <strong>{detail.customer_name}</strong>
          </div>
          <div className="detail-facts">
            <span>Телефон</span>
            <strong>{detail.customer_phone}</strong>
          </div>
          <div className="detail-facts">
            <span>Сумма</span>
            <strong>
              {detail.total} {detail.currency}
            </strong>
          </div>
          <div className="detail-facts">
            <span>Получение</span>
            <strong>
              {detail.fulfillment === "delivery" ? "Доставка" : "Самовывоз"}
            </strong>
          </div>
          {detail.delivery_address ? (
            <div className="detail-facts">
              <span>Адрес</span>
              <strong>{detail.delivery_address}</strong>
            </div>
          ) : null}
          {detail.comment ? (
            <p className="message-preview">{detail.comment}</p>
          ) : null}
          <nav aria-label="Связь с клиентом">
            <Link className="button button--outline" href="/clients">
              Клиент
            </Link>
            {detail.conversation_id ? (
              <Link className="button button--outline" href="/messages">
                Диалог
              </Link>
            ) : null}
            <Link className="button button--primary" href="/messages">
              Связаться
            </Link>
          </nav>
          {detail.items?.length ? (
            <>
              <h3>Позиции</h3>
              <ul className="crm-list">
                {detail.items.map((item) => (
                  <li key={item.id}>
                    <strong>
                      {item.name}
                      {item.variant_label ? " · " + item.variant_label : ""}
                    </strong>
                    <span>
                      {item.quantity} × {item.unit_price} = {item.line_total}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {nextStatuses.length ? (
            <fieldset disabled={busy}>
              <legend>Сменить статус</legend>
              <nav aria-label="Переходы статуса">
                {nextStatuses.map((next) => (
                  <button
                    key={next}
                    type="button"
                    className={
                      next === "cancelled"
                        ? "button button--outline"
                        : "button button--primary"
                    }
                    onClick={() => void transition(next)}
                  >
                    {STATUS_LABEL[next] ?? next}
                  </button>
                ))}
              </nav>
            </fieldset>
          ) : (
            <p className="account-footnote">Дальнейших переходов нет.</p>
          )}
          {detail.history?.length ? (
            <>
              <h3>История статусов</h3>
              <ul className="crm-list">
                {detail.history.map((row) => (
                  <li key={row.id}>
                    <strong>
                      {(row.from_status
                        ? (STATUS_LABEL[row.from_status] ?? row.from_status) +
                          " → "
                        : "") + (STATUS_LABEL[row.to_status] ?? row.to_status)}
                    </strong>
                    <small>
                      {new Date(row.created_at).toLocaleString("ru", {
                        timeZone: timezone,
                      })}
                    </small>
                    {row.note ? <span>{row.note}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </DetailDialog>
      )}
    </>
  );
}

function CatalogPanel({
  businessId,
  onError,
  onNotice,
}: {
  businessId: string;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [form, setForm] = useState({
    name: "",
    price: "",
    compare_at_price: "",
    description: "",
    category_id: "",
    sku: "",
    stock_quantity: "",
    track_inventory: false,
    use_variants: false,
    variant_label: "",
    variant_price: "",
    variant_stock: "",
    active: true,
  });
  const categoriesBase = `/api/v1/businesses/${businessId}/categories`;
  const productsBase = `/api/v1/businesses/${businessId}/products`;

  async function reload() {
    const [cats, rows] = await Promise.all([
      apiRequest<Category[]>(categoriesBase),
      apiRequest<Product[]>(productsBase),
    ]);
    setCategories(cats);
    setProducts(rows);
  }

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void Promise.all([
        apiRequest<Category[]>(categoriesBase),
        apiRequest<Product[]>(productsBase),
      ])
        .then(([cats, rows]) => {
          if (!alive) return;
          setCategories(cats);
          setProducts(rows);
          onError("");
        })
        .catch((e) => {
          if (alive)
            onError(
              e instanceof Error ? e.message : "Ошибка загрузки каталога.",
            );
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [categoriesBase, productsBase, onError]);

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    if (busy || !categoryName.trim()) return;
    setBusy(true);
    onError("");
    onNotice("");
    try {
      await apiRequest(categoriesBase, {
        method: "POST",
        body: JSON.stringify({ name: categoryName.trim(), active: true }),
      });
      setCategoryName("");
      await reload();
      onNotice("Категория создана.");
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Не удалось создать категорию.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createProduct(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    onError("");
    onNotice("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        price: form.price,
        description: form.description,
        category_id: form.category_id || null,
        sku: form.sku || null,
        compare_at_price: form.compare_at_price || null,
        active: form.active,
        use_variants: form.use_variants,
        track_inventory: form.track_inventory,
      };
      if (form.track_inventory && form.stock_quantity !== "") {
        payload.availability = "quantity";
        payload.stock_quantity = Number(form.stock_quantity);
      }
      if (form.use_variants && form.variant_label.trim()) {
        payload.variants = [
          {
            label: form.variant_label.trim(),
            price: form.variant_price || form.price,
            availability: form.track_inventory ? "quantity" : "in_stock",
            stock_quantity: form.track_inventory
              ? Number(form.variant_stock || 0)
              : null,
            active: true,
          },
        ];
      }
      await apiRequest(productsBase, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setForm({
        name: "",
        price: "",
        compare_at_price: "",
        description: "",
        category_id: "",
        sku: "",
        stock_quantity: "",
        track_inventory: false,
        use_variants: false,
        variant_label: "",
        variant_price: "",
        variant_stock: "",
        active: true,
      });
      await reload();
      onNotice("Товар создан.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось создать товар.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(product: Product) {
    if (busy) return;
    setBusy(true);
    onError("");
    onNotice("");
    try {
      await apiRequest(productsBase + "/" + product.id, {
        method: "PATCH",
        body: JSON.stringify({
          name: product.name,
          price: product.price,
          description: product.description,
          category_id: product.category_id,
          active: !product.active,
        }),
      });
      await reload();
      onNotice(product.active ? "Товар скрыт." : "Товар активирован.");
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Не удалось обновить товар.",
      );
    } finally {
      setBusy(false);
    }
  }

  const categoryNameOf = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Без категории";

  return (
    <div className="crm-columns">
      <section className="panel crm-panel">
        <h2>Категории</h2>
        {loading ? (
          <p role="status">Загрузка…</p>
        ) : !categories.length ? (
          <EmptyStateCta
            title="Категорий пока нет"
            description="Создайте первую категорию, чтобы упорядочить товары."
            href="#new-category"
            action="К форме категории"
          />
        ) : (
          <ul className="crm-list">
            {categories.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                <span>{c.active ? "Активна" : "Скрыта"}</span>
                {c.description ? <small>{c.description}</small> : null}
              </li>
            ))}
          </ul>
        )}
        <h2>Товары</h2>
        {loading ? (
          <p role="status">Загрузка…</p>
        ) : !products.length ? (
          <EmptyStateCta
            title="Товаров пока нет"
            description="Добавьте первый товар: название, цену, описание и при необходимости варианты."
            href="#new-product"
            action="К форме товара"
          />
        ) : (
          <ul className="crm-list">
            {products.map((p) => (
              <li key={p.id}>
                <strong>
                  {p.name} · {p.price} {p.currency || "RUB"}
                </strong>
                <span>{categoryNameOf(p.category_id)}</span>
                <span>{p.active ? "Активен" : "Скрыт"}</span>
                {p.description ? <small>{p.description}</small> : null}
                <button
                  type="button"
                  className="button button--outline"
                  disabled={busy}
                  onClick={() => void toggleActive(p)}
                >
                  {p.active ? "Скрыть" : "Активировать"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel crm-panel">
        <h2 id="new-category">Новая категория</h2>
        <form onSubmit={(e) => void createCategory(e)}>
          <fieldset disabled={busy}>
            <label>
              Название
              <input
                required
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
              />
            </label>
            <button className="button button--outline" type="submit">
              Создать категорию
            </button>
          </fieldset>
        </form>
        <h2 id="new-product">Новый товар</h2>
        <form onSubmit={(e) => void createProduct(e)}>
          <fieldset disabled={busy}>
            <label>
              Название
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Цена
              <input
                required
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </label>
            <label>
              Старая цена / скидка
              <input
                inputMode="decimal"
                value={form.compare_at_price}
                onChange={(e) =>
                  setForm({ ...form, compare_at_price: e.target.value })
                }
              />
            </label>
            <label>
              Артикул (SKU)
              <input
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </label>
            <label>
              Описание
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <label>
              Категория
              <select
                value={form.category_id}
                onChange={(e) =>
                  setForm({ ...form, category_id: e.target.value })
                }
              >
                <option value="">Без категории</option>
                {categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.track_inventory}
                onChange={(e) =>
                  setForm({ ...form, track_inventory: e.target.checked })
                }
              />{" "}
              Учитывать остаток
            </label>
            {form.track_inventory && !form.use_variants ? (
              <label>
                Количество
                <input
                  inputMode="numeric"
                  value={form.stock_quantity}
                  onChange={(e) =>
                    setForm({ ...form, stock_quantity: e.target.value })
                  }
                />
              </label>
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={form.use_variants}
                onChange={(e) =>
                  setForm({ ...form, use_variants: e.target.checked })
                }
              />{" "}
              Есть варианты (размер / цвет)
            </label>
            {form.use_variants ? (
              <>
                <label>
                  Вариант
                  <input
                    required={form.use_variants}
                    placeholder="Например: M / красный"
                    value={form.variant_label}
                    onChange={(e) =>
                      setForm({ ...form, variant_label: e.target.value })
                    }
                  />
                </label>
                <label>
                  Цена варианта
                  <input
                    inputMode="decimal"
                    value={form.variant_price}
                    onChange={(e) =>
                      setForm({ ...form, variant_price: e.target.value })
                    }
                  />
                </label>
                {form.track_inventory ? (
                  <label>
                    Остаток варианта
                    <input
                      inputMode="numeric"
                      value={form.variant_stock}
                      onChange={(e) =>
                        setForm({ ...form, variant_stock: e.target.value })
                      }
                    />
                  </label>
                ) : null}
              </>
            ) : null}
            <button className="button button--primary" type="submit">
              Создать товар
            </button>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
