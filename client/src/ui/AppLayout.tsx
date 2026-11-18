import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { NavBar } from './NavBar';

/**
 * Guarded layout: logged-out users are sent to /login. Everything underneath
 * renders with the nav bar on top.
 */
export function AppLayout() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-full">
      <NavBar />
      <Outlet />
    </div>
  );
}
