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
    title: Generated<string>;
    photo_attachment_id: string | null;
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
    choose_specialist: Generated<boolean>;
    schedule_mode: Generated<"automatic" | "manual">;
    client_reminders_enabled: Generated<boolean>;
    client_reminder_offsets: Generated<unknown>;
    client_reminder_template: Generated<string>;
    staff_reminder_offsets: Generated<unknown>;
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
  booking_manual_slot: {
    id: string;
    business_id: string;
    specialist_id: string | null;
    service_id: string | null;
    starts_at: Date;
    ends_at: Date;
    capacity: Generated<number>;
    active: Generated<boolean>;
    created_at: Generated<Date>;
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
