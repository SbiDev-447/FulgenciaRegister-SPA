'use strict'

const path = require('node:path')
const express = require('express')
const cookieParser = require('cookie-parser')
const { notFound, errorHandler } = require('./middlewares/error')
const academic = require('./constants/academic')
const authRoutes = require('./modules/auth/auth.routes')
const estudianteRoutes = require('./modules/estudiantes/estudiantes.routes')

function createApp() {
  const app = express()

  app.use(express.json())
  app.use(cookieParser())

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
  app.get('/api/academico/opciones', (req, res) => res.json(academic.options()))
  app.use('/api/auth', authRoutes)
  app.use('/api/estudiantes', estudianteRoutes)

  // In development the same Express process serves the static SPA. Routing is
  // hash-based, so a plain static middleware is enough (everything is `/`).
  const clientDir = path.resolve(__dirname, '../../client')
  app.use(express.static(clientDir))

  app.use('/api', notFound)
  app.use(errorHandler)

  return app
}

module.exports = { createApp }
