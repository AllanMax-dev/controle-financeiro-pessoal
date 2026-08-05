import type { getMonthlyReport } from "@/modules/reports/application/get-monthly-report";

type MonthlyReport = Awaited<ReturnType<typeof getMonthlyReport>>;

export function protectSpreadsheetFormula(value: string): string {
  return /^[\u0000-\u0020]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string): string {
  const protectedValue = protectSpreadsheetFormula(value);
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function csvDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export function createMonthlyReportCsv(report: MonthlyReport): string {
  const rows = [
    ["Tipo", "Descrição", "Conta", "Categoria", "Competência", "Vencimento", "Status", "Valor"],
    ...report.transactions.map((transaction) => [
      transaction.type === "INCOME" ? "Receita" : "Despesa",
      transaction.description,
      transaction.account.name,
      transaction.category?.name ?? "Sem categoria",
      csvDate(transaction.competenceDate),
      csvDate(transaction.dueDate),
      transaction.status,
      transaction.amount.toFixed(2).replace(".", ","),
    ]),
    ...report.transfers.map((transfer) => [
      "Transferência",
      transfer.description,
      `${transfer.sourceAccount.name} → ${transfer.destinationAccount.name}`,
      "",
      csvDate(transfer.transferDate),
      "",
      transfer.status,
      transfer.amount.toFixed(2).replace(".", ","),
    ]),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
