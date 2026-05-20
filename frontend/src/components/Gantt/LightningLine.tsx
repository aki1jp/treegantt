interface Props {
  x: number;
  height: number;
  color: string;
  label: string;
}

export function LightningLine({ x, height, color, label }: Props) {
  return (
    <g>
      <line x1={x} y1={0} x2={x} y2={height} stroke={color} strokeWidth={2} strokeDasharray="4 3" />
      <text x={x + 4} y={14} fontSize={10} fill={color} fontWeight={600}>{label}</text>
    </g>
  );
}
