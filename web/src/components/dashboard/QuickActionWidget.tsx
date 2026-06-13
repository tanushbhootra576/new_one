import { UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

export function QuickActionWidget() {
  return (
    <Card className="col-span-1 md:col-span-2 border-dashed border-2 border-alan-indigo/30 bg-alan-indigo/5 hover:bg-alan-indigo/10 transition-colors cursor-pointer group">
      <Link to="/upload" className="block w-full h-full">
        <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
          <div className="bg-white p-3 rounded-full shadow-sm group-hover:scale-110 transition-transform">
            <UploadCloud className="h-6 w-6 text-alan-indigo" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-alan-indigo">Upload New Document</p>
            <p className="text-xs text-alan-indigo/70 mt-1">Prescriptions, reports, or clinical notes</p>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
