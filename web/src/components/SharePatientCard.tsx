import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Link as LinkIcon, Check, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PatientCard, Action } from "@/types/models";

interface SharePatientCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PatientCard;
  acceptedActions: Action[];
}

export function SharePatientCard({ open, onOpenChange, card, acceptedActions }: SharePatientCardProps) {
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // In a real app, this would be a proper sharable route
  const shareUrl = `${window.location.origin}/share/${card.name ? card.name.replace(/\s+/g, '_').toLowerCase() : "demo"}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    
    setIsGeneratingPdf(true);
    try {
      const canvas = await (html2canvas as any)(printRef.current, {
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`Patient_Summary_${card.name?.replace(/\s+/g, '_') || "Unknown"}.pdf`);
    } catch (err) {
      console.error("Error generating PDF:", err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Patient Card</DialogTitle>
            <DialogDescription>
              Share {card.name}'s medical summary securely.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center space-y-6 py-4">
            <div className="rounded-xl border border-alan-border bg-white p-4 shadow-sm">
              <QRCodeSVG
                value={shareUrl}
                size={200}
                bgColor={"#ffffff"}
                fgColor={"#0f172a"}
                level={"M"}
                includeMargin={false}
              />
            </div>
            
            <div className="flex w-full flex-col gap-3">
              <Button 
                variant="outline" 
                className="w-full justify-start text-sm" 
                onClick={handleCopyLink}
              >
                {copied ? <Check className="mr-2 h-4 w-4 text-alan-success" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                {copied ? "Link Copied!" : "Copy Share Link"}
              </Button>
              <Button 
                variant="default" 
                className="w-full justify-start text-sm bg-alan-indigo text-white hover:bg-alan-indigo/90" 
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
              >
                <FileDown className="mr-2 h-4 w-4" />
                {isGeneratingPdf ? "Generating PDF..." : "Download PDF Summary"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden element for PDF rendering */}
      <div className="absolute left-[-9999px] top-[-9999px]">
        <div 
          ref={printRef} 
          className="w-[800px] bg-white p-12 text-alan-text-primary"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          <div className="mb-8 border-b border-alan-border pb-6">
            <h1 className="text-3xl font-bold text-alan-indigo mb-2">Patient Summary</h1>
            <h2 className="text-2xl font-semibold text-gray-900">{card.name || "Unnamed patient"}</h2>
            {card.address && <p className="text-gray-600 mt-1">{card.address}</p>}
            <p className="text-gray-500 text-sm mt-2">
              Generated on {new Date().toLocaleDateString()}
            </p>
          </div>

          <div className="space-y-8">
            {/* Diagnosis */}
            {card.active_conditions.length > 0 && (
              <section>
                <h3 className="text-xl font-semibold text-gray-900 border-b pb-2 mb-4">Diagnosis</h3>
                <ul className="list-disc pl-5 space-y-2">
                  {card.active_conditions.map((condition, i) => (
                    <li key={i} className="text-gray-800">{condition}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Medications */}
            {card.current_treatments.length > 0 && (
              <section>
                <h3 className="text-xl font-semibold text-gray-900 border-b pb-2 mb-4">Current Medications</h3>
                <ul className="list-disc pl-5 space-y-2">
                  {card.current_treatments.map((treatment, i) => (
                    <li key={i} className="text-gray-800">{treatment}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* History / Allergies (Drug Interactions) */}
            {card.drug_interactions.length > 0 && (
              <section>
                <h3 className="text-xl font-semibold text-red-600 border-b pb-2 mb-4">Alerts & Interactions</h3>
                <ul className="list-disc pl-5 space-y-2">
                  {card.drug_interactions.map((alert, i) => (
                    <li key={i} className="text-red-700 font-medium">{alert}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Follow-up Actions */}
            {acceptedActions.length > 0 && (
              <section>
                <h3 className="text-xl font-semibold text-gray-900 border-b pb-2 mb-4">Follow-up Actions</h3>
                <ul className="list-disc pl-5 space-y-2">
                  {acceptedActions.map((action, i) => (
                    <li key={i} className="text-gray-800">
                      <span className="font-medium">{action.title}</span>
                      {action.why && <p className="text-sm text-gray-600 mt-1">{action.why}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            
            {/* Upcoming Procedures */}
            {card.upcoming_procedures.length > 0 && (
              <section>
                <h3 className="text-xl font-semibold text-gray-900 border-b pb-2 mb-4">Upcoming Procedures</h3>
                <ul className="list-disc pl-5 space-y-2">
                  {card.upcoming_procedures.map((proc, i) => (
                    <li key={i} className="text-gray-800">{proc}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          
          <div className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
            <p>Confidential Medical Document</p>
          </div>
        </div>
      </div>
    </>
  );
}
