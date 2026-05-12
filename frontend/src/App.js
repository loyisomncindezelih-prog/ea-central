import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import Landing from "@/pages/Landing";
import Signup from "@/pages/Signup";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import MobilePreview from "@/pages/MobilePreview";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/mobile-preview" element={<MobilePreview />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
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
