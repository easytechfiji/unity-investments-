import React from 'react'

export default function Hero() {
  return (
    <header className="hero" id="home">
      <div className="hero-inner container">
        <div className="hero-copy">
          <p className="eyebrow">MULTI-CATEGORY RETAIL TRADING</p>
          <h1>Products chosen with care, ready for everyday demand.</h1>
          <p>
            Unity Investment connects customers with useful products across vehicles, phones, electronics, home goods, bedding and daily essentials.
          </p>

          <div className="hero-ctas">
            <a className="btn btn-primary" href="#catalogue">Browse Products</a>
            <a className="btn btn-secondary" href="#about">About Us</a>
          </div>
        </div>

      </div>

      <style>{`
        .hero { position: relative; min-height: 92vh; padding: 126px clamp(24px, 5vw, 80px) 64px; background: #f6fbff; color: var(--ink); overflow: hidden; scroll-margin-top: 90px; }
        .hero::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(90deg, rgba(251,250,247,0.97) 0%, rgba(251,250,247,0.88) 46%, rgba(251,250,247,0.42) 100%), url('https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1800&q=80'); background-position: center; background-size: cover; transform: scale(1.04); animation: heroImageDrift 16s var(--ease-out) infinite alternate; pointer-events: none; }
        .hero::after { content: ''; position: absolute; inset: 0; background-image: linear-gradient(180deg, rgba(251,250,247,0) 78%, var(--cream) 100%); pointer-events: none; }
        .hero-inner { position: relative; z-index: 1; }
        .hero-inner { display: block; }
        .hero-copy { max-width: 920px; }
        .eyebrow { margin: 0 0 22px; color: var(--accent-strong); font-size: 0.76rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
        .hero h1 { margin: 0 0 24px; max-width: 900px; color: var(--ink); font-size: clamp(2.9rem, 6.6vw, 5.8rem); line-height: 0.98; letter-spacing: 0; }
        .hero-copy p { margin: 0 0 34px; max-width: 690px; color: var(--ink-soft); font-size: clamp(1rem, 1.4vw, 1.16rem); line-height: 1.8; }

        .hero-ctas { display: flex; gap: 14px; flex-wrap: wrap; }
        .btn { display: inline-flex; align-items: center; justify-content: center; min-width: 168px; padding: 15px 22px; border-radius: 999px; border: 1px solid transparent; cursor: pointer; font-size: 0.86rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; transition: transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out), background 220ms var(--ease-out), color 220ms var(--ease-out); }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 18px 50px rgba(15, 23, 42, 0.14); }
        .btn-primary { background: var(--blue); color: var(--white); }
        .btn-secondary { background: rgba(255,255,255,0.74); color: var(--ink); border-color: rgba(200,169,110,0.62); backdrop-filter: blur(10px); }

        @keyframes heroImageDrift {
          from { transform: scale(1.04) translate3d(0, 0, 0); }
          to { transform: scale(1.08) translate3d(-14px, 10px, 0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero::before { animation: none; }
        }

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
