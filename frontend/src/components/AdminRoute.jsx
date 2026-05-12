import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-white/60"
        data-testid="admin-route-loading"
      >
        Loading…
      </div>
    );
  }
  if (user === false) return <Navigate to="/admin" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return children;
};

export default AdminRoute;
