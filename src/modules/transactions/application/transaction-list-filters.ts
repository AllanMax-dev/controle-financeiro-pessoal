import { identifierSchema } from "@/modules/shared/application/form-schemas";

const TRANSACTION_STATUSES = ["PENDING", "SETTLED", "CANCELED"] as const;
const TRANSACTION_TYPES = ["INCOME", "EXPENSE"] as const;
const DATE_INPUT_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_INPUT_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MAX_SEARCH_LENGTH = 120;

type TransactionStatusFilter = (typeof TRANSACTION_STATUSES)[number];
type TransactionTypeFilter = (typeof TRANSACTION_TYPES)[number];

export type TransactionListSearchParams = {
  accountId?: string;
  categoryId?: string;
  endDate?: string;
  month?: string;
  personId?: string;
  q?: string;
  startDate?: string;
  status?: string;
  type?: string;
};

export type NormalizedTransactionListFilters = {
  accountId?: string;
  categoryId?: string;
  end: Date;
  endDate: string;
  personId?: string;
  search?: string;
  start: Date;
  startDate: string;
  status?: TransactionStatusFilter;
  type?: TransactionTypeFilter;
};

function dateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function currentMonth(referenceDate: Date): string {
  return referenceDate.toISOString().slice(0, 7);
}

function parseDateInput(value?: string): Date | undefined {
  if (!value || !DATE_INPUT_PATTERN.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || dateInputValue(date) !== value) {
    return undefined;
  }

  return date;
}

function nextUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + 1));
}

function monthInterval(monthValue: string | undefined, referenceDate: Date) {
  const month = monthValue && MONTH_INPUT_PATTERN.test(monthValue) ? monthValue : currentMonth(referenceDate);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  return { end, start };
}

function normalizeIdentifier(value?: string): string | undefined {
  return identifierSchema.safeParse(value).success ? value : undefined;
}

function normalizeEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function normalizeSearch(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized.slice(0, MAX_SEARCH_LENGTH) : undefined;
}

export function normalizeTransactionListFilters(
  filters: TransactionListSearchParams,
  referenceDate = new Date(),
): NormalizedTransactionListFilters {
  const fallback = monthInterval(filters.month, referenceDate);
  const requestedStart = parseDateInput(filters.startDate) ?? fallback.start;
  const requestedEnd = parseDateInput(filters.endDate);
  const exclusiveEnd = requestedEnd ? nextUtcDay(requestedEnd) : fallback.end;
  const validPeriod = requestedStart < exclusiveEnd;
  const start = validPeriod ? requestedStart : fallback.start;
  const end = validPeriod ? exclusiveEnd : fallback.end;

  return {
    accountId: normalizeIdentifier(filters.accountId),
    categoryId: normalizeIdentifier(filters.categoryId),
    end,
    endDate: dateInputValue(new Date(end.getTime() - DAY_IN_MS)),
    personId: normalizeIdentifier(filters.personId),
    search: normalizeSearch(filters.q),
    start,
    startDate: dateInputValue(start),
    status: normalizeEnum(filters.status, TRANSACTION_STATUSES),
    type: normalizeEnum(filters.type, TRANSACTION_TYPES),
  };
}
