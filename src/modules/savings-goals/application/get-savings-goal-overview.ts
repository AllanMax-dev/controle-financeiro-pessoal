import { getDatabase } from "@/lib/db";
import { money, sumMoney } from "@/modules/shared/domain/money";

export async function getSavingsGoalOverview(workspaceId: string, contextId: string) {
  const goals = await getDatabase().savingsGoal.findMany({
    where: { contextId, workspaceId },
    include: {
      account: { select: { id: true, name: true } },
      movements: {
        include: { editor: { select: { displayName: true } } },
        orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      },
    },
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { name: "asc" }],
  });

  return {
    goals: goals.map((goal) => {
      const deposits = sumMoney(
        goal.movements.filter(({ type }) => type === "DEPOSIT").map(({ amount }) => amount),
      );
      const withdrawals = sumMoney(
        goal.movements.filter(({ type }) => type === "WITHDRAWAL").map(({ amount }) => amount),
      );
      const currentAmount = money(deposits.minus(withdrawals));
      const targetAmount = money(goal.targetAmount);
      const progress = targetAmount.isPositive()
        ? Math.min(currentAmount.div(targetAmount).mul(100).toNumber(), 100)
        : 0;
      const missingAmount = money(targetAmount.minus(currentAmount));

      return {
        ...goal,
        currentAmount,
        missingAmount: missingAmount.isNegative() ? money(0) : missingAmount,
        progress,
      };
    }),
  };
}
