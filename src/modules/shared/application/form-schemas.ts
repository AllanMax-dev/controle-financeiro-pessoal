import { z } from "zod";

import { parseMoneyInput } from "@/modules/shared/domain/money";

export const identifierSchema = z.uuid();

export const versionSchema = z.coerce.number().int().positive();

export const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Escolha uma cor válida.");

export const moneyInputSchema = z.string().trim().min(1, "Informe o valor.").transform((value, context) => {
  try {
    return parseMoneyInput(value).toFixed(2);
  } catch {
    context.addIssue({ code: "custom", message: "Informe um valor monetário válido." });
    return z.NEVER;
  }
});

export const positiveMoneyInputSchema = moneyInputSchema.refine(
  (value) => Number(value) > 0,
  "O valor deve ser maior que zero.",
);

export function firstValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Revise os campos informados.";
}
