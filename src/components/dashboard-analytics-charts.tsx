"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/format";

type MonthlyEvolutionItem = {
  expense: number;
  income: number;
  key: string;
  label: string;
  result: number;
};

type BudgetComparisonItem = {
  id: string;
  name: string;
  planned: number;
  realized: number;
};

function compactCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 1000)} mil`;
  }

  return formatCurrency(value);
}

function tooltipCurrency(value: unknown): string {
  return formatCurrency(Number(value));
}

export function MonthlyEvolutionChart({ data }: { data: MonthlyEvolutionItem[] }) {
  return (
    <div className="analytics-chart" aria-label="Evolução mensal">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#dce2dc" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} />
          <YAxis tickFormatter={compactCurrency} tickLine={false} width={72} />
          <Tooltip formatter={tooltipCurrency} />
          <Legend />
          <Line dataKey="income" name="Receitas" stroke="#187344" strokeWidth={3} type="monotone" />
          <Line dataKey="expense" name="Despesas" stroke="#9f3f3f" strokeWidth={3} type="monotone" />
          <Line dataKey="result" name="Resultado" stroke="#405b9b" strokeWidth={3} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BudgetComparisonChart({ data }: { data: BudgetComparisonItem[] }) {
  if (data.length === 0) {
    return (
      <div className="compact-empty">
        <p>Os orçamentos e despesas realizadas aparecerão aqui.</p>
      </div>
    );
  }

  return (
    <div className="analytics-chart" aria-label="Planejado versus realizado">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.slice(0, 6)} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#dce2dc" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} />
          <YAxis tickFormatter={compactCurrency} tickLine={false} width={72} />
          <Tooltip formatter={tooltipCurrency} />
          <Legend />
          <Bar dataKey="planned" fill="#405b9b" name="Planejado" radius={[8, 8, 0, 0]} />
          <Bar dataKey="realized" fill="#9f3f3f" name="Realizado" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
