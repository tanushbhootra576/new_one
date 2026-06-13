import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function ProgressWidget({ adherenceScore }: { adherenceScore: number }) {
  return (
    <Card className="col-span-1 border-alan-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-alan-text-primary">
          <Activity className="h-4 w-4 text-alan-indigo" />
          Recovery Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between mb-2">
          <span className="text-3xl font-bold text-alan-text-primary">{adherenceScore}%</span>
          <span className="text-xs text-alan-text-muted pb-1">Adherence</span>
        </div>
        <Progress value={adherenceScore} className="h-2 bg-alan-surface" />
      </CardContent>
    </Card>
  );
}
