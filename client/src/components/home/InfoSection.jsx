import React from 'react'

export default function InfoSection() {
  return (
    <section className="about-section" id="about">
      <div className="about-inner container">
        <div className="about-heading">
          <p className="eyebrow">ABOUT UNITY INVESTMENT</p>
          <h2>Built for useful products, honest choice and everyday convenience.</h2>
        </div>

        <div className="about-copy">
          <p>
            Unity Investment is a multi-category trading business focused on products people actually need, compare and buy. Instead of making customers search across scattered places, the catalogue brings different product types into one clear experience.
          </p>
          <p>
            From vehicles and smart devices to household goods, bedding and daily essentials, each category is presented with a simple goal: make browsing feel organised, trustworthy and easy to act on.
          </p>
        </div>
      </div>

      <style>{`
        .about-section { position: relative; padding: clamp(72px, 8vw, 112px) 0; background: var(--white); color: var(--ink); scroll-margin-top: 90px; overflow: hidden; border-top: 1px solid rgba(200,169,110,0.14); border-bottom: 1px solid rgba(200,169,110,0.14); }
        .about-section::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(90deg, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.88) 52%, rgba(255,255,255,0.48) 100%), url('https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=1800&q=82'); background-position: center 48%; background-size: cover; transform: scale(1.03); }
        .about-section::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, var(--cream) 0%, rgba(255,255,255,0) 20%, rgba(255,255,255,0) 78%, var(--cream) 100%); pointer-events: none; }
        .about-inner { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1fr); gap: clamp(34px, 6vw, 78px); align-items: start; }
        .about-heading { max-width: 620px; }
        .about-heading .eyebrow { margin: 0 0 18px; color: var(--accent-strong); font-size: 0.76rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
        .about-heading h2 { margin: 0; color: var(--ink); font-size: clamp(2.35rem, 5vw, 4.4rem); line-height: 1.02; }
        .about-copy { display: grid; gap: 18px; max-width: 650px; }
        .about-copy p { margin: 0; color: var(--ink-soft); line-height: 1.8; }

        @media (max-width: 900px) {
          .about-section { padding: 64px 0; }
          .about-inner { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  )
}
