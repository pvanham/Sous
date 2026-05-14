import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AudiencePlaceholder() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Audience</CardTitle>
          <Badge variant="outline">Phase 3</Badge>
        </div>
        <CardDescription>
          Audience targeting UI will be added in the next phase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded border border-dashed border-stone-300 p-3 text-sm dark:border-white/20">
          Everyone (Global)
        </div>
      </CardContent>
    </Card>
  );
}
