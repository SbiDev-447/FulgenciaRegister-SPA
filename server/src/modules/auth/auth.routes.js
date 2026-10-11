'use strict'

const express = require('express')
const controller = require('./auth.controller')
const { requireAuth } = require('../../middlewares/auth')

const router = express.Router()

router.post('/login', controller.login)
router.get('/me', requireAuth, controller.me)
router.post('/logout', controller.logout)

module.exports = router
