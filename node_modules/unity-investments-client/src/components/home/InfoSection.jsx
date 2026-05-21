export default function InfoSection() {
  const containerStyle = {
    padding: 'clamp(32px, 5vw, 120px) clamp(16px, 10vw, 80px)',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 'clamp(40px, 5vw, 80px)',
    alignItems: 'center',
    width: '100%',
    boxSizing: 'border-box',
    maxWidth: '1400px',
    margin: '0 auto',
  };

  const imagePlaceholderStyle = {
    backgroundColor: '#ede9e2',
    aspectRatio: '1',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    border: '2px inset rgba(0, 0, 0, 0.1)',
    borderRadius: '2px',
    fontSize: 'clamp(3rem, 10vw, 5rem)',
    fontWeight: '300',
    color: 'rgba(0, 0, 0, 0.15)',
    letterSpacing: '2px',
    minHeight: '300px',
  };

  const contentStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  };

  const eyebrowStyle = {
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    color: 'var(--accent)',
    fontWeight: '600',
    letterSpacing: '1.5px',
  };

  const headlineStyle = {
    fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
    fontWeight: '600',
    lineHeight: '1.3',
    color: 'var(--text-primary, #000)',
  };

  const bodyStyle = {
    fontSize: '0.95rem',
    lineHeight: '1.8',
    color: 'var(--text-secondary, #666)',
  };

  const statsContainerStyle = {
    borderTop: '1px solid var(--border, #e0e0e0)',
    paddingTop: '24px',
    marginTop: '8px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '24px',
  };

  const statStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  };

  const statValueStyle = {
    fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
    fontWeight: '600',
    color: 'var(--text-primary, #000)',
  };

  const statLabelStyle = {
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    color: 'var(--text-secondary, #666)',
    letterSpacing: '0.5px',
  };

  return (
    <section style={containerStyle}>
      {/* Left: Image Placeholder */}
      <div className="reveal" style={{ animationDelay: '0.2s' }}>
        <div style={imagePlaceholderStyle}>
          VAULT
        </div>
      </div>

      {/* Right: Text Content */}
      <div className="reveal" style={{ animationDelay: '0.4s' }}>
        <div style={contentStyle}>
          <div style={eyebrowStyle}>
            Our story
          </div>

          <h2 style={headlineStyle}>
            Built for those who appreciate the detail.
          </h2>

          <div style={bodyStyle}>
            <p>
              At Vault, we believe that luxury isn't just about price—it's about craftsmanship, heritage, and attention to detail. Every item in our collection has been carefully curated to meet our exacting standards.
            </p>
            <p>
              Founded in 2024, we set out to create a platform where discerning collectors can discover rare and exceptional pieces that tell a story. From vintage timepieces to contemporary art, each product represents the pinnacle of quality.
            </p>
            <p>
              Our mission is to democratize access to luxury goods while maintaining the exclusivity and prestige that defines the category. We're not just selling products—we're building a community of connoisseurs.
            </p>
          </div>

          {/* Stats Section */}
          <div style={statsContainerStyle}>
            <div style={statStyle}>
              <div style={statValueStyle}>200+</div>
              <div style={statLabelStyle}>Products listed</div>
            </div>
            <div style={statStyle}>
              <div style={statValueStyle}>12</div>
              <div style={statLabelStyle}>Categories</div>
            </div>
            <div style={statStyle}>
              <div style={statValueStyle}>4k+</div>
              <div style={statLabelStyle}>Monthly visitors</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
