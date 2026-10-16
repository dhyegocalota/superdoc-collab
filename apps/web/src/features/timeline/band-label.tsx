export function BandLabel({ name, x, y }: { name: string; x: number; y: number }) {
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-foreground text-xs">
      {name}
    </text>
  );
}
