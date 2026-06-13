import { Pill, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MedicationSchedule } from "@/types/models";

export function MedicationWidget({ schedules }: { schedules: MedicationSchedule[] }) {
  const todayDoses = schedules.flatMap(s => 
    s.doses.map(d => ({ ...d, medName: s.medication_name, dosage: s.dosage }))
  ).slice(0, 3); // show up to 3

  return (
    <Card className="col-span-1 border-alan-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-alan-text-primary">
          <Pill className="h-4 w-4 text-alan-indigo" />
          Today's Medications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {todayDoses.length === 0 ? (
          <p className="text-sm text-alan-text-muted">No medications scheduled for today.</p>
        ) : (
          <div className="space-y-3">
            {todayDoses.map((dose, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-alan-text-primary">{dose.medName}</p>
                  <p className="text-xs text-alan-text-muted">{dose.dosage}</p>
                </div>
                {dose.status === "TAKEN" ? (
                  <CheckCircle2 className="h-5 w-5 text-alan-success" />
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    {new Date(dose.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
