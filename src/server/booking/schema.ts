import type { Generated } from "kysely";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";
export interface BookingTables {
  booking_service: {
    id: string;
    business_id: string;
    name: string;
    description: Generated<string>;
    price: string | null;
    currency: Generated<string>;
    duration_minutes: number;
    buffer_before_minutes: Generated<number>;
    buffer_after_minutes: Generated<number>;
    active: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  booking_specialist: {
    id: string;
    business_id: string;
    name: string;
    description: Generated<string>;
    active: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  booking_service_specialist: {
    business_id: string;
    service_id: string;
    specialist_id: string;
  };
  booking_settings: {
    business_id: string;
    minimum_booking_notice: Generated<number>;
    maximum_booking_horizon: Generated<number>;
    slot_interval: Generated<number>;
  };
  booking_schedule: {
    business_id: string;
    specialist_id: string;
    weekday: number;
    intervals: unknown;
  };
  booking_schedule_exception: {
    business_id: string;
    specialist_id: string;
    date: string;
    intervals: unknown;
    reason: Generated<string>;
  };
  booking: {
    id: string;
    business_id: string;
    client_id: string;
    service_id: string;
    specialist_id: string;
    starts_at: Date;
    ends_at: Date;
    occupied_from: Date;
    occupied_until: Date;
    status: BookingStatus;
    revision: Generated<number>;
    source: "manual" | "telegram" | "vk";
    request_key: string;
    request_hash: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  booking_history: {
    id: string;
    business_id: string;
    booking_id: string;
    action: string;
    actor_user_id: string | null;
    previous_start: Date | null;
    new_start: Date | null;
    created_at: Generated<Date>;
  };
  booking_reminder: {
    id: string;
    business_id: string;
    booking_id: string;
    revision: number;
    kind: "confirmation" | "24h" | "2h";
    due_at: Date;
    status: Generated<
      "pending" | "queued" | "sent" | "cancelled" | "failed" | "uncertain"
    >;
    last_error: string | null;
  };
}
