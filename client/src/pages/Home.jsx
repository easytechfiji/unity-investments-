import React from 'react'
import Hero from '../components/home/Hero'
import CataloguePreview from '../components/home/CataloguePreview'
import InfoSection from '../components/home/InfoSection'
import Contact from '../components/home/Contact'

export default function Home() {
  return (
    <main>
      <Hero />
      <CataloguePreview />
      <InfoSection />
      <Contact />
    </main>
  )
}
