'use strict'

const express = require('express')
const controller = require('./documentos.controller')
const { requireAuth } = require('../../middlewares/auth')

const router = express.Router()

// Every documentos endpoint requires a valid auth cookie.
router.use(requireAuth)

router.get('/verificar/:cedula', controller.verificar)
router.post('/emitir', controller.emitir)

module.exports = router
