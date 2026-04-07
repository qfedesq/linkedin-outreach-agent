"use client";

/**
 * DynamicWidgetRenderer
 *
 * Renders agent-created dashboard widgets from the DynamicWidget DSL.
 * Supported types: stat_card, bar_chart, table, funnel, kpi_grid
 *
 * Each widget fetches its own data from /api/widgets/[id]/data
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, BarChart2, Table2, TrendingUp, Hash } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─────────────────────── Types ───────────────────────

export interface DynamicWidgetConfig {
  id: string;
  name: string;
  description?: string | null;
  widgetType: string;
  displayConfig: Record<string, unknown>;
  campaignId?: string | null;
}

interface WidgetProps {
  widget: DynamicWidgetConfig;
  campaignId?: string;
  onDelete?: (id: string) => void;
}

// ─────────────────────── Colour palette ───────────────────────

const CHART_COLORS = [
  "#6366f1", "#22d3ee", "#a3e635", "#f59e0b", "#f87171",
  "#34d399", "#c084fc", "#fb923c",
];

// ─────────────────────── Formatters ───────────────────────

function formatValue(val: unknown, fmt?: string): string {
  if (val === null || val === undefined) return "—";
  const n = Number(val);
  if (!isNaN(n)) {
    if (fmt === "percent") return `${n.toFixed(1)}%`;
    if (fmt === "currency") return `$${n.toLocaleString()}`;
    return n.toLocaleString();
  }
  if (fmt === "date" && typeof val === "string") {
    try { return new Date(val).toLocaleDateString(); } catch { return val; }
  }
  return String(val);
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  // Support dot notation like "_count.id"
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

// ─────────────────────── Widget sub-renderers ───────────────────────

function StatCard({ data, cfg }: { data: unknown; cfg: Record<string, unknown> }) {
  const label = (cfg.label as string) || "Value";
  const fmt = cfg.format as string | undefined;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-2xl font-bold text-foreground">{formatValue(data, fmt)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function BarChartWidget({ data, cfg }: { data: unknown[]; cfg: Record<string, unknown> }) {
  const xKey = (cfg.xKey as string) || "name";
  const yKey = (cfg.yKey as string) || "value";
  const title = cfg.title as string | undefined;

  // Normalise: resolve nested yKey (e.g. "_count.id")
  const chartData = data.map(row => {
    const r = row as Record<string, unknown>;
    return {
      name: String(r[xKey] ?? "?"),
      value: Number(getNestedValue(r, yKey) ?? 0),
    };
  });

  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: "4px 8px" }}
            formatter={(v) => [typeof v === "number" ? v.toLocaleString() : String(v ?? ""), "Count"]}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TableWidget({ data, cfg }: { data: unknown[]; cfg: Record<string, unknown> }) {
  const title = cfg.title as string | undefined;
  const columns = (cfg.columns as Array<{ key: string; label: string; format?: string }>) || [];

  if (!columns.length || !data.length) {
    return <p className="text-xs text-muted-foreground">No data</p>;
  }

  return (
    <div className="space-y-1.5">
      {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              {columns.map(col => (
                <th key={col.key} className="text-left text-[10px] font-medium text-muted-foreground pb-1 pr-3">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 8).map((row, i) => {
              const r = row as Record<string, unknown>;
              return (
                <tr key={i} className="border-b border-border/20 hover:bg-accent/20">
                  {columns.map(col => (
                    <td key={col.key} className="py-1 pr-3 text-foreground truncate max-w-[120px]">
                      {formatValue(r[col.key], col.format)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelWidget({ data, cfg }: { data: unknown[]; cfg: Record<string, unknown> }) {
  const title = cfg.title as string | undefined;
  const stages = (cfg.stages as Array<{ key: string; label: string }>) || [];

  // data is typically an array of groupBy results or multiple count results
  const stageMap = new Map<string, number>();
  if (Array.isArray(data)) {
    data.forEach(row => {
      const r = row as Record<string, unknown>;
      const status = r.status as string || r.key as string;
      const _count = r._count as Record<string, unknown> | undefined;
      const count = Number(_count?.id ?? r.count ?? r.value ?? 0);
      if (status) stageMap.set(status, count);
    });
  }

  const stageList = stages.length > 0
    ? stages.map(s => ({ label: s.label, count: stageMap.get(s.key) ?? 0 }))
    : [...stageMap.entries()].map(([k, v]) => ({ label: k, count: v }));

  const max = Math.max(...stageList.map(s => s.count), 1);

  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
      {stageList.map((stage, i) => (
        <div key={i} className="space-y-0.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">{stage.label}</span>
            <span className="font-medium text-foreground">{stage.count}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(stage.count / max) * 100}%`,
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiGrid({ data, cfg }: { data: unknown; cfg: Record<string, unknown> }) {
  const title = cfg.title as string | undefined;
  const items = (cfg.items as Array<{ key: string; label: string; format?: string }>) || [];
  const record = (data && typeof data === "object" && !Array.isArray(data))
    ? data as Record<string, unknown>
    : {};

  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div key={i} className="bg-muted/30 rounded-lg p-2">
            <p className="text-base font-bold text-foreground">{formatValue(record[item.key], item.format)}</p>
            <p className="text-[10px] text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────── Widget icon map ───────────────────────

function WidgetIcon({ type }: { type: string }) {
  switch (type) {
    case "bar_chart": return <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />;
    case "table": return <Table2 className="h-3.5 w-3.5 text-muted-foreground" />;
    case "funnel": return <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />;
    default: return <Hash className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

// ─────────────────────── Main widget renderer ───────────────────────

export function DynamicWidget({ widget, campaignId, onDelete }: WidgetProps) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = campaignId ? `?campaignId=${campaignId}` : "";
    fetch(`/api/widgets/${widget.id}/data${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d.data);
      })
      .catch(() => setError("Failed to load widget data"))
      .finally(() => setLoading(false));
  }, [widget.id, campaignId]);

  const cfg = widget.displayConfig;

  return (
    <Card className="group/widget overflow-hidden">
      <CardHeader className="pb-2 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <WidgetIcon type={widget.widgetType} />
            <CardTitle className="text-xs font-semibold text-foreground truncate">{widget.name}</CardTitle>
          </div>
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover/widget:opacity-100 transition-opacity shrink-0"
              onClick={() => onDelete(widget.id)}
              title="Remove widget"
            >
              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </Button>
          )}
        </div>
        {widget.description && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{widget.description}</p>
        )}
      </CardHeader>
      <CardContent className="pt-3">
        {loading && (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading...
          </div>
        )}
        {error && !loading && (
          <p className="text-xs text-destructive py-2">{error}</p>
        )}
        {!loading && !error && data !== null && (
          <>
            {widget.widgetType === "stat_card" && (
              <StatCard data={data} cfg={cfg} />
            )}
            {widget.widgetType === "bar_chart" && (
              <BarChartWidget data={Array.isArray(data) ? data : []} cfg={cfg} />
            )}
            {widget.widgetType === "table" && (
              <TableWidget data={Array.isArray(data) ? data : []} cfg={cfg} />
            )}
            {widget.widgetType === "funnel" && (
              <FunnelWidget data={Array.isArray(data) ? data : []} cfg={cfg} />
            )}
            {widget.widgetType === "kpi_grid" && (
              <KpiGrid data={data} cfg={cfg} />
            )}
            {!["stat_card", "bar_chart", "table", "funnel", "kpi_grid"].includes(widget.widgetType) && (
              <pre className="text-xs text-muted-foreground overflow-auto max-h-32">
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────── Widget grid ───────────────────────

export function DynamicWidgetGrid({
  widgets,
  campaignId,
  onDelete,
}: {
  widgets: DynamicWidgetConfig[];
  campaignId?: string;
  onDelete?: (id: string) => void;
}) {
  if (!widgets.length) return null;

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Custom Widgets
      </p>
      <div className="grid grid-cols-2 gap-3">
        {widgets.map(w => (
          <DynamicWidget key={w.id} widget={w} campaignId={campaignId} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
