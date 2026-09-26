import Landing from './Landing';
import ListenerPanel from './components/ListenerPanel';

function isElectronShell() {
  if (typeof window === 'undefined') return false;
  if (window.hinter) return true;
  return /\belectron\b/i.test(navigator.userAgent || '');
}

/**
 * Browser → full homepage + embedded live listener (Cluely-style).
 * Electron → compact always-on-top overlay only.
 */
export default function App() {
  if (isElectronShell()) {
    return <ListenerPanel embedded={false} />;
  }

  return <Landing />;
}
