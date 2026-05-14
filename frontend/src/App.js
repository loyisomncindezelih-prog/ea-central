import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";

import Landing from "@/pages/Landing";
import Signup from "@/pages/Signup";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import GenerateKey from "@/pages/GenerateKey";
import GenerateKeySuccess from "@/pages/GenerateKeySuccess";
import ManageEAs from "@/pages/ManageEAs";
import EADetail from "@/pages/EADetail";
import KeyStats from "@/pages/KeyStats";
import MobilePreview from "@/pages/MobilePreview";
import MobileApp from "@/pages/MobileApp";
import VerifyAccount from "@/pages/VerifyAccount";
import PendingApproval from "@/pages/PendingApproval";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminLicenses from "@/pages/AdminLicenses";

const Protected = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>;

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/pending" element={<PendingApproval />} />
            <Route path="/mobile-preview" element={<MobilePreview />} />
            <Route path="/app" element={<MobileApp />} />
            <Route path="/verify-account" element={<VerifyAccount />} />

            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/dashboard/generate-key" element={<Protected><GenerateKey /></Protected>} />
            <Route path="/dashboard/generate-key/success/:id" element={<Protected><GenerateKeySuccess /></Protected>} />
            <Route path="/dashboard/manage-eas" element={<Protected><ManageEAs /></Protected>} />
            <Route path="/dashboard/manage-eas/:id" element={<Protected><EADetail /></Protected>} />
            <Route path="/dashboard/key-stats" element={<Protected><KeyStats /></Protected>} />

            <Route path="/admin" element={<AdminLogin />} />
            <Route
              path="/admin/dashboard"
              element={<AdminRoute><AdminDashboard /></AdminRoute>}
            />
            <Route
              path="/admin/licenses"
              element={<AdminRoute><AdminLicenses /></AdminRoute>}
            />
          </Routes>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "#050505",
                color: "#fff",
                border: "1px solid rgba(30, 144, 255, 0.4)",
                borderRadius: 0,
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
