import { useState } from 'react';
import { Login } from './Login';
import { MainPage } from './MainPage';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => Boolean(localStorage.getItem('token')));

  if (!loggedIn) {
    return <Login onLoggedIn={() => setLoggedIn(true)} />;
  }

  return <MainPage />;
}
