/** 工作台小型图表：sparkline、季度柱状图、资金流正负柱状图。数据即 Tushare 口径。 */

export function FinanceSparkline({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <div className="h-5 w-11" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 44;
  const h = 20;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = up ? "var(--finance-up)" : "var(--finance-down)";
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true">
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={color} opacity="0.12" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

interface BarChartProps {
  /** [{label, value}]，value 单位由调用方定，label 为轴标签。 */
  data: Array<{ label: string; value: number | null }>;
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

/** 通用正负柱状图（资金流）与非负柱状图（营收/净利）。 */
export function FinanceBarChart({
  data,
  height = 110,
  color = "var(--color-primary)",
  formatValue = (v) => String(v),
}: BarChartProps) {
  const valid = data.filter((d) => d.value !== null) as Array<{ label: string; value: number }>;
  if (valid.length < 2) return null;
  const W = 320;
  const H = height;
  const padB = 14;
  const hasNegative = valid.some((d) => d.value < 0);
  const maxAbs = Math.max(...valid.map((d) => Math.abs(d.value))) * 1.15 || 1;
  const zeroY = hasNegative ? (H - padB) / 2 : H - padB;
  const scale = hasNegative ? (H - padB) / 2 / maxAbs : (H - padB - 4) / maxAbs;
  const bw = W / valid.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-hidden="true">
      {valid.map((d, i) => {
        const h = Math.max(1.5, Math.abs(d.value) * scale);
        const x = i * bw + bw * 0.22;
        const w = bw * 0.56;
        const y = d.value >= 0 ? zeroY - h : zeroY;
        const barColor = hasNegative ? (d.value >= 0 ? "var(--finance-up)" : "var(--finance-down)") : color;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={x} y={y} width={w} height={h} rx="2.5" fill={i === valid.length - 1 ? barColor : "var(--color-surface-hover)"} stroke="var(--color-border)" />
            <text x={x + w / 2} y={d.value >= 0 ? y - 3 : y + h + 9} fill="var(--color-foreground-subtle)" fontSize="9" textAnchor="middle" fontFamily="ui-monospace,Menlo,monospace">
              {formatValue(d.value)}
            </text>
            <text x={x + w / 2} y={H - 2} fill="var(--color-foreground-subtlest)" fontSize="9" textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
      {hasNegative ? (
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--color-border)" strokeWidth="1" />
      ) : null}
    </svg>
  );
}
