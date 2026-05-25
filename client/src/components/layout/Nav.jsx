import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import '../../styles/nav.css';

export default function Nav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Home', href: '/', targetId: 'home' },
    { label: 'Products', href: '/#catalogue', targetId: 'catalogue' },
    { label: 'About', href: '/#about', targetId: 'about' },
    { label: 'Contact', href: '/#contact', targetId: 'contact' },
  ];

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (location.pathname !== '/' || !location.hash) return;

    const target = document.getElementById(location.hash.slice(1));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.pathname, location.hash]);

  const handleNavClick = (event, targetId) => {
    if (location.pathname !== '/' || !targetId) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    navigate(targetId === 'home' ? '/' : `/#${targetId}`, { replace: false });
    setIsMenuOpen(false);
  };

  const isActive = (link) => {
    if (link.href === '/') return location.pathname === '/' && !location.hash;
    return location.hash === `#${link.targetId}`;
  };

  return (
    <motion.nav
      className="nav"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="nav__logo"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <Link to="/" aria-label="Unity Investment home">
          <img className="nav__logo-file" src="/brand/company-logo.png" alt="Unity Investment" />
        </Link>
      </motion.div>

      <button
        className={`nav__toggle ${isMenuOpen ? 'nav__toggle--open' : ''}`}
        type="button"
        aria-label="Toggle navigation menu"
        aria-expanded={isMenuOpen}
        onClick={() => setIsMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>

      <motion.ul
        className={`nav__links ${isMenuOpen ? 'nav__links--open' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {navLinks.map((link, index) => (
          <motion.li
            key={link.href}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + index * 0.05 }}
          >
            <Link
              to={link.href}
              className={`nav__link ${isActive(link) ? 'nav__link--active' : ''}`}
              onClick={(event) => handleNavClick(event, link.targetId)}
            >
              {link.label}
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </motion.nav>
  );
}
