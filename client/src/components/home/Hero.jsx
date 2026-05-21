import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useCategories from '../../hooks/useCategories'

export default function Hero() {
  const { data: categories = [], loading } = useCategories()
  const [index, setIndex] = useState(0)
  const containerRef = useRef(null)

  // keep index within bounds
  useEffect(() => {
    if (!categories || categories.length === 0) setIndex(0)
    else setIndex((i) => Math.min(i, Math.max(0, categories.length - 1)))
  }, [categories])

  const prev = () => setIndex((i) => (i - 1 + categories.length) % Math.max(1, categories.length))
  const next = () => setIndex((i) => (i + 1) % Math.max(1, categories.length))

  return (
    <header className="hero">
      <div className="hero-inner container" ref={containerRef}>
        <div className="hero-copy">
          <div className="eyebrow">Est. 2024 — Premium Catalogue</div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            Every product,
            <span className="accent"> curated beautifully.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
            From high-performance vehicles to everyday essentials — a single, refined space for everything worth owning.
          </motion.p>

          <div className="hero-ctas">
            <motion.button whileHover={{ scale: 1.03 }} className="btn primary">Browse catalogue</motion.button>
            <motion.button whileHover={{ scale: 1.03 }} className="btn ghost">Learn more</motion.button>
          </div>
        </div>

        <div className="hero-media">
          <div className="carousel">
            <button className="carousel-arrow left" onClick={prev} aria-label="Previous">‹</button>

            <div className="carousel-frame">
              <AnimatePresence initial={false} mode="popLayout">
                {categories && categories.slice(index, index + 3).map((cat, i) => (
                  <motion.div
                    key={cat?.id ?? `${index}-${i}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.45 }}
                    className="card"
                    onClick={() => {
                      // optional: navigate to category; left for later
                    }}
                  >
                    <div className="card-media" />
                    <div className="card-body">
                      <div className="card-category">{cat?.name || 'Category'}</div>
                      <h4 className="card-title">{cat?.description || 'Beautiful products'}</h4>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <button className="carousel-arrow right" onClick={next} aria-label="Next">›</button>
          </div>
        </div>
      </div>

      <style>{`
        .hero { padding: 80px 0; background: linear-gradient(180deg, var(--cream) 0%, #fff 100%); }
        .hero-inner { display: grid; grid-template-columns: 1fr 520px; gap: 48px; align-items: center; }
        .hero-copy .eyebrow { color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.8rem; margin-bottom: 12px; }
        .hero-copy h1 { font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3.5rem); margin: 0 0 12px 0; line-height: 1.02; }
        .hero-copy .accent { color: var(--accent); }
        .hero-copy p { color: var(--ink-soft); max-width: 46ch; margin-bottom: 20px; }
        .hero-ctas { display: flex; gap: 12px; }
        .btn { padding: 12px 18px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; font-weight: 500; }
        .btn.primary { background: var(--ink); color: var(--white); }
        .btn.ghost { background: transparent; border-color: var(--border); color: var(--ink); }

        .hero-media { display: flex; justify-content: center; }
        .carousel { display: flex; align-items: center; gap: 12px; }
        .carousel-arrow { background: transparent; border: 1px solid var(--border); width: 44px; height: 44px; border-radius: 8px; cursor: pointer; font-size: 22px; color: var(--ink-soft); }
        .carousel-frame { display: flex; gap: 16px; overflow: hidden; width: 420px; }
        .card { width: 140px; background: var(--white); border-radius: 12px; box-shadow: 0 6px 20px rgba(17,17,17,0.06); cursor: pointer; display: flex; flex-direction: column; }
        .card-media { height: 92px; background: #ede9e2; border-top-left-radius: 12px; border-top-right-radius: 12px; }
        .card-body { padding: 10px; }
        .card-category { font-size: 0.75rem; color: var(--accent); text-transform: uppercase; }
        .card-title { margin: 6px 0 0 0; font-size: 0.95rem; }

        @media (max-width: 980px) { .hero-inner { grid-template-columns: 1fr; } .hero-media { margin-top: 28px; } }
      `}</style>
    </header>
  )
}

