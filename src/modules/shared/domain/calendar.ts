export function calendarDateInTimeZone(referenceDate: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(referenceDate);
  const values = new Map(parts.map(({ type, value }) => [type, value]));

  return new Date(
    Date.UTC(
      Number(values.get("year")),
      Number(values.get("month")) - 1,
      Number(values.get("day")),
    ),
  );
}

export function dateInputInTimeZone(referenceDate: Date, timeZone: string): string {
  return calendarDateInTimeZone(referenceDate, timeZone).toISOString().slice(0, 10);
}

export function monthInputInTimeZone(referenceDate: Date, timeZone: string): string {
  return dateInputInTimeZone(referenceDate, timeZone).slice(0, 7);
}
