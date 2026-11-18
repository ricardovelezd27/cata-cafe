import { Badge } from "@/components/ui/Badge";

const FORMAT_LABELS: Record<string, string> = {
  descriptive: "DESCRIPTIVO",
  affective: "AFECTIVO",
  combined: "COMBINADO",
};

interface FormatBadgeProps {
  format: string;
}

export function FormatBadge({ format }: FormatBadgeProps) {
  const label = FORMAT_LABELS[format] ?? format.toUpperCase();
  // DESIGN.md "Colours for people, processes and formats": a format is a
  // neutral Badge, with no colour per format (T5, E-01).
  return <Badge tone="neutral">{label}</Badge>;
}
