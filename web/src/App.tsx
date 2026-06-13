import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import UploadPage from "@/pages/UploadPage";
import PlanPage from "@/pages/PlanPage";
import PatientCardPage from "@/pages/PatientCardPage";
import MedicationTrackerPage from "@/pages/MedicationTrackerPage";
import TimelinePage from "@/pages/TimelinePage";
import NotificationCenterPage from "@/pages/NotificationCenterPage";
import DashboardPage from "@/pages/DashboardPage";
import { NotificationProvider } from "@/contexts/NotificationContext";

export default function App() {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/card" element={<PatientCardPage />} />
          <Route path="/medications" element={<MedicationTrackerPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/notifications" element={<NotificationCenterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
}
