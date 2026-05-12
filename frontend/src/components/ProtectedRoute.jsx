import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-white/60"
        data-testid="protected-loading"
      >
        Loading…
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  return children;
};

export default ProtectedRoute;
