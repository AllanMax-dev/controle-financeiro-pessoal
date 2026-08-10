import {
  SavingsGoalForm,
  SavingsGoalMovementForm,
} from "@/components/savings-goal-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { getDatabase } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  contextHref,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import {
  createSavingsGoalAction,
  createSavingsGoalMovementAction,
} from "@/modules/savings-goals/application/savings-goal-actions";
import { getSavingsGoalOverview } from "@/modules/savings-goals/application/get-savings-goal-overview";
import { dateInputInTimeZone } from "@/modules/shared/domain/calendar";

export default async function SavingsGoalsPage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(await searchParams),
  );
  const currentContext = contextState.current;
  const database = getDatabase();
  const today = dateInputInTimeZone(new Date(), access.workspaceTimezone);
  const [overview, accounts] = await Promise.all([
    getSavingsGoalOverview(access.workspaceId, currentContext.id),
    database.financialAccount.findMany({
      where: {
        active: true,
        contextId: currentContext.id,
        type: { not: "INVESTMENT" },
        workspaceId: access.workspaceId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const activeGoals = overview.goals.filter(({ status }) => status !== "ARCHIVED");

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Cofrinhos</p>
          <h1>Metas financeiras</h1>
          <p>Acompanhe objetivos sem somar o mesmo dinheiro duas vezes no patrimÃ´nio.</p>
        </div>
      </section>

      <section className="finance-workspace-grid">
        <div className="finance-form-stack">
          <SavingsGoalForm
            accounts={accounts}
            action={createSavingsGoalAction}
            contextId={currentContext.id}
          />
          {activeGoals.length > 0 ? (
            <SavingsGoalMovementForm
              accounts={accounts}
              action={createSavingsGoalMovementAction}
              goals={activeGoals}
              today={today}
            />
          ) : null}
        </div>

        <section className="panel-card finance-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Objetivos</p>
              <h2>Cofrinhos ativos</h2>
            </div>
          </div>
          {overview.goals.length === 0 ? (
            <EmptyState
              action={{ href: contextHref("/contas", currentContext.id), label: "Ver contas" }}
              description="Crie um cofrinho para acompanhar reservas, compras planejadas ou sonhos."
              icon="goal"
              title="Nenhum cofrinho cadastrado"
            />
          ) : (
            <div className="savings-goal-list">
              {overview.goals.map((goal) => (
                <article className="savings-goal-card" key={goal.id}>
                  <header>
                    <div>
                      <strong>{goal.name}</strong>
                      <small>
                        {goal.account?.name ?? "Sem conta especÃ­fica"}
                        {goal.deadline ? ` Â· atÃ© ${formatDate(goal.deadline)}` : ""}
                      </small>
                    </div>
                    <span className={`status-pill status-${goal.status.toLowerCase()}`}>
                      {goal.status === "COMPLETED" ? "ConcluÃ­do" : goal.status === "ACTIVE" ? "Ativo" : "Arquivado"}
                    </span>
                  </header>
                  <div className="savings-goal-values">
                    <span>
                      Guardado
                      <strong>{formatCurrency(goal.currentAmount)}</strong>
                    </span>
                    <span>
                      Meta
                      <strong>{formatCurrency(goal.targetAmount)}</strong>
                    </span>
                    <span>
                      Falta
                      <strong>{formatCurrency(goal.missingAmount)}</strong>
                    </span>
                  </div>
                  <div className="progress-track" aria-label={`${goal.progress.toFixed(0)}% da meta`}>
                    <span style={{ width: `${goal.progress}%` }} />
                  </div>
                  {goal.movements.length > 0 ? (
                    <ul className="compact-finance-list">
                      {goal.movements.slice(0, 4).map((movement) => (
                        <li key={movement.id}>
                          <span>
                            <strong>{movement.type === "DEPOSIT" ? "DepÃ³sito" : "Retirada"}</strong>
                            <small>
                              {movement.editor.displayName} Â· {formatDate(movement.movementDate)}
                            </small>
                          </span>
                          <strong className={movement.type === "DEPOSIT" ? "value-income" : "value-expense"}>
                            {movement.type === "DEPOSIT" ? "+ " : "- "}
                            {formatCurrency(movement.amount)}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="compact-empty">Nenhum movimento registrado.</div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </>
  );
}
