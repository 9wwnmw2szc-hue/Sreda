import type { Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { normalizeIdentity } from "../clients/service.ts";
import { CatalogService, OrderService } from "../orders/service.ts";

function moneyLabel(amount: string, currency: string) {
  return amount + " " + currency;
}

function lineUnit(productPrice: string, variantPrice: string | null) {
  return variantPrice != null && variantPrice !== ""
    ? variantPrice
    : productPrice;
}

export async function ordersFlow(
  tx: Transaction<Database>,
  input: {
    businessId: string;
    connectionId: string;
    platform: "telegram" | "vk";
    userId: string;
    username?: string;
    eventId: string;
    text: string;
  },
  queue: (text: string, buttons?: string[]) => Promise<void>,
  options: { contactShop: boolean } = { contactShop: false },
) {
  const { businessId, connectionId, platform, userId, eventId, text } = input;
  const table = platform === "telegram" ? "telegram_dialog" : "vk_dialog";
  const state = await tx
    .selectFrom(table)
    .selectAll()
    .where("connection_id", "=", connectionId)
    .where("chat_id", "=", userId)
    .executeTakeFirst();
  if (
    !["Каталог", "Корзина"].includes(text) &&
    !state?.mode.startsWith("orders:")
  )
    return false;

  const catalog = new CatalogService(tx);
  const orders = new OrderService(tx);
  let answers: Record<string, string> = state ? JSON.parse(state.answers) : {};

  const contact = options.contactShop
    ? (["Связаться с администратором"] as const)
    : [];
  const shopNav = ["Каталог", "Корзина", ...contact, "Отмена"] as string[];

  const save = async (
    mode: string,
    choices: { label: string; value: string }[] = [],
  ) => {
    const row = {
      connection_id: connectionId,
      chat_id: userId,
      mode: "orders:" + mode,
      fields: JSON.stringify(choices),
      answers: JSON.stringify(answers),
      position: 0,
      config: "{}",
      last_update_id: eventId,
      updated_at: new Date(),
    };
    await tx
      .insertInto(table)
      .values(row)
      .onConflict((oc) =>
        oc.columns(["connection_id", "chat_id"]).doUpdateSet(row),
      )
      .execute();
  };

  const menu = async (message: string) => {
    await tx
      .updateTable(table)
      .set({ mode: "menu", answers: "{}", last_update_id: eventId })
      .where("connection_id", "=", connectionId)
      .where("chat_id", "=", userId)
      .execute();
    await queue(message, ["Главное меню", "Каталог", "Корзина"]);
  };

  const showChoices = async (
    mode: string,
    title: string,
    choices: { label: string; value: string }[],
    page = 0,
    extra: string[] = [],
  ) => {
    answers.choicePage = String(page);
    await save(mode, choices);
    await queue(
      title,
      choices
        .slice(page * 7, page * 7 + 7)
        .map((c) => c.label)
        .concat(
          page > 0 ? ["← Назад по списку"] : [],
          (page + 1) * 7 < choices.length ? ["Далее →"] : [],
          extra,
        ),
    );
  };

  const findConversationId = async () => {
    const row = await tx
      .selectFrom("communication_conversation")
      .select("id")
      .where("business_id", "=", businessId)
      .where("platform", "=", platform)
      .where("external_user_id", "=", userId)
      .executeTakeFirst();
    return row?.id ?? null;
  };

  const formatCart = async () => {
    const cart = await orders.getCart(businessId, platform, userId);
    if (!cart.items.length) return { cart, text: "Корзина пуста." };
    let total = 0;
    const currency = cart.items[0]?.currency ?? "RUB";
    let mixed = false;
    const lines = cart.items.map((item, i) => {
      const unit = lineUnit(item.product_price, item.variant_price);
      const line = Math.round(Number(unit) * item.quantity * 100) / 100;
      if (item.currency !== currency) mixed = true;
      else total += line;
      const variant = item.variant_label ? ` (${item.variant_label})` : "";
      return `${i + 1}. ${item.product_name}${variant} × ${item.quantity} = ${moneyLabel(line.toFixed(2), item.currency)}`;
    });
    const footer = mixed
      ? "\n\nВ корзине товары в разных валютах. Оформите заказ по одной валюте."
      : "\n\nИтого: " + moneyLabel(total.toFixed(2), currency);
    return {
      cart,
      mixed,
      text: "Ваша корзина:\n" + lines.join("\n") + footer,
    };
  };

  const showCart = async (prefix = "") => {
    const { cart, text: body, mixed } = await formatCart();
    const choices = cart.items.map((item, i) => ({
      label: `${i + 1}. ${item.product_name}`.slice(0, 100),
      value: item.id,
    }));
    answers = { choicePage: "0" };
    await save("cart", choices);
    const buttons = cart.items.length
      ? [
          ...(mixed ? [] : ["Оформить заказ"]),
          "Изменить позицию",
          "Очистить корзину",
          ...shopNav,
        ]
      : shopNav;
    await queue((prefix ? prefix + "\n\n" : "") + body, buttons);
  };

  const showCategories = async () => {
    answers = {};
    const data = await catalog.catalogForBusiness(businessId);
    const withProducts = data.categories.filter((c) =>
      data.products.some((p) => p.category_id === c.id),
    );
    const uncategorized = data.products.filter((p) => !p.category_id);
    const choices = withProducts.map((c, i) => ({
      label: `${i + 1}. ${c.name}`.slice(0, 100),
      value: c.id,
    }));
    if (uncategorized.length)
      choices.push({ label: `${choices.length + 1}. Без категории`, value: "_" });
    if (!choices.length && data.products.length) {
      const productChoices = data.products.map((p, i) => ({
        label: `${i + 1}. ${p.name} · ${moneyLabel(p.price, p.currency)}`.slice(
          0,
          100,
        ),
        value: p.id,
      }));
      await showChoices(
        "products",
        "Выберите товар.",
        productChoices,
        0,
        shopNav,
      );
      return;
    }
    await showChoices(
      "categories",
      choices.length ? "Выберите категорию." : "Каталог пока пуст.",
      choices,
      0,
      shopNav,
    );
  };

  const showProductCard = async (productId: string) => {
    const product = await catalog.productForBusiness(businessId, productId);
    answers.productId = product.id;
    delete answers.variantId;
    delete answers.quantity;
    const photoNote = product.images.length
      ? `\nФото: ${product.images.length} шт.`
      : "";
    const desc = product.description?.trim()
      ? "\n" + product.description.trim().slice(0, 800)
      : "";
    const body =
      `${product.name}\n${moneyLabel(product.price, product.currency)}` +
      desc +
      photoNote;
    if (product.use_variants) {
      const variants = product.variants.filter((v) => v.active !== false);
      const choices = variants.map((v, i) => ({
        label:
          `${i + 1}. ${v.label || "Вариант"}` +
          (v.price ? ` · ${moneyLabel(v.price, product.currency)}` : ""),
        value: v.id,
      }));
      await showChoices(
        "variant",
        body + (choices.length ? "\n\nВыберите вариант." : "\n\nВарианты недоступны."),
        choices,
        0,
        ["Назад", ...shopNav],
      );
      return;
    }
    await save("qty");
    await queue(body + "\n\nСколько добавить в корзину?", [
      "1",
      "2",
      "3",
      "5",
      "10",
      "Назад",
      ...shopNav,
    ]);
  };

  if (text === "Каталог") {
    await showCategories();
    return true;
  }

  if (text === "Корзина") {
    await showCart();
    return true;
  }

  const choices = state
    ? (JSON.parse(state.fields) as { label: string; value: string }[])
    : [];
  const picked = choices.find(
    (c) => c.label === text || c.value === text,
  )?.value;
  const mode = state?.mode.slice(7);

  if (
    ["categories", "products", "variant", "cart"].includes(mode ?? "") &&
    ["Далее →", "← Назад по списку"].includes(text)
  ) {
    const page = Math.max(
      0,
      Math.min(
        Math.floor((choices.length - 1) / 7),
        Number(answers.choicePage ?? 0) + (text === "Далее →" ? 1 : -1),
      ),
    );
    await showChoices(mode!, "Выберите вариант.", choices, page, shopNav);
    return true;
  }

  if (mode === "categories" && picked) {
    answers.categoryId = picked;
    const data = await catalog.catalogForBusiness(businessId);
    const products =
      picked === "_"
        ? data.products.filter((p) => !p.category_id)
        : data.products.filter((p) => p.category_id === picked);
    const productChoices = products.map((p, i) => ({
      label: `${i + 1}. ${p.name} · ${moneyLabel(p.price, p.currency)}`.slice(
        0,
        100,
      ),
      value: p.id,
    }));
    await showChoices(
      "products",
      productChoices.length ? "Выберите товар." : "В категории пока нет товаров.",
      productChoices,
      0,
      ["Назад", ...shopNav],
    );
    return true;
  }

  if (mode === "products" && text === "Назад") {
    await showCategories();
    return true;
  }

  if (mode === "products" && picked) {
    await showProductCard(picked);
    return true;
  }

  if (mode === "variant" && text === "Назад") {
    if (answers.categoryId) {
      const data = await catalog.catalogForBusiness(businessId);
      const products =
        answers.categoryId === "_"
          ? data.products.filter((p) => !p.category_id)
          : data.products.filter((p) => p.category_id === answers.categoryId);
      const productChoices = products.map((p, i) => ({
        label: `${i + 1}. ${p.name} · ${moneyLabel(p.price, p.currency)}`.slice(
          0,
          100,
        ),
        value: p.id,
      }));
      await showChoices(
        "products",
        "Выберите товар.",
        productChoices,
        0,
        ["Назад", ...shopNav],
      );
    } else await showCategories();
    return true;
  }

  if (mode === "variant" && picked) {
    answers.variantId = picked;
    await save("qty");
    await queue("Сколько добавить в корзину?", [
      "1",
      "2",
      "3",
      "5",
      "10",
      "Назад",
      ...shopNav,
    ]);
    return true;
  }

  if (mode === "qty" && text === "Назад") {
    if (answers.productId) await showProductCard(answers.productId);
    else await showCategories();
    return true;
  }

  if (mode === "qty") {
    const qty = Number(text);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      await queue("Введите количество от 1 до 999.", [
        "1",
        "2",
        "3",
        "5",
        "10",
        "Назад",
        ...shopNav,
      ]);
      return true;
    }
    try {
      await orders.addCartItem(businessId, platform, userId, {
        product_id: answers.productId,
        variant_id: answers.variantId || null,
        quantity: qty,
      });
      await showCart("Товар добавлен в корзину.");
    } catch (error) {
      if (!(error instanceof AppError) || error.status >= 500) throw error;
      await queue(error.message, shopNav);
    }
    return true;
  }

  if (mode === "cart") {
    if (text === "Оформить заказ") {
      const cart = await orders.getCart(businessId, platform, userId);
      if (!cart.items.length) {
        await showCart();
        return true;
      }
      await save("checkout_name");
      await queue("Как к вам обращаться?", ["Отмена"]);
      return true;
    }
    if (text === "Очистить корзину") {
      await orders.clearCart(businessId, platform, userId);
      await showCart("Корзина очищена.");
      return true;
    }
    if (text === "Изменить позицию") {
      if (!choices.length) {
        await showCart();
        return true;
      }
      await showChoices(
        "cart_pick",
        "Выберите позицию для изменения.",
        choices,
        0,
        shopNav,
      );
      return true;
    }
  }

  if (mode === "cart_pick" && picked) {
    answers.itemId = picked;
    await save("cart_edit");
    await queue("Что сделать с позицией?", [
      "Изменить количество",
      "Удалить",
      "Назад",
      ...shopNav,
    ]);
    return true;
  }

  if (mode === "cart_edit") {
    if (text === "Назад") {
      await showCart();
      return true;
    }
    if (text === "Удалить") {
      await orders.removeCartItem(
        businessId,
        platform,
        userId,
        answers.itemId!,
      );
      await showCart("Позиция удалена.");
      return true;
    }
    if (text === "Изменить количество") {
      await save("cart_qty");
      await queue("Новое количество?", ["1", "2", "3", "5", "10", "Назад", "Отмена"]);
      return true;
    }
  }

  if (mode === "cart_qty") {
    if (text === "Назад") {
      await save("cart_edit");
      await queue("Что сделать с позицией?", [
        "Изменить количество",
        "Удалить",
        "Назад",
        ...shopNav,
      ]);
      return true;
    }
    const qty = Number(text);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      await queue("Введите количество от 1 до 999.", [
        "1",
        "2",
        "3",
        "5",
        "10",
        "Назад",
        "Отмена",
      ]);
      return true;
    }
    try {
      await orders.updateCartItem(
        businessId,
        platform,
        userId,
        answers.itemId!,
        qty,
      );
      await showCart("Количество обновлено.");
    } catch (error) {
      if (!(error instanceof AppError) || error.status >= 500) throw error;
      await queue(error.message, shopNav);
    }
    return true;
  }

  if (mode === "checkout_name") {
    if (!text.trim() || text.length > 100) {
      await queue("Введите имя до 100 символов.", ["Отмена"]);
      return true;
    }
    answers.name = text.trim();
    await save("checkout_phone");
    await queue("Ваш телефон в формате +79991234567.", ["Отмена"]);
    return true;
  }

  if (mode === "checkout_phone") {
    try {
      answers.phone = normalizeIdentity({ kind: "phone", value: text }).value;
    } catch {
      await queue("Введите телефон в формате +79991234567.", ["Отмена"]);
      return true;
    }
    await save("checkout_fulfillment");
    await queue("Доставка или самовывоз?", [
      "Доставка",
      "Самовывоз",
      "Отмена",
    ]);
    return true;
  }

  if (mode === "checkout_fulfillment") {
    if (text === "Доставка") {
      answers.fulfillment = "delivery";
      await save("checkout_address");
      await queue("Адрес доставки?", ["Отмена"]);
      return true;
    }
    if (text === "Самовывоз") {
      answers.fulfillment = "pickup";
      answers.address = "";
      await save("checkout_comment");
      await queue("Комментарий к заказу?\nМожно пропустить: /skip.", [
        "/skip",
        "Отмена",
      ]);
      return true;
    }
    await queue("Выберите доставку или самовывоз.", [
      "Доставка",
      "Самовывоз",
      "Отмена",
    ]);
    return true;
  }

  if (mode === "checkout_address") {
    if (!text.trim() || text.length > 500) {
      await queue("Укажите адрес доставки до 500 символов.", ["Отмена"]);
      return true;
    }
    answers.address = text.trim();
    await save("checkout_comment");
    await queue("Комментарий к заказу?\nМожно пропустить: /skip.", [
      "/skip",
      "Отмена",
    ]);
    return true;
  }

  if (mode === "checkout_comment") {
    if (text.startsWith("/") && text !== "/skip") {
      await queue("Комментарий к заказу?\nМожно пропустить: /skip.", [
        "/skip",
        "Отмена",
      ]);
      return true;
    }
    if (text.length > 2000) {
      await queue("Комментарий слишком длинный.", ["/skip", "Отмена"]);
      return true;
    }
    answers.comment = text === "/skip" ? "" : text.trim();
    const { text: cartText } = await formatCart();
    await save("checkout_confirm");
    await queue(
      cartText +
        "\n\n" +
        answers.name +
        "\n" +
        answers.phone +
        "\n" +
        (answers.fulfillment === "delivery"
          ? "Доставка: " + answers.address
          : "Самовывоз") +
        (answers.comment ? "\n" + answers.comment : "") +
        "\n\nПодтвердить заказ?",
      ["Подтвердить", "Отмена"],
    );
    return true;
  }

  if (mode === "checkout_confirm" && text === "Подтвердить") {
    try {
      const conversationId = await findConversationId();
      const order = await orders.checkout(businessId, {
        request_key: connectionId + ":" + eventId,
        source: platform,
        platform,
        external_user_id: userId,
        customer_name: answers.name,
        customer_phone: answers.phone,
        fulfillment: answers.fulfillment,
        delivery_address: answers.address || "",
        comment: answers.comment || "",
        conversation_id: conversationId,
      });
      await menu(
        "Заказ принят № " +
          (order.order_number ?? "") +
          ".\nСумма: " +
          moneyLabel(order.total, order.currency) +
          ".\nМы свяжемся с вами для подтверждения.",
      );
    } catch (error) {
      if (!(error instanceof AppError) || error.status >= 500) throw error;
      await queue(error.message, ["Корзина", "Каталог", "Отмена"]);
    }
    return true;
  }

  await queue("Выберите действие кнопкой или напишите /cancel.", shopNav);
  return true;
}
