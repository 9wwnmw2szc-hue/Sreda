export const BUSINESS_DELETION_PHRASE = "УДАЛИТЬ";

export type BusinessDeletionImpact = {
  businessId: string;
  name: string;
  alreadyDeleted: boolean;
  members: number;
  customers: number;
  leads: number;
  orders: number;
  bookings: number;
  conversations: number;
  posts: number;
  products: number;
  connections: number;
  files: number;
  channelAdminBindings: number;
};
