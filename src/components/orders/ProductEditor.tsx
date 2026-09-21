"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AttachmentPicker,
  type FileItem,
} from "@/components/attachments/AttachmentPicker";
import { apiRequest } from "@/lib/apiClient";

export type ProductCategoryOption = {
  id: string;
  name: string;
  active: boolean;
};

type EditorOption = { id: string; name: string };
type EditorGroup = { id: string; name: string; options: EditorOption[] };
type EditorVariant = {
  id?: string;
  option_ids: string[];
  label: string;
  price: string;
  stock_quantity: string;
  active: boolean;
};

type ProductDetail = {
  id: string;
  name: string;
  description: string;
  price: string;
  compare_at_price: string | null;
  currency: string;
  sku: string | null;
  active: boolean;
  category_id: string | null;
  use_variants: boolean;
  variant_prices_enabled: boolean;
  track_inventory: boolean;
  availability: string;
  stock_quantity: number | null;
  images: Array<{ attachment_id: string }>;
  variants: Array<{
    id: string;
    option_ids: unknown;
    label: string;
    price: string | null;
    stock_quantity: number | null;
    availability: string;
    active: boolean;
  }>;
  option_groups: Array<{ id: string; name: string; position: number }>;
  options: Array<{
    id: string;
    group_id: string;
    name: string;
    position: number;
  }>;
};

const ATTR_TEMPLATES: Array<{ name: string; options: string[] }> = [
  { name: "Размер", options: ["XS", "S", "M", "L", "XL"] },
  { name: "Цвет", options: ["Чёрный", "Белый", "Бежевый"] },
  { name: "Объём", options: ["250 мл", "500 мл", "1 л"] },
];

function newId() {
  return crypto.randomUUID();
}

function parseOptionIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function comboKey(optionIds: string[]) {
  return [...optionIds].sort().join("\0");
}

function cartesianOptions(groups: EditorGroup[]): EditorOption[][] {
  const lists = groups
    .map((g) => g.options.filter((o) => o.name.trim()))
    .filter((opts) => opts.length > 0);
  if (!lists.length) return [];
  return lists.reduce<EditorOption[][]>(
    (acc, opts) => acc.flatMap((prefix) => opts.map((o) => [...prefix, o])),
    [[]],
  );
}

function buildVariantsFromGroups(
  groups: EditorGroup[],
  previous: EditorVariant[],
): EditorVariant[] {
  const combos = cartesianOptions(groups);
  const prevByKey = new Map(previous.map((v) => [comboKey(v.option_ids), v]));
  return combos.map((opts) => {
    const option_ids = opts.map((o) => o.id);
    const key = comboKey(option_ids);
    const prev = prevByKey.get(key);
    return {
      id: prev?.id,
      option_ids,
      label: opts.map((o) => o.name.trim()).join(" / "),
      price: prev?.price ?? "",
      stock_quantity: prev?.stock_quantity ?? "",
      active: prev?.active ?? true,
    };
  });
}

export function ProductEditor({
  businessId,
  categories,
  productId,
  onCancel,
  onSaved,
  onError,
  onNotice,
}: {
  businessId: string;
  categories: ProductCategoryOption[];
  productId: string | null;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const productsBase = `/api/v1/businesses/${businessId}/products`;
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(!!productId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [active, setActive] = useState(true);
  const [trackInventory, setTrackInventory] = useState(false);
  const [stockQuantity, setStockQuantity] = useState("");
  const [useVariants, setUseVariants] = useState(false);
  const [variantPricesEnabled, setVariantPricesEnabled] = useState(false);
  const [groups, setGroups] = useState<EditorGroup[]>([]);
  const [variants, setVariants] = useState<EditorVariant[]>([]);
  const [images, setImages] = useState<FileItem[]>([]);
  const [uploadNote, setUploadNote] = useState("");

  useEffect(() => {
    if (!productId) {
      setLoadingDetail(false);
      return;
    }
    let alive = true;
    setLoadingDetail(true);
    void apiRequest<ProductDetail>(productsBase + "/" + productId)
      .then((detail) => {
        if (!alive) return;
        setName(detail.name);
        setDescription(detail.description ?? "");
        setSku(detail.sku ?? "");
        setPrice(String(detail.price ?? ""));
        setCompareAtPrice(
          detail.compare_at_price != null ? String(detail.compare_at_price) : "",
        );
        setCategoryId(detail.category_id ?? "");
        setActive(detail.active !== false);
        setTrackInventory(detail.track_inventory === true);
        setStockQuantity(
          detail.stock_quantity != null ? String(detail.stock_quantity) : "",
        );
        setUseVariants(detail.use_variants === true);
        setVariantPricesEnabled(detail.variant_prices_enabled === true);
        const loadedGroups: EditorGroup[] = [...detail.option_groups]
          .sort((a, b) => a.position - b.position)
          .map((g) => ({
            id: g.id,
            name: g.name,
            options: detail.options
              .filter((o) => o.group_id === g.id)
              .sort((a, b) => a.position - b.position)
              .map((o) => ({ id: o.id, name: o.name })),
          }));
        setGroups(loadedGroups);
        setVariants(
          detail.variants.map((v) => ({
            id: v.id,
            option_ids: parseOptionIds(v.option_ids),
            label: v.label || "",
            price: v.price != null ? String(v.price) : "",
            stock_quantity:
              v.stock_quantity != null ? String(v.stock_quantity) : "",
            active: v.active !== false,
          })),
        );
        setImages(
          (detail.images ?? []).map((img, i) => ({
            id: img.attachment_id,
            filename: `Фото ${i + 1}`,
            type: "image",
          })),
        );
        onError("");
      })
      .catch((e) => {
        if (alive)
          onError(
            e instanceof Error ? e.message : "Не удалось загрузить товар.",
          );
      })
      .finally(() => {
        if (alive) setLoadingDetail(false);
      });
    return () => {
      alive = false;
    };
  }, [productId, productsBase, onError]);

  function syncVariants(nextGroups: EditorGroup[]) {
    setVariants((prev) => buildVariantsFromGroups(nextGroups, prev));
  }

  function addGroup(template?: { name: string; options: string[] }) {
    const next: EditorGroup = {
      id: newId(),
      name: template?.name ?? "",
      options: (template?.options ?? [""]).map((opt) => ({
        id: newId(),
        name: opt,
      })),
    };
    const nextGroups = [...groups, next];
    setGroups(nextGroups);
    syncVariants(nextGroups);
  }

  function updateGroup(groupId: string, patch: Partial<EditorGroup>) {
    const nextGroups = groups.map((g) =>
      g.id === groupId ? { ...g, ...patch } : g,
    );
    setGroups(nextGroups);
    if (patch.options || patch.name !== undefined) syncVariants(nextGroups);
  }

  function removeGroup(groupId: string) {
    const nextGroups = groups.filter((g) => g.id !== groupId);
    setGroups(nextGroups);
    syncVariants(nextGroups);
  }

  function addOption(groupId: string) {
    const nextGroups = groups.map((g) =>
      g.id === groupId
        ? { ...g, options: [...g.options, { id: newId(), name: "" }] }
        : g,
    );
    setGroups(nextGroups);
    syncVariants(nextGroups);
  }

  function updateOption(groupId: string, optionId: string, name: string) {
    const nextGroups = groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            options: g.options.map((o) =>
              o.id === optionId ? { ...o, name } : o,
            ),
          }
        : g,
    );
    setGroups(nextGroups);
    syncVariants(nextGroups);
  }

  function removeOption(groupId: string, optionId: string) {
    const nextGroups = groups.map((g) =>
      g.id === groupId
        ? { ...g, options: g.options.filter((o) => o.id !== optionId) }
        : g,
    );
    setGroups(nextGroups);
    syncVariants(nextGroups);
  }

  function updateVariant(index: number, patch: Partial<EditorVariant>) {
    setVariants((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || loadingDetail) return;
    if (!name.trim() || !price.trim()) {
      onError("Укажите название и базовую цену.");
      return;
    }
    if (useVariants) {
      const validGroups = groups
        .map((g) => ({
          ...g,
          name: g.name.trim(),
          options: g.options
            .map((o) => ({ ...o, name: o.name.trim() }))
            .filter((o) => o.name),
        }))
        .filter((g) => g.name && g.options.length);
      if (!validGroups.length || !variants.length) {
        onError("Добавьте хотя бы одну группу атрибутов со значениями.");
        return;
      }
    }
    setBusy(true);
    onError("");
    onNotice("");
    setUploadNote("");
    try {
      const imageIds = images
        .filter((f) => f.type === "image" || f.type.startsWith("image"))
        .map((f) => f.id);
      const payload: Record<string, unknown> = {
        name: name.trim(),
        price: price.trim(),
        description: description.trim(),
        category_id: categoryId || null,
        sku: sku.trim() || null,
        compare_at_price: compareAtPrice.trim() || null,
        active,
        use_variants: useVariants,
        variant_prices_enabled: useVariants ? variantPricesEnabled : false,
        track_inventory: trackInventory,
        images: imageIds,
      };
      if (trackInventory && !useVariants) {
        payload.availability = "quantity";
        payload.stock_quantity = Number(stockQuantity || 0);
      } else if (!trackInventory) {
        payload.availability = "in_stock";
        payload.stock_quantity = null;
      }
      if (useVariants) {
        payload.option_groups = groups
          .map((g) => ({
            id: g.id,
            name: g.name.trim(),
            options: g.options
              .map((o) => ({ id: o.id, name: o.name.trim() }))
              .filter((o) => o.name),
          }))
          .filter((g) => g.name && g.options.length);
        payload.variants = variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          option_ids: v.option_ids,
          label: v.label,
          price: variantPricesEnabled
            ? v.price.trim()
              ? v.price.trim()
              : null
            : null,
          availability: trackInventory ? "quantity" : "in_stock",
          stock_quantity: trackInventory ? Number(v.stock_quantity || 0) : null,
          active: v.active,
        }));
      } else {
        payload.option_groups = [];
        payload.variants = [];
      }
      if (productId) {
        await apiRequest(productsBase + "/" + productId, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        onNotice("Товар обновлён.");
      } else {
        await apiRequest(productsBase, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onNotice("Товар создан.");
      }
      await onSaved();
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : productId
            ? "Не удалось обновить товар."
            : "Не удалось создать товар.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadingDetail) {
    return <p role="status">Загрузка товара…</p>;
  }

  return (
    <form
      id={productId ? "edit-product" : "new-product"}
      onSubmit={(e) => void submit(e)}
    >
      <h2>{productId ? "Редактирование товара" : "Новый товар"}</h2>
      <fieldset disabled={busy}>
        <legend>Основное</legend>
        <label>
          Название
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Описание
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Артикул (SKU)
          <input value={sku} onChange={(e) => setSku(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />{" "}
          Активен в каталоге
        </label>
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Цена</legend>
        <label>
          Базовая цена
          <input
            required
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label>
          Старая цена / скидка
          <input
            inputMode="decimal"
            value={compareAtPrice}
            onChange={(e) => setCompareAtPrice(e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Фото</legend>
        <AttachmentPicker
          businessId={businessId}
          files={images}
          mediaOnly
          disabled={busy}
          onChange={(files) => {
            const onlyImages = files.filter(
              (f) => f.type === "image" || f.type.startsWith("image"),
            );
            setImages(onlyImages);
            if (files.length > onlyImages.length) {
              setUploadNote("Для товара принимаются только изображения.");
            }
          }}
        />
        <p className="account-footnote">
          Загрузка требует право messages.write (у владельца обычно есть). Если
          файл не загрузился — проверьте права доступа.
        </p>
        {uploadNote ? (
          <p role="status" className="account-footnote">
            {uploadNote}
          </p>
        ) : null}
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Категория</legend>
        <label>
          Категория
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
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
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Остаток</legend>
        <label>
          <input
            type="checkbox"
            checked={trackInventory}
            onChange={(e) => setTrackInventory(e.target.checked)}
          />{" "}
          Учитывать остаток
        </label>
        {trackInventory && !useVariants ? (
          <label>
            Количество
            <input
              inputMode="numeric"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
            />
          </label>
        ) : null}
      </fieldset>

      <fieldset disabled={busy}>
        <legend>Варианты</legend>
        <label>
          <input
            type="checkbox"
            checked={useVariants}
            onChange={(e) => {
              const on = e.target.checked;
              setUseVariants(on);
              if (!on) {
                setVariantPricesEnabled(false);
              } else if (!groups.length) {
                /* keep empty until user adds attributes */
              }
            }}
          />{" "}
          Есть варианты (атрибуты)
        </label>
        {useVariants ? (
          <>
            <label>
              <input
                type="checkbox"
                checked={variantPricesEnabled}
                onChange={(e) => setVariantPricesEnabled(e.target.checked)}
              />{" "}
              Разные цены для вариантов
            </label>
            <p className="account-footnote">
              {variantPricesEnabled
                ? "Можно задать свою цену для каждой комбинации (пустое = базовая)."
                : "Варианты наследуют базовую цену."}
            </p>

            <div className="product-editor__templates">
              <span>Шаблоны:</span>
              {ATTR_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className="button button--outline button--sm"
                  onClick={() => addGroup(t)}
                >
                  {t.name}
                </button>
              ))}
              <button
                type="button"
                className="button button--ghost button--sm"
                onClick={() => addGroup()}
              >
                + Своя группа
              </button>
            </div>

            {groups.map((g) => (
              <div key={g.id} className="product-editor__group">
                <label>
                  Группа атрибутов
                  <input
                    placeholder="Например: Размер"
                    value={g.name}
                    onChange={(e) =>
                      updateGroup(g.id, { name: e.target.value })
                    }
                  />
                </label>
                <div className="product-editor__options">
                  {g.options.map((o) => (
                    <div key={o.id} className="product-editor__option-row">
                      <input
                        placeholder="Значение"
                        value={o.name}
                        onChange={(e) =>
                          updateOption(g.id, o.id, e.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="button button--ghost button--sm"
                        onClick={() => removeOption(g.id, o.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="button button--outline button--sm"
                    onClick={() => addOption(g.id)}
                  >
                    + Значение
                  </button>
                </div>
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  onClick={() => removeGroup(g.id)}
                >
                  Удалить группу
                </button>
              </div>
            ))}

            {variants.length ? (
              <div className="product-editor__variants">
                <h3>Комбинации ({variants.length})</h3>
                <ul className="crm-list">
                  {variants.map((v, index) => (
                    <li key={comboKey(v.option_ids) || String(index)}>
                      <strong>{v.label || "Вариант"}</strong>
                      {variantPricesEnabled ? (
                        <label>
                          Цена
                          <input
                            inputMode="decimal"
                            placeholder={price || "Базовая"}
                            value={v.price}
                            onChange={(e) =>
                              updateVariant(index, { price: e.target.value })
                            }
                          />
                        </label>
                      ) : (
                        <span className="account-footnote">
                          Цена: базовая
                        </span>
                      )}
                      {trackInventory ? (
                        <label>
                          Остаток
                          <input
                            inputMode="numeric"
                            value={v.stock_quantity}
                            onChange={(e) =>
                              updateVariant(index, {
                                stock_quantity: e.target.value,
                              })
                            }
                          />
                        </label>
                      ) : null}
                      <label>
                        <input
                          type="checkbox"
                          checked={v.active}
                          onChange={(e) =>
                            updateVariant(index, { active: e.target.checked })
                          }
                        />{" "}
                        Активен
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="account-footnote">
                Добавьте группы и значения — комбинации появятся автоматически.
              </p>
            )}
          </>
        ) : null}
      </fieldset>

      <div className="catalog-create__actions">
        <button className="button button--primary" type="submit">
          {productId ? "Сохранить" : "Создать товар"}
        </button>
        <button
          className="button button--ghost"
          type="button"
          onClick={onCancel}
        >
          Закрыть
        </button>
      </div>
    </form>
  );
}
