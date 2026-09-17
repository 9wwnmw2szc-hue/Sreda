import type { Generated } from "kysely";

export type CalendarEventType =
  | "note"
  | "task"
  | "meeting"
  | "reminder"
  | "blocked_time"
  | "other";

export type CalendarEventStatus = "open" | "done" | "cancelled";

export type EntityReminderKind = "calendar_event" | "booking" | "order" | "lead";

export type EntityReminderAudience = "staff" | "client";

export type EntityReminderChannel = "in_app" | "telegram" | "vk";

export type EntityReminderStatus =
  | "pending"
  | "queued"
  | "sent"
  | "cancelled"
  | "failed"
  | "uncertain";

export interface CalendarTables {
  calendar_event: {
    id: string;
    business_id: string;
    title: string;
    description: Generated<string>;
    starts_at: Date;
    ends_at: Date | null;
    all_day: Generated<boolean>;
    created_by: string;
    assigned_to: string | null;
    specialist_id: string | null;
    event_type: CalendarEventType;
    status: Generated<CalendarEventStatus>;
    related_client_id: string | null;
    related_lead_id: string | null;
    related_order_id: string | null;
    related_booking_id: string | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  entity_reminder: {
    id: string;
    business_id: string;
    entity_kind: EntityReminderKind;
    entity_id: string;
    offset_minutes: number;
    fire_at: Date;
    audience: Generated<EntityReminderAudience>;
    channel: Generated<EntityReminderChannel>;
    status: Generated<EntityReminderStatus>;
    recipient_user_id: string | null;
    message_template: Generated<string>;
    last_error: string | null;
    created_at: Generated<Date>;
  };
}
