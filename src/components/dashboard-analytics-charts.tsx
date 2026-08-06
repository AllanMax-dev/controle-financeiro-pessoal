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

function ChartTooltipContent({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ color?: string; name?: string; value?: unknown }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.name}>
          <i style={{ backgroundColor: item.color }} />
          {item.name}: {tooltipCurrency(item.value)}
        </span>
      ))}
    </div>
  );
}

export function MonthlyEvolutionChart({ data }: { data: MonthlyEvolutionItem[] }) {
  if (data.length === 0) {
    return (
      <div className="chart-empty chart-empty-large">
        <p>A evolução mensal aparecerá quando houver lançamentos no histórico.</p>
      </div>
    );
  }

  return (
    <div className="analytics-chart" aria-label="Evolução mensal">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="label" tickLine={false} />
          <YAxis axisLine={false} tickFormatter={compactCurrency} tickLine={false} width={72} />
          <Tooltip content={<ChartTooltipContent />} />
          <Legend />
          <Line
            activeDot={{ r: 6 }}
            dataKey="income"
            dot={{ r: 3 }}
            name="Receitas"
            stroke="#15803d"
            strokeWidth={3}
            type="monotone"
          />
          <Line
            activeDot={{ r: 6 }}
            dataKey="expense"
            dot={{ r: 3 }}
            name="Despesas"
            stroke="#b42318"
            strokeWidth={3}
            type="monotone"
          />
          <Line
            activeDot={{ r: 6 }}
            dataKey="result"
            dot={{ r: 3 }}
            name="Resultado"
            stroke="#175cd3"
            strokeWidth={3}
            type="monotone"
          />
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
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="name" tickLine={false} />
          <YAxis axisLine={false} tickFormatter={compactCurrency} tickLine={false} width={72} />
          <Tooltip content={<ChartTooltipContent />} />
          <Legend />
          <Bar dataKey="planned" fill="#175cd3" name="Planejado" radius={[8, 8, 0, 0]} />
          <Bar dataKey="realized" fill="#b42318" name="Realizado" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
