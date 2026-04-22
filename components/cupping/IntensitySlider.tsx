"use client";

export function IntensitySlider({
  value,
  onChange,
  min = 0,
  max = 15,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  const zoneOf = (v: number) => {
    const third = (max - min) / 3;
    if (v <= min + third) return "BAJA";
    if (v <= min + third * 2) return "MEDIA";
    return "ALTA";
  };

  const barColor = (p: number) => {
    if (p <= 33) {
      const t = p / 33;
      return `rgb(${Math.round(180 + t * 14)},${Math.round(200 - t * 38)},${Math.round(170 - t * 70)})`;
    } else if (p <= 66) {
      const t = (p - 33) / 33;
      return `rgb(${Math.round(194 - t * 87)},${Math.round(162 - t * 19)},${Math.round(100 + t * 13)})`;
    } else {
      const t = (p - 66) / 34;
      return `rgb(${Math.round(107 - t * 62)},${Math.round(143 - t * 23)},${Math.round(113 - t * 53)})`;
    }
  };

  const color = barColor(pct);
  const zone = zoneOf(value);

  return (
    <div style={{ paddingTop: 8, paddingBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        {(["BAJA", "MEDIA", "ALTA"] as const).map((z) => (
          <span
            key={z}
            style={{
              fontSize: 10,
              color: "#8B7355",
              letterSpacing: "1.5px",
              fontWeight: 600,
              opacity: zone === z ? 1 : 0.4,
            }}
          >
            {z}
          </span>
        ))}
      </div>
      <div style={{ position: "relative", height: 36 }}>
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 0,
            right: 0,
            height: 10,
            borderRadius: 5,
            background: "#E8E0D0",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 0,
            height: 10,
            borderRadius: "5px 0 0 5px",
            width: `${pct}%`,
            background: `linear-gradient(90deg, #B4C8A8, ${color})`,
            transition: "width 0.1s",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${pct}%`,
            transform: "translateX(-50%)",
            fontSize: 9,
            fontWeight: 700,
            color: "#FFF",
            padding: "2px 8px",
            borderRadius: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            background: color,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {zone}
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={0.1}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            position: "absolute",
            top: 8,
            left: 0,
            width: "100%",
            height: 24,
            cursor: "pointer",
            margin: 0,
            background: "transparent",
            appearance: "none",
            WebkitAppearance: "none",
          }}
        />
      </div>
    </div>
  );
}
