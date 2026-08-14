import { creditsPerPack } from "../lib/stripeBilling";

export default function Home() {
  const packSize = creditsPerPack();

  return (
    <main className="rmfHome">
      <nav className="homeNav">
        <a href="/" className="homeWordmark">RATE MY FACE</a>
        <a href="/account" className="homeAccountLink">My credits</a>
      </nav>

      <section className="homeHero">
        <div>
          <p className="homeKicker">Your appearance, measured against you</p>
          <h1>Stop guessing what actually works.</h1>
          <p className="homeLead">
            Keep your preferences, comparisons, experiments, and appearance plan connected to one Rate My Face account.
          </p>
          <div className="homeActions">
            <a href="/account" className="homePrimary">See my credits</a>
            <a href="#included" className="homeSecondary">What credits unlock</a>
          </div>
        </div>
        <aside className="homeProof" aria-label="Rate My Face credit model">
          <span>One account</span>
          <strong>{packSize}</strong>
          <p>credits in the currently configured pack</p>
          <small>Live price shown inside your account</small>
        </aside>
      </section>

      <section className="homeIncluded" id="included">
        <p className="homeKicker">Built for progress, not one-off scores</p>
        <div className="homeFeatureGrid">
          <article><span>01</span><h2>Remember</h2><p>Carry useful preferences and prior outcomes into future recommendations.</p></article>
          <article><span>02</span><h2>Compare</h2><p>Measure before-and-after progress against your own reference images.</p></article>
          <article><span>03</span><h2>Test</h2><p>Run personal appearance experiments without overstating uncertain evidence.</p></article>
        </div>
      </section>

      <section className="homeAccountBand">
        <p>Already use Rate My Face?</p>
        <h2>Your history and paid credits belong to your account.</h2>
        <a href="/account" className="homePrimary">Open my account</a>
      </section>

      <p className="homeAffiliate"><strong>As an Amazon Associate I earn from qualifying purchases.</strong></p>
      <footer className="homeFooter">
        <span>Rate My Face</span>
        <div><a href="/privacy">Privacy</a><a href="/dashboard">Business evidence</a><a href="/api/health">System status</a></div>
      </footer>
    </main>
  );
}
