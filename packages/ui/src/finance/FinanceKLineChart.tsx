import { useMemo } from "react";
import type { FinanceDailyBar } from "@zcode/services";

interface FinanceKLineChartProps {
  bars: FinanceDailyBar[];
  height?: number;
}

/**
 * 轻量 K 线图（不复权日线 + 成交量副图）。
 * 数据口径即 Tushare `daily` 返回值，本组件不做任何指标叠加。
 * 涨跌色用 A 股惯例红涨绿跌，色值取主题语义 token（destructive=红 / success=绿），
 * 经外层容器注入 --finance-up/--finance-down，亮暗主题自动适配。
 */
export function FinanceKLineChart({ bars, height = 360 }: FinanceKLineChartProps) {
  const data = useMemo(() => [...bars].reverse(), [bars]); // 旧→新
  if (data.length < 2) return null;

  const W = 900;
  const H = height;
  const priceH = H - 62;
  const volH = 46;
  const gap = 8;
  const padR = 56;
  const padL = 4;
  const padT = 10;
  const volTop = priceH + gap;
  const volBottom = volTop + volH;

  const lows = data.map((d) => d.low ?? 0);
  const highs = data.map((d) => d.high ?? 0);
  const min = Math.min(...lows) * 0.995;
  const max = Math.max(...highs) * 1.005;
  const plotW = W - padR - padL;
  const cw = plotW / data.length;
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (priceH - padT * 2);
  const maxVol = Math.max(...data.map((d) => d.volume_hand ?? 0), 1);
  const vy = (v: number) => volBottom - (v / maxVol) * (volH - 4);

  let gridLines = "";
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    const yy = y(v);
    gridLines += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--finance-grid)" stroke-width="1"/>`;
    gridLines += `<text x="${W - padR + 6}" y="${yy + 3}" fill="var(--finance-axis)" font-size="10" font-family="ui-monospace,Menlo,monospace">${v.toFixed(0)}</text>`;
  }

  const candles = data
    .map((d, i) => {
      const x = padL + i * cw + cw / 2;
      const up = (d.close ?? 0) >= (d.open ?? 0);
      const c = up ? "var(--finance-up)" : "var(--finance-down)";
      const yo = y(d.open ?? 0);
      const yc = y(d.close ?? 0);
      const top = Math.min(yo, yc);
      const h = Math.max(1.2, Math.abs(yo - yc));
      const vol = d.volume_hand ?? 0;
      return (
        `<line x1="${x}" y1="${y(d.high ?? 0)}" x2="${x}" y2="${y(d.low ?? 0)}" stroke="${c}" stroke-width="1"/>` +
        `<rect x="${x - cw * 0.3}" y="${top}" width="${cw * 0.6}" height="${h}" fill="${up ? "transparent" : c}" stroke="${c}" stroke-width="1" rx="0.5"/>` +
        `<rect x="${x - cw * 0.3}" y="${vy(vol)}" width="${cw * 0.6}" height="${Math.max(0.5, volBottom - vy(vol))}" fill="${c}" opacity="0.75"/>`
      );
    })
    .join("");

  const last = data[data.length - 1];
  if (!last) return null;
  const lastUp = (last.close ?? 0) >= (last.open ?? 0);
  const ly = y(last.close ?? 0);
  const lastPriceTag =
    `<line x1="${padL}" y1="${ly}" x2="${W - padR}" y2="${ly}" stroke="var(--finance-up)" stroke-dasharray="3 3" opacity="0.65" stroke-width="1"/>` +
    `<rect x="${W - padR + 2}" y="${ly - 8}" width="50" height="16" rx="3" fill="${lastUp ? "var(--finance-up)" : "var(--finance-down)"}"/>` +
    `<text x="${W - padR + 27}" y="${ly + 3.5}" fill="#fff" font-size="10" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="600">${(last.close ?? 0).toFixed(2)}</text>`;

  const dateTicks = [0, Math.floor(data.length * 0.33), Math.floor(data.length * 0.66), data.length - 1]
    .map((i) => {
      const x = padL + i * cw + cw / 2;
      const label = data[i]?.date?.replace(/^(\d{4})(\d{2})(\d{2})$/, "$2-$3") ?? "";
      return `<text x="${x}" y="${H - 4}" fill="var(--finance-axis)" font-size="9" text-anchor="middle" font-family="ui-monospace,Menlo,monospace">${label}</text>`;
    })
    .join("");

  const volumeLabel = `<text x="${padL + 2}" y="${volTop + 9}" fill="var(--finance-axis)" font-size="9">成交量(手)</text>`;

  return (
    <div
      // A 股红涨绿跌：复用主题语义色，亮暗主题下都有足够对比度。
      style={
        {
          "--finance-up": "var(--color-destructive)",
          "--finance-down": "var(--color-success)",
          "--finance-grid": "var(--color-border)",
          "--finance-axis": "var(--color-foreground-subtlest)",
        } as React.CSSProperties
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="daily k-line chart"
        className="w-full"
        style={{ height }}
        dangerouslySetInnerHTML={{
          __html: gridLines + candles + volumeLabel + lastPriceTag + dateTicks,
        }}
      />
    </div>
  );
}
