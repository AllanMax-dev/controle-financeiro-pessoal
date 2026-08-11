import type { Route } from "next";
import { notFound } from "next/navigation";

import { getDatabase } from "@/lib/db";

export const FINANCIAL_CONTEXT_QUERY_PARAM = "contextId";

export type CurrentAccessScope = {
  editorId: string;
  workspaceId: string;
};

export type FinancialContextOption = {
  id: string;
  name: string;
  ownerEditorId: string | null;
  type: "PERSONAL" | "COUPLE";
  ownerName?: string | null;
};

export type FinancialDataScope = {
  contextIds: string[];
  contextsById: Record<string, FinancialContextOption>;
  current: FinancialContextOption;
  mode: "PERSONAL" | "COUPLE";
  writeContext: FinancialContextOption;
};

export type ResolvedFinancialContext = {
  contexts: FinancialContextOption[];
  current: FinancialContextOption;
  scope: FinancialDataScope;
};

export type FinancialContextFilter = FinancialDataScope | string | string[] | undefined;

export type FinancialContextSearchParams = {
  contextId?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sortContextsForEditor(access: CurrentAccessScope, contexts: FinancialContextOption[]) {
  return [...contexts].sort((first, second) => {
    if (first.ownerEditorId === access.editorId && second.ownerEditorId !== access.editorId) {
      return -1;
    }

    if (second.ownerEditorId === access.editorId && first.ownerEditorId !== access.editorId) {
      return 1;
    }

    if (first.type !== second.type) {
      return first.type === "PERSONAL" ? -1 : 1;
    }

    return first.name.localeCompare(second.name, "pt-BR");
  });
}

export function selectedContextIdFromSearchParams(searchParams: FinancialContextSearchParams) {
  return firstParam(searchParams.contextId);
}

export function contextHref(pathname: string, contextId: string): Route {
  return `${pathname}?${FINANCIAL_CONTEXT_QUERY_PARAM}=${encodeURIComponent(contextId)}` as Route;
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

export function financialContextIds(scope: FinancialContextFilter): string[] | undefined {
  if (!scope) {
    return undefined;
  }

  if (typeof scope === "string") {
    return [scope];
  }

  if (Array.isArray(scope)) {
    return uniq(scope);
  }

  return uniq(scope.contextIds);
}

export function financialContextWhere(scope: FinancialContextFilter) {
  const contextIds = financialContextIds(scope);

  if (!contextIds || contextIds.length === 0) {
    return {};
  }

  return contextIds.length === 1
    ? { contextId: contextIds[0] }
    : { contextId: { in: contextIds } };
}

export function transferContextWhere(scope: FinancialContextFilter) {
  const contextIds = financialContextIds(scope);

  if (!contextIds || contextIds.length === 0) {
    return {};
  }

  const contextFilter = contextIds.length === 1 ? contextIds[0] : { in: contextIds };

  return {
    OR: [
      { sourceContextId: contextFilter },
      { destinationContextId: contextFilter },
    ],
  };
}

export function originLabelForContext(scope: FinancialDataScope, contextId: string): string {
  const context = scope.contextsById[contextId];
  return context?.ownerName ?? context?.name ?? "Origem";
}

function toContextOption({ ownerEditor, ...context }: FinancialContextOption & { ownerEditor?: { displayName: string } | null }) {
  return {
    ...context,
    ownerName: ownerEditor?.displayName ?? null,
  };
}

export async function getAccessibleFinancialContexts(
  access: CurrentAccessScope,
): Promise<FinancialContextOption[]> {
  const contexts = await getDatabase().financialContext.findMany({
    where: {
      active: true,
      workspaceId: access.workspaceId,
      OR: [
        { ownerEditorId: access.editorId, type: "PERSONAL" },
        { members: { some: { editorId: access.editorId } }, type: "COUPLE" },
      ],
    },
    select: {
      id: true,
      name: true,
      ownerEditor: { select: { displayName: true } },
      ownerEditorId: true,
      type: true,
    },
  });

  return sortContextsForEditor(access, contexts.map(toContextOption));
}

export async function getWritableFinancialContexts(
  access: CurrentAccessScope,
): Promise<FinancialContextOption[]> {
  const contexts = await getDatabase().financialContext.findMany({
    where: {
      active: true,
      ownerEditorId: access.editorId,
      type: "PERSONAL",
      workspaceId: access.workspaceId,
    },
    select: {
      id: true,
      name: true,
      ownerEditor: { select: { displayName: true } },
      ownerEditorId: true,
      type: true,
    },
  });

  return sortContextsForEditor(access, contexts.map(toContextOption));
}

export async function getWritableFinancialContextIds(access: CurrentAccessScope): Promise<string[]> {
  return (await getWritableFinancialContexts(access)).map(({ id }) => id);
}

export async function canWriteFinancialContext(
  access: CurrentAccessScope,
  contextId: string,
): Promise<boolean> {
  return (await getWritableFinancialContextIds(access)).includes(contextId);
}

function uniqueContextOptions(contexts: FinancialContextOption[]) {
  return [...new Map(contexts.map((context) => [context.id, context])).values()];
}

async function getCoupleScopeContexts(access: CurrentAccessScope, coupleContextId: string) {
  const members = await getDatabase().financialContextMember.findMany({
    where: { financialContextId: coupleContextId, workspaceId: access.workspaceId },
    select: { editorId: true },
  });
  const memberEditorIds = members.map(({ editorId }) => editorId);

  const contexts = await getDatabase().financialContext.findMany({
    where: {
      active: true,
      workspaceId: access.workspaceId,
      OR: [
        { id: coupleContextId },
        { ownerEditorId: { in: memberEditorIds }, type: "PERSONAL" },
      ],
    },
    select: {
      id: true,
      name: true,
      ownerEditor: { select: { displayName: true } },
      ownerEditorId: true,
      type: true,
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return contexts.map(toContextOption);
}

export async function resolveFinancialContext(
  access: CurrentAccessScope,
  requestedContextId?: string,
): Promise<ResolvedFinancialContext> {
  const contexts = await getAccessibleFinancialContexts(access);

  if (contexts.length === 0) {
    notFound();
  }

  const current =
    contexts.find(({ id }) => id === requestedContextId) ??
    contexts.find(({ ownerEditorId }) => ownerEditorId === access.editorId) ??
    contexts.find(({ type }) => type === "COUPLE") ??
    contexts[0]!;

  const writableContexts = await getWritableFinancialContexts(access);
  const writeContext =
    writableContexts.find(({ ownerEditorId, type }) => type === "PERSONAL" && ownerEditorId === access.editorId) ??
    current;
  const scopeContextOptions = current.type === "COUPLE"
    ? await getCoupleScopeContexts(access, current.id)
    : [current];
  const contextIds = current.type === "COUPLE"
    ? scopeContextOptions.map(({ id }) => id)
    : [current.id];
  const contextsById = Object.fromEntries(
    uniqueContextOptions([...scopeContextOptions, ...contexts, ...writableContexts]).map((context) => [context.id, context]),
  );

  return {
    contexts,
    current,
    scope: {
      contextIds: uniq(contextIds),
      contextsById,
      current,
      mode: current.type,
      writeContext,
    },
  };
}

export async function assertFinancialContextAccess(
  access: CurrentAccessScope,
  contextId: string,
) {
  const contexts = await getAccessibleFinancialContexts(access);
  const context = contexts.find(({ id }) => id === contextId);

  if (!context) {
    throw new Error("financial_context_unavailable");
  }

  return context;
}

export async function resolveWritableFinancialContext(
  access: CurrentAccessScope,
  requestedContextId: string,
) {
  const { current, scope } = await resolveFinancialContext(access, requestedContextId);

  if (current.type === "COUPLE" && scope.writeContext.type !== "PERSONAL") {
    throw new Error("financial_context_write_unavailable");
  }

  return current.type === "COUPLE" ? scope.writeContext : current;
}
