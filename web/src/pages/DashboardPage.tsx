import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Bell, User } from "lucide-react";
import { MedicationWidget } from "@/components/dashboard/MedicationWidget";
import { AppointmentWidget } from "@/components/dashboard/AppointmentWidget";
import { ProgressWidget } from "@/components/dashboard/ProgressWidget";
import { TaskWidget } from "@/components/dashboard/TaskWidget";
import { ReportsWidget } from "@/components/dashboard/ReportsWidget";
import { QuickActionWidget } from "@/components/dashboard/QuickActionWidget";
import { AICoachWidget } from "@/components/dashboard/AICoachWidget";
import { getMedications, getPatientCard, getTimeline } from "@/api/client";
import { useNotifications } from "@/contexts/NotificationContext";
import type { PatientCard, MedicationSchedule, TimelineDay } from "@/types/models";

export default function DashboardPage() {
  const [card, setCard] = useState<PatientCard | null>(null);
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [adherenceScore, setAdherenceScore] = useState<number>(0);
  const [timeline, setTimeline] = useState<TimelineDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  
  const { unreadCount } = useNotifications();

  useEffect(() => {
    async function loadData() {
      try {
        const [cardData, medsData, timelineData] = await Promise.all([
          getPatientCard(),
          getMedications(),
          getTimeline(),
        ]);
        setCard(cardData);
        setSchedules(medsData.schedules);
        setAdherenceScore(medsData.adherence_score);
        setTimeline(timelineData);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f8fe] pb-20 md:pb-6">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-alan-border bg-white/95 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-alan-indigo/10">
              <User className="h-5 w-5 text-alan-indigo" />
            </div>
            <div>
              <p className="text-xs text-alan-text-muted">Welcome back,</p>
              <h1 className="text-lg font-bold text-alan-text-primary leading-tight">
                {card?.name?.split(" ")[0] || "Patient"}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Link
              to="/notifications"
              className="relative rounded-full p-2 text-alan-text-muted hover:bg-alan-surface transition-colors"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-alan-error ring-2 ring-white" />
              )}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Activity className="h-8 w-8 animate-spin text-alan-indigo" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <AICoachWidget card={card} timeline={timeline} />
            <ProgressWidget adherenceScore={adherenceScore} />
            <AppointmentWidget card={card} />
            <MedicationWidget schedules={schedules} />
            <TaskWidget timeline={timeline} />
            <ReportsWidget />
            <QuickActionWidget />
          </div>
        )}
      </main>
      
      {/* Mobile Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-alan-border md:hidden z-50">
        <div className="flex justify-around p-3">
          <Link to="/" className="flex flex-col items-center gap-1 text-alan-indigo">
            <Activity className="h-5 w-5" />
            <span className="text-[10px] font-medium">Home</span>
          </Link>
          <Link to="/card" className="flex flex-col items-center gap-1 text-alan-text-muted hover:text-alan-indigo">
            <User className="h-5 w-5" />
            <span className="text-[10px] font-medium">Card</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
