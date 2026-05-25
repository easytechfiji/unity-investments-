import { Link } from 'react-router-dom';

export default function Footer() {
  const linkStyle = {
    fontSize: '0.72rem',
    textDecoration: 'none',
    color: 'var(--ink-soft)',
    textTransform: 'uppercase',
    transition: 'color 0.25s ease',
    cursor: 'pointer',
    fontWeight: 700,
    letterSpacing: '0.08em',
  };

  return (
    <footer style={{
      borderTop: '1px solid rgba(200, 169, 110, 0.2)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 'clamp(28px, 4vw, 44px) clamp(16px, 10vw, 80px)',
      backgroundColor: '#ffffff',
      color: 'var(--ink)',
      gap: '20px',
      flexWrap: 'wrap',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <Link to="/" aria-label="Unity Investment home" style={{
        display: 'inline-flex',
        alignItems: 'center',
        flex: '0 0 auto',
      }}>
        <img
          src="/brand/company-logo.png"
          alt="Unity Investment"
          style={{
            display: 'block',
            width: 'clamp(130px, 16vw, 180px)',
            height: '48px',
            objectFit: 'contain',
            objectPosition: 'left center',
          }}
        />
      </Link>

      <div style={{
        textAlign: 'center',
        fontSize: '0.72rem',
        flex: 1,
        minWidth: '180px',
        color: 'var(--ink-soft)',
      }}>
        Copyright 2024 Unity Investment. All rights reserved.
      </div>

      <nav style={{
        display: 'flex',
        gap: '22px',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
      }}>
        {[
          ['Home', '/'],
          ['Products', '/#catalogue'],
          ['About', '/#about'],
          ['Contact', '/#contact'],
        ].map(([label, to]) => (
          <Link
            key={label}
            to={to}
            style={linkStyle}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--ink-soft)'}
          >
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
