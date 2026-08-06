import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import {
  getMonthlyReport,
  normalizeReportMonth,
} from "@/modules/reports/application/get-monthly-report";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const access = await requireCurrentAccess();
  const filters = await searchParams;
  const month = normalizeReportMonth(filters.month);
  const report = await getMonthlyReport(access.workspaceId, month);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Análise</p>
          <h1>Relatório mensal</h1>
          <p>Consolidação por competência com receitas, despesas, pendências e categorias.</p>
        </div>
        <div className="report-actions">
          <form className="month-picker" method="get">
            <label>
              <span>Mês</span>
              <input name="month" type="month" defaultValue={month} />
            </label>
            <button className="secondary-button" type="submit">
              Exibir
            </button>
          </form>
          <a className="primary-button" href={`/api/relatorios/mensal?month=${month}`}>
            <Icon name="download" />
            Exportar CSV
          </a>
        </div>
      </section>

      <section className="metric-grid" aria-label="Resumo do relatório">
        <article className="metric-card">
          <span>Receitas realizadas</span>
          <strong className="value-income">{formatCurrency(report.periodResult.income)}</strong>
          <small>{formatCurrency(report.pendingIncome)} pendentes</small>
        </article>
        <article className="metric-card">
          <span>Despesas realizadas</span>
          <strong className="value-expense">{formatCurrency(report.periodResult.expense)}</strong>
          <small>{formatCurrency(report.pendingExpense)} pendentes</small>
        </article>
        <article className="metric-card">
          <span>Resultado realizado</span>
          <strong>{formatCurrency(report.periodResult.result)}</strong>
          <small>Receitas menos despesas</small>
        </article>
        <article className="metric-card">
          <span>Saldo consolidado atual</span>
          <strong>{formatCurrency(report.totalBalance)}</strong>
          <small>Não limitado ao mês selecionado</small>
        </article>
      </section>

      <section className="panel-card report-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Categorias</p>
            <h2>Composição realizada</h2>
          </div>
        </div>
        {report.categoryTotals.length === 0 ? (
          <EmptyState
            description="Não existem valores realizados neste mês para compor a tabela."
            icon="report"
            title="Sem composição realizada"
          />
        ) : (
          <div className="report-table" role="table" aria-label="Totais por categoria">
            <div className="report-table-header" role="row">
              <span role="columnheader">Categoria</span>
              <span role="columnheader">Receitas</span>
              <span role="columnheader">Despesas</span>
            </div>
            {report.categoryTotals.map((category) => (
              <div role="row" key={category.id}>
                <span role="cell">
                  <i className="legend-dot" style={{ backgroundColor: category.color }} />
                  {category.name}
                </span>
                <strong className="value-income" role="cell">
                  {formatCurrency(category.income)}
                </strong>
                <strong className="value-expense" role="cell">
                  {formatCurrency(category.expense)}
                </strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
