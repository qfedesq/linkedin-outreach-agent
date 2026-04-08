"use client";

/**
 * DynamicWidgetRenderer
 *
 * Renders agent-created dashboard widgets from the DynamicWidget DSL.
 * Supported types: stat_card, bar_chart, table, funnel, kpi_grid
 *
 * Drag-and-drop + resizable layout via react-grid-layout.
 * Layout is persisted to localStorage per campaign.
 */

import { useEffect, useState, useCallback } from "react";
import { GridLayout, type Layout, type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Loader2, Trash2, BarChart2, Table2, TrendingUp, Hash, GripVertical, Lock, Unlock } from "lucide-react";
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
  compact?: boolean;
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

// DynamicWidget — renders content only (Card shell is provided by the grid item)
export function DynamicWidget({ widget, campaignId, compact }: WidgetProps) {
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

  if (compact) return null; // too small to show content

  if (loading) return (
    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading...
    </div>
  );
  if (error) return <p className="text-xs text-destructive py-2 truncate">{error}</p>;
  if (data === null) return null;

  return (
    <div className="h-full overflow-auto">
      {widget.widgetType === "stat_card" && <StatCard data={data} cfg={cfg} />}
      {widget.widgetType === "bar_chart" && <BarChartWidget data={Array.isArray(data) ? data : []} cfg={cfg} />}
      {widget.widgetType === "table" && <TableWidget data={Array.isArray(data) ? data : []} cfg={cfg} />}
      {widget.widgetType === "funnel" && <FunnelWidget data={Array.isArray(data) ? data : []} cfg={cfg} />}
      {widget.widgetType === "kpi_grid" && <KpiGrid data={data} cfg={cfg} />}
      {!["stat_card", "bar_chart", "table", "funnel", "kpi_grid"].includes(widget.widgetType) && (
        <pre className="text-xs text-muted-foreground overflow-auto max-h-24">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}

// ─────────────────────── Layout helpers ───────────────────────

const GRID_COLS = 12;
const ROW_HEIGHT = 90;
const LAYOUT_STORAGE_KEY = (cid?: string) => `widget_layout_${cid ?? "global"}`;

// Default sizes per widget type (in grid units)
const DEFAULT_SIZES: Record<string, { w: number; h: number }> = {
  stat_card: { w: 3, h: 2 },
  bar_chart: { w: 6, h: 3 },
  table:     { w: 6, h: 3 },
  funnel:    { w: 4, h: 3 },
  kpi_grid:  { w: 6, h: 2 },
};

function buildDefaultLayout(widgets: DynamicWidgetConfig[]): LayoutItem[] {
  let col = 0;
  let row = 0;
  return widgets.map(w => {
    const { w: gw, h: gh } = DEFAULT_SIZES[w.widgetType] ?? { w: 4, h: 2 };
    if (col + gw > GRID_COLS) { col = 0; row += 2; }
    const item: LayoutItem = { i: w.id, x: col, y: row, w: gw, h: gh, minW: 2, minH: 1 };
    col += gw;
    return item;
  });
}

function loadLayout(widgets: DynamicWidgetConfig[], cid?: string): LayoutItem[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LAYOUT_STORAGE_KEY(cid)) : null;
    if (!raw) return buildDefaultLayout(widgets);
    const saved: LayoutItem[] = JSON.parse(raw);
    // Merge: keep saved positions for known widgets, add defaults for new ones
    const savedMap = new Map(saved.map(l => [l.i, l]));
    const defaults = buildDefaultLayout(widgets.filter(w => !savedMap.has(w.id)));
    return [
      ...widgets.filter(w => savedMap.has(w.id)).map(w => ({ ...savedMap.get(w.id)!, minW: 2, minH: 1 })),
      ...defaults,
    ];
  } catch { return buildDefaultLayout(widgets); }
}

function saveLayout(layout: LayoutItem[], cid?: string) {
  try { localStorage.setItem(LAYOUT_STORAGE_KEY(cid), JSON.stringify(layout)); } catch {}
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
  const [editMode, setEditMode] = useState(false);
  const [layout, setLayout] = useState<LayoutItem[]>(() => loadLayout(widgets, campaignId));
  const [gridWidth, setGridWidth] = useState(800);
  const gridRef = useCallback((node: HTMLDivElement | null) => {
    if (node) setGridWidth(node.offsetWidth);
  }, []);

  // Re-init layout when widgets list changes (new widget added)
  useEffect(() => {
    setLayout(prev => {
      const existing = new Set(prev.map(l => l.i));
      const newWidgets = widgets.filter(w => !existing.has(w.id));
      if (!newWidgets.length) return prev;
      const newDefaults = buildDefaultLayout(newWidgets);
      const updated = [...prev, ...newDefaults];
      saveLayout(updated, campaignId);
      return updated;
    });
  }, [widgets, campaignId]);

  const handleLayoutChange = (newLayout: Layout) => {
    const mutable = [...newLayout] as LayoutItem[];
    setLayout(mutable);
    saveLayout(mutable, campaignId);
  };

  if (!widgets.length) return null;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Custom Widgets
        </p>
        <button
          onClick={() => setEditMode(e => !e)}
          className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
            editMode
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          title={editMode ? "Lock layout" : "Edit layout — drag to rearrange, resize from corners"}
        >
          {editMode ? <Unlock className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
          {editMode ? "Lock" : "Edit"}
        </button>
      </div>

      {/* Grid */}
      <div ref={gridRef} className="w-full">
        <GridLayout
          layout={layout as Layout}
          width={gridWidth}
          onLayoutChange={handleLayoutChange}
          gridConfig={{ cols: GRID_COLS, rowHeight: ROW_HEIGHT, margin: [8, 8], containerPadding: [0, 0], maxRows: Infinity }}
          dragConfig={{ enabled: editMode, handle: ".widget-drag-handle" }}
          resizeConfig={{ enabled: editMode, handles: ["se", "sw"] }}
          className={editMode ? "rgl-edit-mode" : ""}
        >
          {widgets.map(w => {
            const layoutItem = layout.find(l => l.i === w.id);
            const isSmall = layoutItem ? layoutItem.h <= 1 : false;
            return (
              <div key={w.id} className="overflow-hidden rounded-lg border border-border bg-card">
                {/* Drag handle header */}
                <div className={`widget-drag-handle flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    {editMode && <GripVertical className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
                    <WidgetIcon type={w.widgetType} />
                    <span className="text-xs font-semibold text-foreground truncate">{w.name}</span>
                  </div>
                  {onDelete && (
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={() => onDelete(w.id)}
                      className="h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-colors ml-1 shrink-0"
                      title="Remove widget"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  )}
                </div>
                {/* Widget body */}
                {!isSmall && (
                  <div className="px-3 py-2 overflow-hidden" style={{ height: `calc(100% - 37px)` }}>
                    <DynamicWidget widget={w} campaignId={campaignId} compact={isSmall} />
                  </div>
                )}
              </div>
            );
          })}
        </GridLayout>
      </div>

      {/* Edit mode hint */}
      {editMode && (
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          Drag to move · Resize from corners · Click Lock when done
        </p>
      )}
    </div>
  );
}
