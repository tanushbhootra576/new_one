import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Pill, FlaskConical, Calendar, Bell, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { getTimeline } from "@/api/client";
import type { TimelineDay } from "@/types/models";
import { cn } from "@/lib/utils";

const typeIcons = {
  medication: Pill,
  test: FlaskConical,
  appointment: Calendar,
  follow_up: Bell,
};

const statusColors = {
  completed: "bg-green-100 text-green-700 border-green-200",
  missed: "bg-red-100 text-red-700 border-red-200",
  pending: "bg-alan-border/50 text-alan-text-muted border-alan-border",
};

const statusIcons = {
  completed: CheckCircle2,
  missed: AlertCircle,
  pending: Clock,
};

export default function TimelinePage() {
  const [timeline, setTimeline] = useState<TimelineDay[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTimeline()
      .then(setTimeline)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-[#f5f8fe] flex items-center justify-center">Loading timeline...</div>;
  }

  if (!timeline) return null;

  return (
    <div className="min-h-screen bg-[#f5f8fe]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-alan-border bg-white/95 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <Link to="/card" className="p-2 hover:bg-alan-border/50 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5 text-alan-text-primary" />
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-btn bg-alan-indigo">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-alan-text-primary">Recovery Timeline</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 pb-32">
        <div className="space-y-8 relative">
          {/* Vertical line connecting all days */}
          <div className="absolute left-4 top-4 bottom-4 w-px bg-alan-border" />

          {timeline.map((day, index) => {
            const isToday = day.label === "Today";
            
            return (
              <div key={index} className="relative pl-10">
                {/* Milestone Node */}
                <div className={cn(
                  "absolute left-2.5 top-1 h-3 w-3 rounded-full border-2",
                  isToday ? "bg-alan-indigo border-alan-indigo ring-4 ring-alan-indigo/20" : "bg-white border-alan-border"
                )} />

                <div className="mb-4">
                  <h2 className="text-sm font-bold text-alan-text-primary uppercase tracking-wider">
                    {day.label}
                  </h2>
                  {day.date && (
                    <p className="text-xs text-alan-text-muted mt-0.5">
                      {new Date(day.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  {day.items.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-alan-border text-center">
                      <p className="text-sm text-alan-text-muted">No events scheduled.</p>
                    </div>
                  ) : (
                    day.items.map((item) => {
                      const Icon = typeIcons[item.type];
                      const StatusIcon = statusIcons[item.status];

                      return (
                        <div key={item.id} className="rounded-card bg-white border border-alan-border p-4 shadow-sm">
                          <div className="flex items-start gap-4">
                            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-alan-indigo/10 flex-shrink-0">
                              <Icon className="h-4 w-4 text-alan-indigo" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-alan-text-primary truncate">
                                  {item.title}
                                </h3>
                                <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider", statusColors[item.status])}>
                                  <StatusIcon className="h-3 w-3" />
                                  {item.status}
                                </div>
                              </div>
                              
                              {item.description && (
                                <p className="text-sm text-alan-text-secondary mt-1 line-clamp-2">
                                  {item.description}
                                </p>
                              )}
                              
                              <div className="mt-3 flex items-center gap-2 text-xs font-medium text-alan-text-muted">
                                <Clock className="h-3.5 w-3.5" />
                                <span>{new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
