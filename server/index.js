import './lib/env.js'
import express from 'express'
import cors from 'cors'
import routesItems from './routes/items.js'
import routesCategories from './routes/categories.js'
import routesAuth from './routes/auth.js'
import routesAdmin from './routes/admin.js'
import routesContact from './routes/contact.js'

const app = express()

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true,
}))
app.use(express.json())

app.use('/api/items', routesItems)
app.use('/api/categories', routesCategories)
app.use('/api/auth', routesAuth)
app.use('/api/admin', routesAdmin)
app.use('/api/contact', routesContact)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server listening on ${PORT}`))

export default app
