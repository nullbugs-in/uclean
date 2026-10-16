import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * One operational number with the label that makes it mean something.
 *
 * Kept in the shared panel folder rather than beside the staff dashboard,
 * because the admin panel answers the same "what needs attention" question and
 * should not grow a second card that only looks the same.
 *
 * The icon sits on a neutral tint rather than the brand colour: the figures
 * here are the point, and a second accent competing with the charts just makes
 * both harder to scan.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center gap-2">
          <span className="bg-muted text-foreground flex size-7 items-center justify-center rounded-md">
            <Icon aria-hidden className="size-4" />
          </span>
          <CardTitle className="text-muted-foreground text-xs font-medium">
            {label}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="px-4">
        <p className="text-3xl leading-none font-semibold tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="text-muted-foreground mt-2 text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
