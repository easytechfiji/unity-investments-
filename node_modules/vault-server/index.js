import express from 'express'
import routesItems from './routes/items.js'
import routesCategories from './routes/categories.js'
import routesAuth from './routes/auth.js'
import routesAdmin from './routes/admin.js'

const app = express()
app.use(express.json())

app.use('/api/items', routesItems)
app.use('/api/categories', routesCategories)
app.use('/api/auth', routesAuth)
app.use('/api/admin', routesAdmin)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server listening on ${PORT}`))

export default app
