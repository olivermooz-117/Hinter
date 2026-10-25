import { useEffect } from 'react';
import Landing from './Landing';
import ListenerPanel from './components/ListenerPanel';

function isElectronShell() {
  if (typeof window === 'undefined') return false;
  if (window.hinter) return true;
  return /\belectron\b/i.test(navigator.userAgent || '');
}

/**
 * Browser → full homepage + embedded live listener (scrollable).
 * Electron → compact always-on-top overlay only.
 */
export default function App() {
  const electron = isElectronShell();

  useEffect(() => {
    document.body.classList.toggle('hinter-electron', electron);
    return () => document.body.classList.remove('hinter-electron');
  }, [electron]);

  if (electron) {
    return <ListenerPanel embedded={false} />;
  }

  return <Landing />;
}
