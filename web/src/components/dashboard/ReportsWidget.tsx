import { FileText, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


export function ReportsWidget() {
  // Placeholder data for recent reports
  const reports = [
    { title: "Blood Test Results", date: "Today, 09:00 AM" },
    { title: "Urology Consultation", date: "Yesterday" }
  ];

  return (
    <Card className="col-span-1 md:col-span-2 border-alan-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-alan-text-primary">
          <FileText className="h-4 w-4 text-alan-indigo" />
          Recent Reports
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {reports.map((report, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded-md hover:bg-alan-surface transition-colors cursor-pointer border border-transparent hover:border-alan-border">
              <div className="flex items-center gap-3">
                <div className="bg-alan-indigo/10 p-2 rounded-md">
                  <FileText className="h-4 w-4 text-alan-indigo" />
                </div>
                <div>
                  <p className="text-sm font-medium text-alan-text-primary">{report.title}</p>
                  <p className="text-xs text-alan-text-muted">{report.date}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-alan-text-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
