import { useEffect, useState } from 'react';
import Landing from './Landing';
import ListenerPanel from './components/ListenerPanel';
import HistoryPanel from './components/HistoryPanel';
import ProductShell from './components/ProductShell';

function isElectronShell() {
  if (typeof window === 'undefined') return false;
  if (window.hinter) return true;
  return /\belectron\b/i.test(navigator.userAgent || '');
}

function getRoute() {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/app' || path === '/listen') return 'listen';
  if (path === '/history') return 'history';
  return 'home';
}

/**
 * Browser → marketing homepage or product area (Listen / History).
 * Electron → compact always-on-top overlay only.
 */
export default function App() {
  const [route, setRoute] = useState(getRoute);

  const navigate = (next) => {
    const path =
      next === 'listen' ? '/app' : next === 'history' ? '/history' : '/';
    window.history.pushState({}, '', path);
    setRoute(next);
  };

  useEffect(() => {
    const onPop = () => setRoute(getRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (isElectronShell()) {
    return <ListenerPanel embedded={false} />;
  }

  if (route === 'listen' || route === 'history') {
    return (
      <ProductShell route={route} onNavigate={navigate}>
        {route === 'listen' ? (
          <ListenerPanel embedded />
        ) : (
          <HistoryPanel />
        )}
      </ProductShell>
    );
  }

  return <Landing onOpenApp={() => navigate('listen')} />;
}
