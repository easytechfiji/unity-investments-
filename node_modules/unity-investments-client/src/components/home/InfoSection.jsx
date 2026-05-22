import React from 'react'

const steps = [
  {
    title: 'Source',
    body: 'We work across different retailers and suppliers to find products people actually want.',
  },
  {
    title: 'List',
    body: 'Items are organised into simple categories so customers can compare quickly and confidently.',
  },
  {
    title: 'Sell',
    body: 'The catalogue keeps the buying experience clear, practical and easy to navigate.',
  },
]

export default function InfoSection() {
  return (
    <section className="about-section" id="about">
      <div className="about-inner container">
        <div className="about-heading">
          <p className="eyebrow">HOW UNITY INVESTMENT WORKS</p>
          <h2>A straightforward catalogue for many kinds of products.</h2>
        </div>

        <div className="about-copy">
          <p>
            Unity Investment buys and sells across a wide product range instead of focusing on one niche. The goal is straightforward: make it easier to discover useful products from different retailers in one clean place.
          </p>
          <p>
            Cars, phones, electronics, blankets, home goods and everyday essentials can all sit together without the experience feeling messy.
          </p>
        </div>

        <div className="process-list">
          {steps.map((step, index) => (
            <article key={step.title} className="process-item">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </div>

      <style>{`
        .about-section { padding: clamp(72px, 8vw, 112px) 0; background: #090c14; color: var(--white); scroll-margin-top: 90px; }
        .about-inner { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(320px, 1fr); gap: clamp(34px, 6vw, 78px); align-items: start; }
        .about-heading { max-width: 620px; }
        .about-heading .eyebrow { margin: 0 0 18px; color: var(--accent); font-size: 0.76rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
        .about-heading h2 { margin: 0; color: var(--white); font-size: clamp(2.35rem, 5vw, 4.4rem); line-height: 1.02; }
        .about-copy { display: grid; gap: 18px; max-width: 650px; }
        .about-copy p { margin: 0; color: rgba(255,255,255,0.68); line-height: 1.8; }
        .process-list { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1); }
        .process-item { padding: 28px 30px 30px 0; border-right: 1px solid rgba(255,255,255,0.08); }
        .process-item + .process-item { padding-left: 30px; }
        .process-item:last-child { border-right: none; }
        .process-item span { display: block; margin-bottom: 22px; color: var(--accent); font-size: 0.78rem; font-weight: 700; letter-spacing: 0.16em; }
        .process-item h3 { margin: 0 0 10px; color: var(--white); font-family: var(--font-body); font-size: 1.05rem; font-weight: 700; letter-spacing: 0; }
        .process-item p { margin: 0; color: rgba(255,255,255,0.62); line-height: 1.75; }

        @media (max-width: 900px) {
          .about-section { padding: 64px 24px; }
          .about-inner { grid-template-columns: 1fr; }
          .process-list { grid-template-columns: 1fr; }
          .process-item, .process-item + .process-item { padding: 24px 0; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.08); }
          .process-item:last-child { border-bottom: none; }
        }
      `}</style>
    </section>
  )
}
