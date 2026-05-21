import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import '../../styles/category-card.css';

export default function CategoryCard({ name, slug, description }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/category/${slug}`);
  };

  return (
    <motion.div
      className="category-card"
      onClick={handleClick}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <motion.div
        className="category-card__image"
        initial={{ opacity: 1 }}
        whileHover={{ opacity: 0.8 }}
        transition={{ duration: 0.3 }}
      >
        <svg
          className="category-card__placeholder-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </motion.div>

      <div className="category-card__content">
        <h3 className="category-card__name">{name}</h3>
        {description && (
          <p className="category-card__description">{description}</p>
        )}
      </div>

      <motion.div
        className="category-card__arrow"
        initial={{ rotate: 45 }}
        whileHover={{ rotate: 45 + 90 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </motion.div>
    </motion.div>
  );
}
