/**
 * Lightweight product chrome for Listen + History (session-based, no auth required).
 */
export default function ProductShell({ route, onNavigate, children }) {
  return (
    <div className="product">
      <header className="product-header">
        <div className="product-header-inner">
          <button type="button" className="product-logo" onClick={() => onNavigate('home')}>
            <span className="product-logo-dot" />
            Hinter
          </button>
          <nav className="product-nav">
            <button
              type="button"
              className={route === 'listen' ? 'active' : ''}
              onClick={() => onNavigate('listen')}
            >
              Listen
            </button>
            <button
              type="button"
              className={route === 'history' ? 'active' : ''}
              onClick={() => onNavigate('history')}
            >
              History
            </button>
          </nav>
          <p className="product-tagline">Transparent · disclosed use</p>
        </div>
      </header>
      <main className="product-main">{children}</main>
    </div>
  );
}
