import type { Post } from "@/types";

export const mockPosts: Post[] = [
  {
    id: "post_1",
    businessId: "biz_zerno",
    text: "Доброе утро! ☕",
    platforms: ["telegram", "vk"],
    status: "published",
    publishAt: "2026-09-10T09:00:00+03:00",
  },
  {
    id: "post_2",
    businessId: "biz_zerno",
    text: "Новые десерты",
    excerpt: "Попробуйте наши сезонные новинки",
    platforms: ["telegram", "vk"],
    status: "scheduled",
    publishAt: "2026-09-11T12:00:00+03:00",
  },
  {
    id: "post_4",
    businessId: "biz_zerno",
    text: "Уютная атмосфера",
    excerpt: "Маленькие поводы для радости",
    platforms: ["telegram", "vk"],
    status: "scheduled",
    publishAt: "2026-09-25T15:00:00+03:00",
  },
  {
    id: "post_3",
    businessId: "biz_boroda",
    text: "Акция: первая стрижка со скидкой 20%",
    platforms: ["telegram"],
    status: "draft",
  },
];
