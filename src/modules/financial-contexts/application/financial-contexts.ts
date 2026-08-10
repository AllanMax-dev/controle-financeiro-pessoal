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
};

export type ResolvedFinancialContext = {
  contexts: FinancialContextOption[];
  current: FinancialContextOption;
};

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

export function contextHref(pathname: string, contextId: string) {
  return `${pathname}?${FINANCIAL_CONTEXT_QUERY_PARAM}=${encodeURIComponent(contextId)}`;
}

export async function getAccessibleFinancialContexts(
  access: CurrentAccessScope,
): Promise<FinancialContextOption[]> {
  const contexts = await getDatabase().financialContext.findMany({
    where: {
      active: true,
      workspaceId: access.workspaceId,
      OR: [
        { type: "COUPLE" },
        { ownerEditorId: access.editorId, type: "PERSONAL" },
      ],
    },
    select: { id: true, name: true, ownerEditorId: true, type: true },
  });

  return sortContextsForEditor(access, contexts);
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

  return { contexts, current };
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
