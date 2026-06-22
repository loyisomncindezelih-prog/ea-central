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
import BridgePage from "@/pages/BridgePage";
import Profile from "@/pages/Profile";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancelled from "@/pages/PaymentCancelled";
import Terms from "@/pages/Terms";
import VerifyAccount from "@/pages/VerifyAccount";
import PendingApproval from "@/pages/PendingApproval";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminLicenses from "@/pages/AdminLicenses";
import AdminBrokers from "@/pages/AdminBrokers";
import AdminScans from "@/pages/AdminScans";
import Downloads from "@/pages/Downloads";
import MaintenanceGate from "@/components/MaintenanceGate";

const Protected = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>;

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <MaintenanceGate>
            <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/pending" element={<PendingApproval />} />
            <Route path="/mobile-preview" element={<MobilePreview />} />
            <Route path="/app" element={<MobileApp />} />
            <Route path="/verify-account" element={<VerifyAccount />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/downloads" element={<Downloads />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment-cancelled" element={<PaymentCancelled />} />

            <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
            <Route path="/dashboard/generate-key" element={<Protected><GenerateKey /></Protected>} />
            <Route path="/dashboard/generate-key/success/:id" element={<Protected><GenerateKeySuccess /></Protected>} />
            <Route path="/dashboard/manage-eas" element={<Protected><ManageEAs /></Protected>} />
            <Route path="/dashboard/manage-eas/:id" element={<Protected><EADetail /></Protected>} />
            <Route path="/dashboard/key-stats" element={<Protected><KeyStats /></Protected>} />
            <Route path="/dashboard/profile" element={<Protected><Profile /></Protected>} />

            <Route path="/admin" element={<AdminLogin />} />
            <Route
              path="/admin/dashboard"
              element={<AdminRoute><AdminDashboard /></AdminRoute>}
            />
            <Route
              path="/admin/licenses"
              element={<AdminRoute><AdminLicenses /></AdminRoute>}
            />
            <Route
              path="/admin/brokers"
              element={<AdminRoute><AdminBrokers /></AdminRoute>}
            />
            <Route
              path="/admin/scans"
              element={<AdminRoute><AdminScans /></AdminRoute>}
            />
            <Route
              path="/admin/bridge"
              element={<AdminRoute><BridgePage /></AdminRoute>}
            />
          </Routes>
          </MaintenanceGate>
          <Toaster
            theme="dark"
            position="bottom-center"
            richColors
            closeButton
            expand
            offset={24}
            visibleToasts={4}
            duration={4500}
            toastOptions={{
              // Premium glass-morphism — sits perfectly above the bottom nav on mobile,
              // clear of the iOS notch / status bar on web. Per-type colors come from
              // sonner's richColors palette; we just polish the shared chrome.
              className: "ea-toast",
              style: {
                background: "rgba(10, 10, 12, 0.92)",
                color: "#fff",
                border: "1px solid rgba(255, 255, 255, 0.10)",
                borderRadius: "16px",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                boxShadow: "0 24px 60px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset",
                padding: "14px 16px",
                fontSize: "13.5px",
                lineHeight: "1.45",
                minWidth: "min(420px, calc(100vw - 32px))",
                maxWidth: "calc(100vw - 32px)",
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
