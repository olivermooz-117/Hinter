import ListenerPanel from './components/ListenerPanel';

/**
 * Marketing homepage with embedded live listener (Cluely-style scroll length).
 * Browser only — Electron uses the compact overlay.
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
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#use-cases">Use cases</a>
            <a href="#stack">Stack</a>
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
        {/* Hero */}
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

        {/* Social proof strip */}
        <section className="strip">
          <div className="site-wrap strip-row">
            <span>Gemini Live STT</span>
            <span className="strip-dot" />
            <span>React + Electron</span>
            <span className="strip-dot" />
            <span>Flask + Socket.IO</span>
            <span className="strip-dot" />
            <span>Open source</span>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="section">
          <div className="site-wrap">
            <p className="section-kicker">Features</p>
            <h2 className="section-title">Everything you need mid-call</h2>
            <p className="section-lead">
              A focused co-pilot: hear the conversation, read it back, and get
              short prompts — without a bot in the participant list.
            </p>
            <div className="feature-grid">
              <article className="feature-card">
                <div className="feature-icon">🎙</div>
                <h3>Live capture</h3>
                <p>
                  Microphone in the browser, optional tab/screen audio, and on
                  Linux desktop a system-audio path via PipeWire/Pulse.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">📝</div>
                <h3>Streaming transcript</h3>
                <p>
                  Gemini Live turns speech into interim and final lines so the
                  panel stays readable while you talk.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">💡</div>
                <h3>Debounced suggestions</h3>
                <p>
                  The backend rolls the transcript window and asks the model
                  for short, usable answers — not a wall of text.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">🪟</div>
                <h3>Desktop overlay</h3>
                <p>
                  Electron keeps an always-on-top panel for real meetings while
                  this site hosts the public live demo.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">🔐</div>
                <h3>Keys stay server-side</h3>
                <p>
                  Gemini credentials never ship to the browser. The client only
                  streams audio and receives text.
                </p>
              </article>
              <article className="feature-card">
                <div className="feature-icon">📜</div>
                <h3>Session history</h3>
                <p>
                  SQLite stores transcripts and suggestions so you can review
                  past sessions during local development.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="section section-alt">
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

            <div className="pipeline">
              <p className="section-kicker">Data flow</p>
              <div className="pipeline-flow">
                <span>Audio</span>
                <span className="pipeline-arrow">→</span>
                <span>Flask</span>
                <span className="pipeline-arrow">→</span>
                <span>Gemini STT</span>
                <span className="pipeline-arrow">→</span>
                <span>Transcript</span>
                <span className="pipeline-arrow">→</span>
                <span>Suggestions</span>
                <span className="pipeline-arrow">→</span>
                <span>Overlay</span>
              </div>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section id="use-cases" className="section">
          <div className="site-wrap">
            <p className="section-kicker">Use cases</p>
            <h2 className="section-title">Built for real conversations</h2>
            <div className="use-grid">
              <article className="use-card">
                <h3>Interviews</h3>
                <p>
                  Keep a calm transcript and short prompts when questions come
                  fast — still fully disclosed to the other person if you want.
                </p>
              </article>
              <article className="use-card">
                <h3>Client calls</h3>
                <p>
                  Surface clarifying questions and next steps while the
                  conversation is still going.
                </p>
              </article>
              <article className="use-card">
                <h3>Standups & reviews</h3>
                <p>
                  Capture action items as they are spoken instead of rewriting
                  notes after the fact.
                </p>
              </article>
              <article className="use-card">
                <h3>Portfolio demos</h3>
                <p>
                  A clear story for recruiters: real-time STT, LLM assist, and
                  a transparent product stance.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Transparent positioning */}
        <section id="transparent" className="section section-alt">
          <div className="site-wrap">
            <p className="section-kicker">Positioning</p>
            <h2 className="section-title">Transparent by design</h2>
            <p className="section-lead">
              Many meeting tools compete on being invisible. Hinter competes on
              being explainable — what is captured, where it is processed, and
              how suggestions appear.
            </p>
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

        {/* Stack */}
        <section id="stack" className="section">
          <div className="site-wrap">
            <p className="section-kicker">Under the hood</p>
            <h2 className="section-title">Stack</h2>
            <div className="stack-grid">
              <div className="stack-item">
                <h4>Frontend</h4>
                <p>React, Vite, Socket.IO client</p>
              </div>
              <div className="stack-item">
                <h4>Desktop</h4>
                <p>Electron overlay, Linux system audio</p>
              </div>
              <div className="stack-item">
                <h4>Backend</h4>
                <p>Flask, Flask-SocketIO, SQLAlchemy</p>
              </div>
              <div className="stack-item">
                <h4>AI</h4>
                <p>Gemini Live transcription + suggestions</p>
              </div>
              <div className="stack-item">
                <h4>Deploy</h4>
                <p>Vercel full-stack web demo</p>
              </div>
              <div className="stack-item">
                <h4>Tests</h4>
                <p>Vitest + pytest, CI on GitHub Actions</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="section section-alt">
          <div className="site-wrap">
            <p className="section-kicker">FAQ</p>
            <h2 className="section-title">Common questions</h2>
            <div className="faq-list">
              <details className="faq-item" open>
                <summary>Does a bot join my Zoom or Meet call?</summary>
                <p>
                  No. Hinter runs on your machine or in the browser. Nothing
                  appears in the participant list.
                </p>
              </details>
              <details className="faq-item">
                <summary>Can the other person hear that I use it?</summary>
                <p>
                  Only if you tell them — which is the point. The product is
                  designed so you can disclose it without friction.
                </p>
              </details>
              <details className="faq-item">
                <summary>What works in the browser vs Electron?</summary>
                <p>
                  Browser: mic and optional tab/screen audio. Electron on
                  Linux: mic plus system-audio monitor when Pulse/PipeWire is
                  set up.
                </p>
              </details>
              <details className="faq-item">
                <summary>Where is my audio processed?</summary>
                <p>
                  Audio is sent to your Hinter backend, which calls Gemini for
                  transcription and suggestions. API keys stay on the server.
                </p>
              </details>
              <details className="faq-item">
                <summary>Is this open source?</summary>
                <p>
                  Yes. The full stack is on GitHub under MIT — clone it, run
                  locally, or extend it for your own portfolio.
                </p>
              </details>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="section cta">
          <div className="site-wrap cta-inner">
            <h2>Try it on this page</h2>
            <p>
              Allow the microphone, press Listen on the live panel, and talk.
              For the always-on-top desktop overlay, clone the repo and run
              Electron locally.
            </p>
            <div className="hero-actions" style={{ justifyContent: 'center' }}>
              <a className="site-btn site-btn-primary" href="#demo">
                Back to live demo
              </a>
              <a
                className="site-btn site-btn-ghost"
                href="https://github.com/olivermooz-117/Hinter"
                target="_blank"
                rel="noopener noreferrer"
              >
                Star on GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-wrap site-footer-row">
          <span>Hinter — transparent AI meeting co-pilot</span>
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
            <a
              href="https://github.com/olivermooz-117/Hinter"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
