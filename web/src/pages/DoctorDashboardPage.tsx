import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DoctorDashboardPage() {
  const { user, logout } = useAuth();
  const [patientId, setPatientId] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId.trim()) return;
    localStorage.setItem("active_patient_id", patientId.trim());
    navigate("/");
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex justify-between items-center bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">Doctor Dashboard</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Welcome, {user?.name}</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>Log out</Button>
        </div>

        <div className="bg-white dark:bg-neutral-800 p-8 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Find a Patient</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Enter a Patient ID to view their timeline, upload reports, and check progress.</p>
          </div>
          
          <form onSubmit={handleSearch} className="flex gap-4">
            <Input 
              type="text" 
              value={patientId} 
              onChange={(e) => setPatientId(e.target.value)} 
              placeholder="e.g. pat_1234567890ab" 
              required 
              className="flex-1"
            />
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Access Patient</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
