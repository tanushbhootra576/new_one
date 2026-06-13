import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Stethoscope,
  Pill,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Share2,
  ArrowLeft,
  Sparkles,
  FlaskConical,
  Car,
  Bell,
  UserRound,
} from "lucide-react";
import type {
  ActionPlan,
  ActionType,
  ExecutionResult,
  PatientCard,
  ValidatedAction,
} from "@/types/models";
import { getPatientCard } from "@/api/client";
import { useNotifications } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SharePatientCard } from "@/components/SharePatientCard";

function downloadIcs(title: string, icsContent: string) {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

const actionTypeIcons: Partial<Record<ActionType, React.ReactNode>> = {
  BOOK_LAB: <FlaskConical className="h-3.5 w-3.5" />,
  BOOK_TRANSPORT: <Car className="h-3.5 w-3.5" />,
  ADD_REMINDER: <Bell className="h-3.5 w-3.5" />,
  BOOK_APPOINTMENT: <Calendar className="h-3.5 w-3.5" />,
};

export default function PatientCardPage() {
  const navigate = useNavigate();
  const [card, setCard] = useState<PatientCard | null>(null);
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [decisions, setDecisions] = useState<ValidatedAction[]>([]);
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { unreadCount } = useNotifications();
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const storedPlan = sessionStorage.getItem("plan");
    const storedDecisions = sessionStorage.getItem("decisions");
    const storedExecution = sessionStorage.getItem("execution");
    setPlan(storedPlan ? (JSON.parse(storedPlan) as ActionPlan) : null);
    setDecisions(
      storedDecisions ? (JSON.parse(storedDecisions) as ValidatedAction[]) : []
    );

    // If we just executed, use the fresh card the backend returned.
    // Otherwise fetch it from the vault.
    if (storedExecution) {
      const exec = JSON.parse(storedExecution) as ExecutionResult;
      setExecution(exec);
      if (exec.updated_card) {
        setCard(exec.updated_card);
        return;
      }
    }

    getPatientCard()
      .then(setCard)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f8fe] flex items-center justify-center p-6">
        <div className="rounded-card border border-alan-error/30 bg-alan-error/5 px-6 py-5 max-w-md">
          <p className="text-sm font-semibold text-alan-error mb-1">
            Unable to load patient card
          </p>
          <p className="text-xs text-alan-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  if (!card) return null;

  const acceptedActions = (plan?.actions ?? []).filter((a) => {
    const d = decisions.find((dec) => dec.id === a.id);
    return d && d.decision !== "REJECT";
  });

  const formatDate = (iso: string | null): string => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f8fe]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-alan-border bg-white/95 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <button
            onClick={() => navigate("/plan")}
            className="rounded-full p-1.5 text-alan-text-muted hover:bg-alan-surface transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-btn bg-alan-indigo">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-alan-text-primary">CuraPath</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShareOpen(true)}
              className="rounded-full p-2 text-alan-text-muted hover:bg-alan-surface transition-colors"
              title="Share Patient Card"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate("/notifications")}
              className="relative rounded-full p-2 text-alan-text-muted hover:bg-alan-surface transition-colors"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-alan-error ring-2 ring-white" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8 space-y-5">
        {/* Patient header */}
        <Card className="bg-white">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-alan-indigo/10">
                <User className="h-7 w-7 text-alan-indigo" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-alan-text-primary">
                  {card.name ?? "Unnamed patient"}
                </h1>
                {card.address && (
                  <p className="text-sm text-alan-text-muted">{card.address}</p>
                )}
                {card.last_updated && (
                  <p className="mt-1 text-xs text-alan-text-muted">
                    Updated: {formatDate(card.last_updated)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 items-end">
                <Badge variant="default" className="flex-shrink-0">Active plan</Badge>
                <Button onClick={() => navigate("/timeline")} variant="outline" size="sm" className="text-xs">
                  View Timeline
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Drug interactions */}
        {card.drug_interactions.length > 0 && (
          <div className="rounded-card border border-alan-error/20 bg-alan-error/5 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-alan-error/15 p-1.5 flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-alan-error" />
              </div>
              <div>
                <p className="text-sm font-semibold text-alan-error mb-1">
                  Drug interactions
                </p>
                {card.drug_interactions.map((alert, i) => (
                  <p
                    key={i}
                    className="text-xs text-alan-text-secondary leading-relaxed"
                  >
                    {alert}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Active conditions */}
        {card.active_conditions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Stethoscope className="h-4 w-4 text-alan-text-muted" />
                Diagnoses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {card.active_conditions.map((condition, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-alan-indigo" />
                    <span className="text-sm text-alan-text-secondary">
                      {condition}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Treatments */}
        {card.current_treatments.length > 0 && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm mt-1">
                <Pill className="h-4 w-4 text-alan-text-muted" />
                Current treatments
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => navigate("/medications")} className="h-8 text-xs">
                View Tracker
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {card.current_treatments.map((treatment, i) => (
                  <div
                    key={i}
                    className="rounded-btn bg-alan-surface px-4 py-2.5 text-sm text-alan-text-primary"
                  >
                    {treatment}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upcoming procedures */}
        {card.upcoming_procedures.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-alan-text-muted" />
                Upcoming events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {card.upcoming_procedures.map((procedure, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-alan-indigo" />
                    <span className="text-sm text-alan-text-secondary">
                      {procedure}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Regular followups */}
        {card.regular_followups.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4 text-alan-text-muted" />
                Regular doctors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {card.regular_followups.map((doctor, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {doctor}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Planned actions */}
        {acceptedActions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-alan-success" />
                Planned actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {acceptedActions.map((action) => {
                  const execAction = execution?.executed_actions.find(
                    (e) => e.action.id === action.id
                  );
                  const effectiveAction = execAction?.action ?? action;
                  const url = effectiveAction.suggested_url;
                  const ics = execAction?.result?.["ics"] as string | undefined;
                  return (
                    <div key={action.id} className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                          "bg-alan-success/15 text-[#4a8a3a]"
                        )}
                      >
                        {actionTypeIcons[effectiveAction.type] ?? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <p className="text-sm text-alan-text-secondary flex-1">
                        {effectiveAction.title}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-alan-indigo hover:underline"
                          >
                            Book →
                          </a>
                        )}
                        {ics && (
                          <button
                            onClick={() => downloadIcs(effectiveAction.title, ics)}
                            className="text-xs text-alan-teal hover:underline"
                          >
                            + Calendar
                          </button>
                        )}
                      </div>
                      <Badge
                        variant="success"
                        className="text-[10px]"
                      >
                        Scheduled
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <SharePatientCard 
        open={shareOpen} 
        onOpenChange={setShareOpen} 
        card={card} 
        acceptedActions={acceptedActions} 
      />
    </div>
  );
}
