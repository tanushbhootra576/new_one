import { Calendar, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatientCard } from "@/types/models";

export function AppointmentWidget({ card }: { card: PatientCard | null }) {
  const nextAppt = card?.upcoming_procedures?.[0];

  return (
    <Card className="col-span-1 border-alan-border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-alan-surface">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-alan-text-primary">
          <Calendar className="h-4 w-4 text-alan-teal" />
          Next Appointment
        </CardTitle>
      </CardHeader>
      <CardContent>
        {nextAppt ? (
          <div>
            <p className="text-sm font-medium text-alan-text-primary mb-2 line-clamp-2">{nextAppt}</p>
            <Link to="/card" className="text-xs text-alan-indigo flex items-center hover:underline">
              View details <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-alan-text-muted">No upcoming appointments scheduled.</p>
        )}
      </CardContent>
    </Card>
  );
}
