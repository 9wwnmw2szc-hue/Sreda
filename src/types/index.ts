export type Platform = "telegram" | "vk" | "max";

export type ConnectionStatus =
  "connected" | "disconnected" | "pending" | "error";

export type SolutionStatus =
  "available" | "active" | "setup_required" | "paused" | "unavailable";

export type LeadStatus = "new" | "processing" | "closed";

export type PostStatus = "draft" | "scheduled" | "published";

export interface User {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface Business {
  id: string;
  ownerId: string;
  timezone?: string;
  role?: "owner" | "admin" | "operator";
  name: string;
  avatarUrl?: string;
  planName?: string;
}

export interface Connection {
  id: string;
  businessId: string;
  platform: Platform;
  status: ConnectionStatus;
  displayName: string;
}

export interface Solution {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
}

export interface BusinessSolution {
  id: string;
  businessId: string;
  solutionId: string;
  status: SolutionStatus;
}

export interface Lead {
  id: string;
  businessId: string;
  source: Platform;
  name: string;
  phone?: string;
  message?: string;
  status: LeadStatus;
  createdAt: string;
}

export interface Post {
  id: string;
  businessId: string;
  text: string;
  imageUrl?: string;
  excerpt?: string;
  platforms: Platform[];
  status: PostStatus;
  publishAt?: string;
}

export interface BillingInfo {
  businessId: string;
  planName: string;
  pricePerMonth: number;
  activeSolutionsCount: number;
  status: "active" | "paused" | "overdue";
  nextChargeAt: string;
}
