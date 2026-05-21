import { Link } from 'react-router-dom';

export default function Footer() {
  const linkStyle = {
    fontSize: '0.72rem',
    textDecoration: 'none',
    color: 'inherit',
    textTransform: 'uppercase',
    transition: 'color 0.3s ease',
    cursor: 'pointer',
  };

  return (
    <footer style={{
      borderTop: '1px solid var(--border, #e0e0e0)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 'clamp(32px, 5vw, 48px) clamp(16px, 10vw, 80px)',
      backgroundColor: 'var(--white)',
      gap: '20px',
      flexWrap: 'wrap',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
        VAULT
      </div>
      
      <div style={{ 
        textAlign: 'center',
        fontSize: '0.72rem',
        flex: 1,
        minWidth: '150px'
      }}>
        © 2024 Vault. All rights reserved.
      </div>
      
      <nav style={{
        display: 'flex',
        gap: '24px',
      }}>
        <Link 
          to="/" 
          style={linkStyle}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
        >
          Home
        </Link>
        <Link 
          to="/products" 
          style={linkStyle}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
        >
          Products
        </Link>
        <Link 
          to="/about" 
          style={linkStyle}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
        >
          About
        </Link>
        <Link 
          to="/contact" 
          style={linkStyle}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
        >
          Contact
        </Link>
      </nav>
    </footer>
  );
}
