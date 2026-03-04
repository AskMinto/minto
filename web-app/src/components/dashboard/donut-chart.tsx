"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { CHART_COLORS } from "@/lib/constants";

interface DataItem {
  label: string;
  value: number;
  pct: number;
}

interface Props {
  data: DataItem[];
  title: string;
  colorMap?: Record<string, string>;
  maxLegend?: number;
}

export function DonutChart({ data, title, colorMap, maxLegend = 8 }: Props) {
  if (!data.length) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-minto-text-muted">No data</p>
      </div>
    );
  }

  const getColor = (item: DataItem, index: number) =>
    colorMap?.[item.label] ?? CHART_COLORS[index % CHART_COLORS.length];

  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <div>
      <h4 className="text-sm font-medium text-minto-text mb-3">{title}</h4>
      <div className="flex items-center gap-5">
        <div className="w-[130px] h-[130px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sorted}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={60}
                paddingAngle={2}
                strokeWidth={0}
              >
                {sorted.map((item, i) => (
                  <Cell key={item.label} fill={getColor(item, i)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1">
          {sorted.slice(0, maxLegend).map((item, i) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getColor(item, i) }}
              />
              <span className="text-minto-text-secondary truncate flex-1">
                {item.label}
              </span>
              <span className="text-minto-text font-medium tabular-nums">
                {item.pct?.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
