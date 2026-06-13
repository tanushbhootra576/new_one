import re

with open("web/src/App.tsx", "r") as f:
    content = f.read()

imports = """
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import DoctorDashboardPage from "@/pages/DoctorDashboardPage";
import { UserRole } from "@/types/models";
"""

content = content.replace('import { NotificationProvider } from "@/contexts/NotificationContext";', 'import { NotificationProvider } from "@/contexts/NotificationContext";\n' + imports)

# Wrap inside AuthProvider
# Also create a RoleBasedRoute component to dynamically route "/" depending on role
route_wrapper = """
function HomeRoute() {
  const { user } = useAuth();
  if (user?.role === UserRole.DOCTOR) {
    return <Navigate to="/doctor" replace />;
  }
  return <DashboardPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            
            <Route path="/" element={<ProtectedRoute><HomeRoute /></ProtectedRoute>} />
            <Route path="/doctor" element={<ProtectedRoute allowedRoles={[UserRole.DOCTOR]}><DoctorDashboardPage /></ProtectedRoute>} />
            
            <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
            <Route path="/plan" element={<ProtectedRoute><PlanPage /></ProtectedRoute>} />
            <Route path="/card" element={<ProtectedRoute><PatientCardPage /></ProtectedRoute>} />
            <Route path="/medications" element={<ProtectedRoute><MedicationTrackerPage /></ProtectedRoute>} />
            <Route path="/timeline" element={<ProtectedRoute><TimelinePage /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationCenterPage /></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
"""

content = re.sub(r"export default function App\(\) \{.*\}", route_wrapper.strip(), content, flags=re.DOTALL)

with open("web/src/App.tsx", "w") as f:
    f.write(content)
