import type { DailyPoint } from "@/lib/dashboard";

/**
 * A small trend line with a soft gradient fill under it.
 *
 * Inline SVG on purpose - no chart library, so it costs nothing at runtime and
 * inherits the card's colour. Every line on the dashboard plots a real daily
 * series; none is decorative.
 */
export function Sparkline({
  points,
  stroke,
  gradientId,
  className = "",
}: {
  points: DailyPoint[];
  /** Any CSS colour - matched to the card's accent. */
  stroke: string;
  /** Must be unique per instance; SVG gradient ids are document-global. */
  gradientId: string;
  className?: string;
}) {
  // Two points is the minimum that describes a direction.
  if (points.length < 2) return null;

  const W = 100;
  const H = 32;
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series would divide by zero and collapse onto one edge; centring it
  // reads correctly as "no change".
  const span = max - min || 1;
  const flat = max === min;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = flat ? H / 2 : H - ((p.value - min) / span) * (H - 4) - 2;
    return { x, y };
  });

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden
      // preserveAspectRatio="none" stretches the stroke; this keeps it even.
      vectorEffect="non-scaling-stroke"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="1.8" fill={stroke} />
    </svg>
  );
}
