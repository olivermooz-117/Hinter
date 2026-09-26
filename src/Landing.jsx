import ListenerPanel from './components/ListenerPanel';

/**
 * Cluely-style marketing homepage with the live listener embedded.
 * Shown only in the browser (not Electron overlay).
 */
export default function Landing() {
  return (
    <div className="site">
      <header className="site-header">
        <div className="site-wrap site-nav">
          <a className="site-logo" href="#top">
            <span className="site-logo-dot" />
            Hinter
          </a>
          <nav className="site-links">
            <a href="#demo">Live demo</a>
            <a href="#how">How it works</a>
            <a href="#transparent">Why transparent</a>
            <a
              className="site-btn site-btn-ghost"
              href="https://github.com/olivermooz-117/Hinter"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a className="site-btn site-btn-primary" href="#demo">
              Try it live
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="site-wrap hero-grid">
            <div className="hero-copy">
              <p className="hero-kicker">Transparent meeting co-pilot</p>
              <h1>
                Real-time answers in meetings — openly, not hidden
              </h1>
              <p className="hero-lead">
                Hinter listens (mic or tab audio), transcribes live, and
                surfaces short AI suggestions you can use out loud. Built to
                be disclosed — like a visible meeting assistant, not a
                secret tool.
              </p>
              <div className="hero-actions">
                <a className="site-btn site-btn-primary" href="#demo">
                  Try live demo
                </a>
                <a
                  className="site-btn site-btn-ghost"
                  href="https://github.com/olivermooz-117/Hinter"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View source
                </a>
              </div>
              <ul className="hero-points">
                <li>No bot joins the call</li>
                <li>Live transcript + suggestions</li>
                <li>Works in the browser right now</li>
              </ul>
            </div>

            <div className="hero-demo">
              <ListenerPanel embedded />
            </div>
          </div>
        </section>

        <section id="how" className="section">
          <div className="site-wrap">
            <p className="section-kicker">How it works</p>
            <h2 className="section-title">Three steps</h2>
            <div className="steps">
              <article className="step">
                <span className="step-num">1</span>
                <h3>Allow the mic</h3>
                <p>
                  Optionally share a tab with audio so meeting speakers are
                  captured too.
                </p>
              </article>
              <article className="step">
                <span className="step-num">2</span>
                <h3>Hit Listen</h3>
                <p>
                  Audio streams to the backend → Gemini Live transcription →
                  rolling transcript.
                </p>
              </article>
              <article className="step">
                <span className="step-num">3</span>
                <h3>Use suggestions</h3>
                <p>
                  Debounced AI cards appear with short prompts and answers
                  you can say next.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section id="transparent" className="section section-alt">
          <div className="site-wrap">
            <p className="section-kicker">Positioning</p>
            <h2 className="section-title">Transparent by design</h2>
            <div className="contrast">
              <div className="contrast-card good">
                <h3>Hinter</h3>
                <ul>
                  <li>Openly disclosed assist</li>
                  <li>Clear audio + STT pipeline</li>
                  <li>Portfolio-friendly to explain</li>
                  <li>You stay in control of the mic</li>
                </ul>
              </div>
              <div className="contrast-card bad">
                <h3>Hidden meeting AI</h3>
                <ul>
                  <li>Designed to stay invisible</li>
                  <li>Unclear capture boundaries</li>
                  <li>Harder to defend ethically</li>
                  <li>Participants may never know</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section cta">
          <div className="site-wrap cta-inner">
            <h2>Try it on this page</h2>
            <p>
              Scroll up to the live panel, allow the microphone, and press
              Listen. Desktop overlay (Electron) is available from the repo
              for always-on-top + Linux system audio.
            </p>
            <a className="site-btn site-btn-primary" href="#demo">
              Back to live demo
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-wrap site-footer-row">
          <span>Hinter — transparent AI meeting co-pilot</span>
          <a
            href="https://github.com/olivermooz-117/Hinter"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
