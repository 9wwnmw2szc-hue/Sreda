export const ACCOUNT_DELETION_PHRASE = "УДАЛИТЬ";

export type BusinessDecision = {
  businessId: string;
  action: "archive" | "transfer";
  transferToUserId?: string;
};

export type DeletionImpact = {
  status: "active" | "pending" | "deleted";
  ownedBusinesses: {
    id: string;
    name: string;
    role: "owner" | "admin" | "operator";
    memberCount: number;
    otherMembers: {
      id: string;
      name: string;
      username: string;
      role: string;
    }[];
    requiresDecision: boolean;
  }[];
  memberBusinesses: {
    id: string;
    name: string;
    role: "owner" | "admin" | "operator";
    memberCount: number;
    otherMembers: {
      id: string;
      name: string;
      username: string;
      role: string;
    }[];
    requiresDecision: boolean;
  }[];
  notificationBindings: number;
  canDeleteImmediately: boolean;
  blockers: string[];
};
