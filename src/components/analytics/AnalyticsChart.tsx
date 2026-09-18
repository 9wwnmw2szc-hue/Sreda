"use client";
import type { ChartSpec } from "@/server/analytics/charts";

const COLORS = ["#376b46", "#70aadb", "#d6a34a", "#da8b9c", "#60ac6d", "#8b7bb8"];

export function AnalyticsChart({ chart }: { chart: ChartSpec }) {
  if (!chart.series.length || !chart.categories.length) {
    return (
      <div className="analytics-chart analytics-chart--empty">
        <h3 className="text-card-title">{chart.title}</h3>
        <p className="text-body-sm">
          {chart.emptyMessage ?? "Пока недостаточно данных для графика."}
        </p>
      </div>
    );
  }

  const width = 560;
  const height = 220;
  const pad = { t: 16, r: 12, b: 36, l: 36 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(
    1,
    ...chart.series.flatMap((s) => s.values),
  );

  if (chart.kind === "donut") {
    const values = chart.series[0]?.values ?? [];
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = width / 2;
    const cy = height / 2 - 8;
    const r = 64;
    const r0 = 36;
    const starts = values.map((_, i) =>
      values
        .slice(0, i)
        .reduce((sum, v) => sum + (v / total) * Math.PI * 2, -Math.PI / 2),
    );
    const arcs = values.map((v, i) => {
      const start = starts[i]!;
      const sweep = (v / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(start + sweep);
      const y2 = cy + r * Math.sin(start + sweep);
      const ix1 = cx + r0 * Math.cos(start + sweep);
      const iy1 = cy + r0 * Math.sin(start + sweep);
      const ix2 = cx + r0 * Math.cos(start);
      const iy2 = cy + r0 * Math.sin(start);
      const large = sweep > Math.PI ? 1 : 0;
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r0} ${r0} 0 ${large} 0 ${ix2} ${iy2} Z`;
      return {
        d,
        color: COLORS[i % COLORS.length]!,
        label: chart.categories[i]!,
        value: v,
      };
    });
    return (
      <div className="analytics-chart">
        <h3 className="text-card-title">{chart.title}</h3>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title}>
          {arcs.map((a, i) => (
            <path key={i} d={a.d} fill={a.color}>
              <title>{`${a.label}: ${a.value}`}</title>
            </path>
          ))}
        </svg>
        <ul className="analytics-chart__legend">
          {arcs.map((a, i) => (
            <li key={i}>
              <i style={{ background: a.color }} />
              <span>{a.label}</span>
              <strong>{a.value}</strong>
            </li>
          ))}
        </ul>
        {chart.explanation ? (
          <p className="text-caption analytics-chart__explain">{chart.explanation}</p>
        ) : null}
      </div>
    );
  }

  const n = chart.categories.length;
  const groupW = innerW / Math.max(1, n);
  const seriesCount = chart.series.length;

  return (
    <div className="analytics-chart">
      <h3 className="text-card-title">{chart.title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chart.title}>
        {[0, 0.5, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={pad.l}
                x2={width - pad.r}
                y1={y}
                y2={y}
                stroke="var(--border-light)"
              />
              <text x={4} y={y + 4} className="analytics-chart__axis">
                {Math.round(max * t)}
              </text>
            </g>
          );
        })}
        {chart.kind === "line"
          ? chart.series.map((s, si) => {
              const pts = s.values
                .map((v, i) => {
                  const x = pad.l + groupW * i + groupW / 2;
                  const y = pad.t + innerH * (1 - v / max);
                  return `${x},${y}`;
                })
                .join(" ");
              return (
                <g key={s.key}>
                  <polyline
                    fill="none"
                    stroke={COLORS[si % COLORS.length]}
                    strokeWidth="2.5"
                    points={pts}
                  />
                  {s.values.map((v, i) => {
                    const x = pad.l + groupW * i + groupW / 2;
                    const y = pad.t + innerH * (1 - v / max);
                    return (
                      <circle key={i} cx={x} cy={y} r="3.5" fill={COLORS[si % COLORS.length]}>
                        <title>{`${chart.categories[i]}: ${v}`}</title>
                      </circle>
                    );
                  })}
                </g>
              );
            })
          : chart.categories.map((cat, i) => {
              if (chart.kind === "stacked_bar") {
                let stack = 0;
                return (
                  <g key={cat}>
                    {chart.series.map((s, si) => {
                      const v = s.values[i] ?? 0;
                      const h = (v / max) * innerH;
                      const x = pad.l + groupW * i + groupW * 0.15;
                      const y = pad.t + innerH - ((stack + v) / max) * innerH;
                      stack += v;
                      return (
                        <rect
                          key={s.key}
                          x={x}
                          y={y}
                          width={groupW * 0.7}
                          height={h}
                          fill={COLORS[si % COLORS.length]}
                          rx="3"
                        >
                          <title>{`${cat} · ${s.label}: ${v}`}</title>
                        </rect>
                      );
                    })}
                  </g>
                );
              }
              const barW = (groupW * 0.7) / seriesCount;
              return (
                <g key={cat}>
                  {chart.series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    const h = (v / max) * innerH;
                    const x =
                      pad.l + groupW * i + groupW * 0.15 + barW * si;
                    const y = pad.t + innerH - h;
                    return (
                      <rect
                        key={s.key}
                        x={x}
                        y={y}
                        width={Math.max(2, barW - 2)}
                        height={h}
                        fill={COLORS[si % COLORS.length]}
                        rx="3"
                      >
                        <title>{`${cat} · ${s.label}: ${v}`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
        {chart.categories.map((cat, i) => {
          if (n > 14 && i % Math.ceil(n / 8) !== 0) return null;
          const x = pad.l + groupW * i + groupW / 2;
          return (
            <text
              key={cat + i}
              x={x}
              y={height - 10}
              textAnchor="middle"
              className="analytics-chart__axis"
            >
              {cat}
            </text>
          );
        })}
      </svg>
      {chart.series.length > 1 ? (
        <ul className="analytics-chart__legend">
          {chart.series.map((s, i) => (
            <li key={s.key}>
              <i style={{ background: COLORS[i % COLORS.length] }} />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {chart.explanation ? (
        <p className="text-caption analytics-chart__explain">{chart.explanation}</p>
      ) : null}
    </div>
  );
}
