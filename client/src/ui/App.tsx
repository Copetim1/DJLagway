import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppLayout } from './AppLayout';
import { Login } from './Login';
import { Register } from './Register';
import { Library } from './Library';
import { Journal } from './Journal';
import { Profile } from './Profile';
import DjSpike from './DjSpike';

export default function App() {
  const { token } = useAuth();

  return (
    <Routes>
      {/* Public routes. A logged-in user hitting these is bounced to the app. */}
      <Route path="/login" element={token ? <Navigate to="/mix" replace /> : <Login />} />
      <Route path="/register" element={token ? <Navigate to="/mix" replace /> : <Register />} />

      {/* Guarded routes: AppLayout redirects to /login when there's no token. */}
      <Route element={<AppLayout />}>
        <Route path="/mix" element={<DjSpike />} />
        <Route path="/library" element={<Library />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/" element={<Navigate to="/mix" replace />} />
      </Route>

      {/* Anything else: send logged-in users to the mix screen, others to login. */}
      <Route path="*" element={<Navigate to={token ? '/mix' : '/login'} replace />} />
    </Routes>
  );
}
