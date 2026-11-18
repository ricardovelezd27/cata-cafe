import { Badge } from "@/components/ui/Badge";

/**
 * A session's format as a neutral Badge (DESIGN.md "Colours for people,
 * processes and formats": no colour per format, T5, E-01). The caller passes
 * the translated name (`session.formats.*`), in sentence case: the old
 * Spanish-only capitals ("COMBINADO") printed in English too (P4a, I-03).
 */
export function FormatBadge({ label }: { label: string }) {
  return <Badge tone="neutral">{label}</Badge>;
}
