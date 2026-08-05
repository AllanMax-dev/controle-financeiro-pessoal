"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { formatCurrency } from "@/lib/format";

type CategoryChartItem = {
  color: string;
  id: string;
  name: string;
  value: number;
};

export function ExpenseCategoryChart({ data }: { data: CategoryChartItem[] }) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>As despesas realizadas aparecerão aqui agrupadas por categoria.</p>
      </div>
    );
  }

  return (
    <div className="chart-layout">
      <div className="chart-visual" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="62%" outerRadius="92%" paddingAngle={3}>
              {data.map((item) => (
                <Cell key={item.id} fill={item.color} stroke="transparent" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="chart-legend" aria-label="Despesas por categoria">
        {data.slice(0, 6).map((item) => (
          <li key={item.id}>
            <span className="legend-dot" style={{ backgroundColor: item.color }} />
            <span>{item.name}</span>
            <strong>{formatCurrency(item.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
