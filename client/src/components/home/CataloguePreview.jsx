import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import CategoryCard from './CategoryCard'
import useCategories from '../../hooks/useCategories'
import { containerVariant, itemVariant } from '../../utils/motion'

const CataloguePreview = () => {
  const navigate = useNavigate()
  const { data: categories, loading, error } = useCategories()

  const handleCategoryClick = (slug) => {
    navigate(`/category/${slug}`)
  }

  const skeletonLoader = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div
          key={item}
          className="h-64 bg-gray-200 rounded-lg animate-pulse"
        />
      ))}
    </div>
  )

  if (error) {
    return (
      <section style={{ padding: '100px 80px' }} className="bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 text-lg">
            Failed to load categories. Please try again later.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section style={{ padding: '100px 80px' }} className="bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="mb-12"
      >
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-4xl font-bold mb-2">The collection</h2>
            <div className="w-16 h-1 bg-blue-600"></div>
          </div>
          <p className="text-gray-600">
            {categories?.length || 0} categories
          </p>
        </div>
      </motion.div>

      {loading ? (
        skeletonLoader
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          variants={containerVariant}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
        >
          {categories?.map((category) => (
            <motion.div
              key={category.id}
              variants={itemVariant}
              onClick={() => handleCategoryClick(category.slug)}
              className="cursor-pointer"
            >
              <CategoryCard category={category} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  )
}

export default CataloguePreview
