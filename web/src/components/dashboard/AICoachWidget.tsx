import { useEffect, useState } from "react";
import { Sparkles, Loader2, Target, AlertTriangle, MessageCircle, HeartPulse, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCoachSummary } from "@/api/client";
import type { CoachSummary, PatientCard, TimelineDay } from "@/types/models";

interface AICoachWidgetProps {
  card: PatientCard | null;
  timeline: TimelineDay[] | null;
}

export function AICoachWidget({ card, timeline }: AICoachWidgetProps) {
  const [summary, setSummary] = useState<CoachSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!card || !timeline) return;
    
    async function fetchCoach() {
      try {
        const data = await getCoachSummary({
          patient_card: card as any,
          timeline: timeline as any
        });
        setSummary(data);
      } catch (err) {
        console.error("Failed to load coach summary", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCoach();
  }, [card, timeline]);

  if (!card || !timeline) return null;

  return (
    <Card className="col-span-1 md:col-span-2 border-alan-indigo/30 shadow-md bg-gradient-to-br from-indigo-50 to-white">
      <CardHeader className="pb-3 border-b border-alan-indigo/10">
        <CardTitle className="text-base font-bold flex items-center gap-2 text-alan-indigo">
          <Sparkles className="h-5 w-5" />
          AI Recovery Coach
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-alan-indigo mb-2" />
            <p className="text-xs text-alan-text-muted">Generating personalized recovery plan...</p>
          </div>
        ) : summary ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-alan-text-primary leading-relaxed">
              {summary.daily_summary}
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-3 rounded-lg border border-alan-border shadow-sm">
                <h4 className="text-xs font-bold text-alan-text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Target className="h-3 w-3 text-alan-teal" /> Priorities
                </h4>
                <ul className="space-y-1">
                  {summary.priorities.map((p, i) => (
                    <li key={i} className="text-sm text-alan-text-secondary flex items-start gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-alan-success shrink-0 mt-0.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white p-3 rounded-lg border border-alan-border shadow-sm">
                <h4 className="text-xs font-bold text-alan-text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" /> Risks to Watch
                </h4>
                <ul className="space-y-1">
                  {summary.risks.map((r, i) => (
                    <li key={i} className="text-sm text-alan-text-secondary flex items-start gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white p-3 rounded-lg border border-alan-border shadow-sm">
                <h4 className="text-xs font-bold text-alan-text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                  <MessageCircle className="h-3 w-3 text-alan-indigo" /> Questions for Doctor
                </h4>
                <ul className="space-y-1">
                  {summary.questions.map((q, i) => (
                    <li key={i} className="text-sm text-alan-text-secondary flex items-start gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-alan-indigo shrink-0 mt-1.5" />
                      {q}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white p-3 rounded-lg border border-alan-border shadow-sm">
                <h4 className="text-xs font-bold text-alan-text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                  <HeartPulse className="h-3 w-3 text-pink-500" /> Encouragement
                </h4>
                <p className="text-sm text-alan-text-secondary italic">"{summary.encouragement}"</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-alan-text-muted text-center py-4">Could not load coach summary.</p>
        )}
      </CardContent>
    </Card>
  );
}
