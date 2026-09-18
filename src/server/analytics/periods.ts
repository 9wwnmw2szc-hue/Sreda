import { localInstants } from "../booking/time.ts";

export type PeriodPreset =
  | "today"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "custom";

export type DateRange = {
  from: Date;
  until: Date;
  label: string;
  previous: { from: Date; until: Date; label: string };
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function localYmd(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

function addDaysYmd(ymd: string, days: number): string {
  const t = Date.parse(ymd + "T12:00:00Z") + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function monthStart(ymd: string): string {
  return ymd.slice(0, 8) + "01";
}

function nextMonthStart(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const nm = m === 12 ? 1 : m! + 1;
  const ny = m === 12 ? y! + 1 : y!;
  return `${ny}-${pad(nm)}-01`;
}

function rangeLabel(fromYmd: string, untilExclusiveYmd: string): string {
  const end = addDaysYmd(untilExclusiveYmd, -1);
  if (fromYmd === end) return fromYmd;
  return `${fromYmd} – ${end}`;
}

function bounds(fromYmd: string, untilExclusiveYmd: string, timezone: string) {
  const from =
    localInstants(fromYmd, 0, timezone)[0] ?? new Date(fromYmd + "T00:00:00Z");
  const until =
    localInstants(untilExclusiveYmd, 0, timezone)[0] ??
    new Date(untilExclusiveYmd + "T00:00:00Z");
  return { from, until };
}

/** Inclusive calendar range in business timezone → half-open UTC instants. */
export function resolvePeriod(
  preset: PeriodPreset,
  timezone: string,
  now = new Date(),
  custom?: { from: string; until: string },
): DateRange {
  const today = localYmd(now, timezone);
  let fromYmd: string;
  let untilExclusive: string;

  switch (preset) {
    case "today":
      fromYmd = today;
      untilExclusive = addDaysYmd(today, 1);
      break;
    case "7d":
      untilExclusive = addDaysYmd(today, 1);
      fromYmd = addDaysYmd(untilExclusive, -7);
      break;
    case "30d":
      untilExclusive = addDaysYmd(today, 1);
      fromYmd = addDaysYmd(untilExclusive, -30);
      break;
    case "this_month":
      fromYmd = monthStart(today);
      untilExclusive = nextMonthStart(today);
      break;
    case "last_month": {
      const thisStart = monthStart(today);
      untilExclusive = thisStart;
      fromYmd = monthStart(addDaysYmd(thisStart, -1));
      break;
    }
    case "custom": {
      if (!custom?.from || !custom?.until)
        throw new Error("CUSTOM_RANGE_REQUIRED");
      fromYmd = custom.from;
      untilExclusive = addDaysYmd(custom.until, 1);
      break;
    }
    default:
      untilExclusive = addDaysYmd(today, 1);
      fromYmd = addDaysYmd(untilExclusive, -30);
  }

  const ms = Date.parse(untilExclusive + "T12:00:00Z") - Date.parse(fromYmd + "T12:00:00Z");
  const days = Math.max(1, Math.round(ms / 86400000));
  const prevUntil = fromYmd;
  const prevFrom = addDaysYmd(prevUntil, -days);

  const current = bounds(fromYmd, untilExclusive, timezone);
  const previous = bounds(prevFrom, prevUntil, timezone);
  return {
    ...current,
    label: rangeLabel(fromYmd, untilExclusive),
    previous: {
      ...previous,
      label: rangeLabel(prevFrom, prevUntil),
    },
  };
}

export type Delta = {
  current: number;
  previous: number;
  absolute: number;
  percent: number | null;
};

export function compareMetric(current: number, previous: number): Delta {
  const absolute = current - previous;
  if (previous === 0) {
    return {
      current,
      previous,
      absolute,
      percent: current === 0 ? 0 : null,
    };
  }
  return {
    current,
    previous,
    absolute,
    percent: Math.round((absolute / previous) * 1000) / 10,
  };
}
