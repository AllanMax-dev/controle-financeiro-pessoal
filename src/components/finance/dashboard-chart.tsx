"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartDatum = {
  gastos: number;
  name: string;
  recebimentos: number;
  saldo: number;
};

function shortCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);
}

export function FinanceDashboardChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="dashboard-chart">
      <ResponsiveContainer height={240} width="100%">
        <BarChart data={data} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
          <CartesianGrid stroke="var(--color-chart-grid)" strokeDasharray="3 6" vertical={false} />
          <XAxis axisLine={false} dataKey="name" tickLine={false} />
          <YAxis axisLine={false} tickFormatter={shortCurrency} tickLine={false} width={64} />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              boxShadow: "var(--shadow-sm)",
              color: "var(--ink)",
            }}
            cursor={{ fill: "var(--surface-muted)" }}
            formatter={(value) => shortCurrency(Number(value))}
          />
          <Bar dataKey="saldo" fill="var(--primary)" name="Saldo" radius={[8, 8, 0, 0]} />
          <Bar dataKey="recebimentos" fill="var(--income)" name="Recebimentos" radius={[8, 8, 0, 0]} />
          <Bar dataKey="gastos" fill="var(--expense)" name="Gastos" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
