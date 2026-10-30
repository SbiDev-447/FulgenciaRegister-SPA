'use strict'

const service = require('./ajustes.service')
const mantenimiento = require('./ajustes.mantenimiento')
const { HttpError } = require('../../utils/httpError')
const { MAX_LOGO_BYTES } = require('./ajustes.service')

/** Settings, logo metadata and the maintenance operations. */
async function get(req, res, next) {
  try {
    res.json(await service.getAjustes())
  } catch (error) {
    next(error)
  }
}

async function putDirector(req, res, next) {
  try {
    res.json(await service.saveDirector(req.body ?? {}))
  } catch (error) {
    next(error)
  }
}

// The image travels as the request body itself, not as base64 inside JSON: the
// global JSON parser stops at 100 KB and opening it for the whole API to accept
// a 2 MB photo is a larger door than this one filter.
/**
 * Read the raw request body, refusing anything over `limit`.
 * @param {import('express').Request} req
 * @param {number} limit
 * @returns {Promise<Buffer>}
 */
function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0)
    if (Number.isFinite(declared) && declared > limit) {
      req.resume()
      reject(new HttpError(413, 'payload_too_large', 'The image exceeds the 2 MB limit', {
        logo: 'must be at most 2 MB',
      }))
      return
    }

    const chunks = []
    let size = 0
    let settled = false

    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        settled = true
        // Stop buffering and drain the rest so the 413 can still be written;
        // destroying the request here would take the response with it.
        req.removeAllListeners('data')
        req.removeAllListeners('end')
        req.removeAllListeners('error')
        req.resume()
        reject(new HttpError(413, 'payload_too_large', 'The image exceeds the 2 MB limit', {
          logo: 'must be at most 2 MB',
        }))
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })

    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

async function putLogo(req, res, next) {
  try {
    const buffer = await readRawBody(req, MAX_LOGO_BYTES)
    const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim()
    res.json(await service.saveLogo({ mime, buffer }))
  } catch (error) {
    next(error)
  }
}

async function getLogo(req, res, next) {
  try {
    const logo = await service.getLogo()
    if (!logo) {
      return next(HttpError.notFound('No logo configured'))
    }
    // `no-cache` revalidates instead of reusing: a replaced logo must show up on
    // the next print. The ETag express computes for the buffer answers 304.
    res.set('Cache-Control', 'no-cache')
    res.type(logo.mime)
    return res.send(logo.buffer)
  } catch (error) {
    return next(error)
  }
}

async function getHuerfanos(req, res, next) {
  try {
    res.json(await mantenimiento.listOrphans())
  } catch (error) {
    next(error)
  }
}

async function purgarHuerfanos(req, res, next) {
  try {
    res.json(await mantenimiento.purgeOrphans())
  } catch (error) {
    next(error)
  }
}

async function postBackup(req, res, next) {
  try {
    res.json(mantenimiento.backup())
  } catch (error) {
    next(error)
  }
}

module.exports = {
  get,
  putDirector,
  putLogo,
  getLogo,
  getHuerfanos,
  purgarHuerfanos,
  postBackup,
}
