import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPatients, PatientSearchResult, getPatientForDoctor, updatePatientCardForDoctor } from "@/api/client";
import { PatientCard } from "@/types/models";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function DoctorDashboardPage() {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPatient, setEditingPatient] = useState<{ id: string; card: PatientCard } | null>(null);
  
  const navigate = useNavigate();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await searchPatients(query.trim());
      setResults(res);
    } catch (err) {
      console.error(err);
      alert("Failed to search patients.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleAccessDashboard = (patientId: string) => {
    localStorage.setItem("active_patient_id", patientId);
    navigate("/");
  };

  const handleEditDetails = async (patientId: string) => {
    try {
      const card = await getPatientForDoctor(patientId);
      setEditingPatient({ id: patientId, card });
    } catch (err) {
      console.error(err);
      alert("Failed to get patient details.");
    }
  };

  const handleSaveDetails = async () => {
    if (!editingPatient) return;
    try {
      await updatePatientCardForDoctor(editingPatient.id, editingPatient.card);
      alert("Saved successfully.");
      setEditingPatient(null);
      const res = await searchPatients(query.trim());
      setResults(res);
    } catch (err) {
      console.error(err);
      alert("Failed to save changes.");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
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
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">Enter a Patient ID or Name to view their timeline, upload reports, and check progress.</p>
          </div>
          
          <form onSubmit={handleSearch} className="flex gap-4">
            <Input 
              type="text" 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="e.g. pat_1234567890ab or John Doe" 
              required 
              className="flex-1"
            />
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={loading}>
              {loading ? "Searching..." : "Search"}
            </Button>
          </form>
          
          {results.length > 0 && (
            <div className="mt-6 space-y-4">
              {results.map((res) => (
                <div key={res.id} className="flex justify-between items-center p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
                  <div>
                    <h3 className="font-semibold text-neutral-900 dark:text-white">{res.card?.name || "Unnamed Patient"}</h3>
                    <p className="text-sm text-neutral-500">ID: {res.id}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleEditDetails(res.id)}>Edit Details</Button>
                    <Button onClick={() => handleAccessDashboard(res.id)}>Access Dashboard</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!editingPatient} onOpenChange={(o) => !o && setEditingPatient(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Patient Details</DialogTitle>
          </DialogHeader>
          {editingPatient && (
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-semibold">Name</label>
                <Input 
                  value={editingPatient.card.name || ""} 
                  onChange={e => setEditingPatient({ ...editingPatient, card: { ...editingPatient.card, name: e.target.value }})}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Active Conditions (comma separated)</label>
                <Input 
                  value={editingPatient.card.active_conditions.join(", ")} 
                  onChange={e => setEditingPatient({ ...editingPatient, card: { ...editingPatient.card, active_conditions: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }})}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Current Treatments (comma separated)</label>
                <Input 
                  value={editingPatient.card.current_treatments.join(", ")} 
                  onChange={e => setEditingPatient({ ...editingPatient, card: { ...editingPatient.card, current_treatments: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }})}
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Drug Interactions (comma separated)</label>
                <Input 
                  value={editingPatient.card.drug_interactions.join(", ")} 
                  onChange={e => setEditingPatient({ ...editingPatient, card: { ...editingPatient.card, drug_interactions: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }})}
                />
              </div>
              <div className="flex justify-end pt-4 gap-2">
                <Button variant="outline" onClick={() => setEditingPatient(null)}>Cancel</Button>
                <Button onClick={handleSaveDetails}>Save Changes</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
