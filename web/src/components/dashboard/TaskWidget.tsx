import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimelineDay } from "@/types/models";

export function TaskWidget({ timeline }: { timeline: TimelineDay[] | null }) {
  // Mock logic: Count items from the first day or flatMap
  const items = timeline?.flatMap(d => d.items) || [];
  const pending = items.filter(i => i.status === "pending").length;
  const missed = items.filter(i => i.status === "missed").length;

  return (
    <Card className="col-span-1 border-alan-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-alan-text-primary">
          <CheckCircle2 className="h-4 w-4 text-alan-success" />
          Tasks Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center justify-center p-3 rounded-card bg-amber-50 border border-amber-100">
            <Clock className="h-5 w-5 text-amber-500 mb-1" />
            <span className="text-2xl font-bold text-amber-700">{pending}</span>
            <span className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold">Pending</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 rounded-card bg-red-50 border border-red-100">
            <AlertCircle className="h-5 w-5 text-red-500 mb-1" />
            <span className="text-2xl font-bold text-red-700">{missed}</span>
            <span className="text-[10px] text-red-600 uppercase tracking-wider font-semibold">Missed</span>
          </div>
        </div>
        <div className="mt-3 text-center">
          <Link to="/timeline" className="text-xs text-alan-indigo hover:underline">
            View full timeline →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
