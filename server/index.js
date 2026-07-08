import './lib/env.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import routesItems from './routes/items.js'
import routesCategories from './routes/categories.js'
import routesContact from './routes/contact.js'

const app = express()
const isProduction = process.env.NODE_ENV === 'production'

app.disable('x-powered-by')
// Needed for correct client IPs (and thus rate limiting) behind a proxy/CDN.
app.set('trust proxy', 1)

app.use(helmet())

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (isProduction && allowedOrigins.length === 0) {
  console.warn('CORS_ORIGIN is not set; cross-origin requests will be blocked.')
}

app.use(cors({
  // In production, only origins listed in CORS_ORIGIN are allowed — never fall
  // back to allowing everything. The permissive fallback is dev-only.
  origin: allowedOrigins.length > 0 ? allowedOrigins : !isProduction,
}))

app.use(express.json({ limit: '32kb' }))

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
})

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent. Please try again later.' },
})

app.use('/api', apiLimiter)
app.use('/api/items', routesItems)
app.use('/api/categories', routesCategories)
app.use('/api/contact', contactLimiter, routesContact)

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: 'Internal server error' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server listening on ${PORT}`))

export default app
