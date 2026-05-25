import express from 'express'
import supabase from '../lib/supabase.js'

const router = express.Router()

router.get('/', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured' })
  }

  const { data, error } = await supabase
    .from('categories')
    .select('id, slug, name, description, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return res.status(500).json({ error: 'Unable to load categories' })
  }

  res.json(data || [])
})

export default router
