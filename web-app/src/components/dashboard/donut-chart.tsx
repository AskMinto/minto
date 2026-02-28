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
}

export function DonutChart({ data, title }: Props) {
  if (!data.length) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-minto-text-muted">No data</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-minto-text mb-3">{title}</h4>
      <div className="flex items-center gap-4">
        <div className="w-[120px] h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={55}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1.5">
          {data.slice(0, 5).map((item, i) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="text-minto-text-secondary truncate flex-1">{item.label}</span>
              <span className="text-minto-text-muted">{item.pct?.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
