import React from 'react'
import Hero from '../components/home/Hero'
import InfoSection from '../components/home/InfoSection'
import CataloguePreview from '../components/home/CataloguePreview'
import Contact from '../components/home/Contact'

export default function Home() {
  return (
    <div className="home-page">
      <Hero />
      <InfoSection />
      <CataloguePreview />
      <Contact />
    </div>
  )
}
