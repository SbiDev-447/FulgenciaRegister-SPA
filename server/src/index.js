'use strict'

const { port } = require('./config/env')
const db = require('./config/db')
const { createApp } = require('./app')

async function bootstrap() {
  const results = await db.createAllTables()
  const failed = results.filter((result) => result.status !== 'ok')

  if (failed.length > 0) {
    console.error('Schema bootstrap failed:', failed)
    process.exit(1)
  }

  const created = results.map((result) => result.tabla).join(', ')
  console.log(`Schema ready: ${created}`)

  const app = createApp()
  app.listen(port, () => {
    console.log(`Fulgencia API listening on http://localhost:${port}`)
  })
}

bootstrap().catch((error) => {
  console.error('Fatal startup error:', error)
  process.exit(1)
})
