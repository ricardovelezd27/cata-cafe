const FORMAT_STYLES: Record<string, string> = {
  descriptive: "bg-[#E8F0E8] text-[#3D5A3E] border border-[#6B8F71]",
  affective: "bg-[#FEF3E2] text-[#C17817] border border-[#C17817]",
  combined: "bg-[#F0EBF8] text-[#7B3FA0] border border-[#7B3FA0]",
};

const FORMAT_LABELS: Record<string, string> = {
  descriptive: "DESCRIPTIVO",
  affective: "AFECTIVO",
  combined: "COMBINADO",
};

interface FormatBadgeProps {
  format: string;
}

export function FormatBadge({ format }: FormatBadgeProps) {
  const styles = FORMAT_STYLES[format] ?? "bg-[#F0EDE6] text-brown-mid border border-[#E8E0D0]";
  const label = FORMAT_LABELS[format] ?? format.toUpperCase();
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${styles}`}>
      {label}
    </span>
  );
}
