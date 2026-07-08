import express from 'express'
import supabase from '../lib/supabase.js'

const router = express.Router()

const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'item-images'

// PostgREST .or() filters are comma/paren delimited and ilike patterns treat
// % _ \ as wildcards, so strip/escape them to keep user input a literal match.
function sanitizeSearch(value) {
  return value
    .replace(/[,()]/g, ' ')
    .replace(/[\\%_]/g, '\\$&')
    .trim()
    .slice(0, 100)
}

function toPublicImageUrl(imagePath) {
  if (!imagePath || !supabase) return null

  const { data } = supabase.storage.from(storageBucket).getPublicUrl(imagePath)
  return data?.publicUrl || null
}

function mapItem(row) {
  const category = row.categories || {}

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url || toPublicImageUrl(row.image_path),
    imagePath: row.image_path,
    categoryId: row.category_id,
    categoryName: category.name,
    categorySlug: category.slug,
    price: row.price,
    tags: row.tags || [],
    createdAt: row.created_at,
  }
}

router.get('/', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured' })
  }

  const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1)
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '12', 10), 1), 48)
  const from = (page - 1) * limit
  const to = from + limit - 1
  const category = String(req.query.category || '').trim()
  const search = sanitizeSearch(String(req.query.search || ''))

  let query = supabase
    .from('items')
    .select(`
      id,
      name,
      description,
      image_url,
      image_path,
      price,
      tags,
      category_id,
      created_at,
      categories!inner (
        id,
        slug,
        name
      )
    `, { count: 'exact' })
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (category) {
    query = query.eq('categories.slug', category)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const { data, count, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Unable to load items' })
  }

  res.json({
    items: (data || []).map(mapItem),
    total: count || 0,
    page,
    limit,
  })
})

router.get('/:id', async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured' })
  }

  const { data, error } = await supabase
    .from('items')
    .select(`
      id,
      name,
      description,
      image_url,
      image_path,
      price,
      tags,
      category_id,
      created_at,
      categories (
        id,
        slug,
        name
      )
    `)
    .eq('id', req.params.id)
    .eq('is_active', true)
    .single()

  if (error) {
    return res.status(404).json({ error: 'Item not found' })
  }

  res.json(mapItem(data))
})

export default router
