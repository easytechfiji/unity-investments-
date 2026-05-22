import React from 'react'

export default function Hero() {
  return (
    <header className="hero" id="home">
      <div className="hero-inner container">
        <div className="hero-copy">
          <p className="eyebrow">MULTI-CATEGORY RETAIL TRADING</p>
          <h1>Retail products sourced across everyday and premium categories.</h1>
          <p>
            Unity Investment buys and sells products from different retailers, covering vehicles, phones, electronics, home goods, blankets and daily essentials.
          </p>

          <div className="hero-ctas">
            <a className="btn btn-primary" href="#catalogue">Browse Products</a>
            <a className="btn btn-secondary" href="#about">How It Works</a>
          </div>
        </div>

      </div>

      <style>{`
        .hero { position: relative; min-height: 100vh; padding: 126px clamp(24px, 5vw, 80px) 64px; background: #fbfaf8; color: var(--ink); overflow: hidden; scroll-margin-top: 90px; }
        .hero::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(rgba(17,17,17,0.085) 0.8px, transparent 0.8px), linear-gradient(90deg, rgba(15,23,42,0.035) 1px, transparent 1px), linear-gradient(180deg, rgba(15,23,42,0.03) 1px, transparent 1px), radial-gradient(circle at 18% 22%, rgba(200,169,110,0.24), transparent 26%), radial-gradient(circle at 82% 18%, rgba(30,58,138,0.16), transparent 28%), radial-gradient(circle at 74% 86%, rgba(59,130,246,0.09), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.88), rgba(249,247,244,0.94)); background-size: 18px 18px, 120px 120px, 120px 120px, 100% 100%, 100% 100%, 100% 100%, 100% 100%; opacity: 1; pointer-events: none; }
        .hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.52) 48%, rgba(255,255,255,0.72) 100%); pointer-events: none; }
        .hero-inner { position: relative; z-index: 1; }
        .hero-inner { display: block; }
        .hero-copy { max-width: 920px; }
        .eyebrow { margin: 0 0 22px; color: var(--accent); font-size: 0.76rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
        .hero h1 { margin: 0 0 24px; max-width: 900px; font-size: clamp(2.9rem, 6.6vw, 5.8rem); line-height: 0.98; letter-spacing: -0.035em; }
        .hero-copy p { margin: 0 0 34px; max-width: 690px; color: var(--ink-soft); font-size: clamp(1rem, 1.4vw, 1.16rem); line-height: 1.8; }

        .hero-ctas { display: flex; gap: 14px; flex-wrap: wrap; }
        .btn { display: inline-flex; align-items: center; justify-content: center; min-width: 168px; padding: 15px 22px; border-radius: 999px; border: 1px solid transparent; cursor: pointer; font-size: 0.86rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; transition: transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out), background 220ms var(--ease-out), color 220ms var(--ease-out); }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); }
        .btn-primary { background: var(--blue-dark); color: var(--white); }
        .btn-secondary { background: transparent; color: var(--ink); border-color: var(--accent); }

        @media (max-width: 920px) {
          .hero { padding: 112px 24px 56px; }
        }

        @media (max-width: 560px) {
          .hero { padding-top: 104px; }
          .hero-ctas { flex-direction: column; }
          .btn { width: 100%; }
        }
      `}</style>
    </header>
  )
}
