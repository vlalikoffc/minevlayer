if (typeof process !== 'undefined' && !process.browser && process.platform !== 'browser' && parseInt(process.versions.node.split('.')[0]) < 18) {
  console.error('Your node version is currently', process.versions.node)
  console.error('Please update it to a version >= 22.x.x from https://nodejs.org/')
  process.exit(1)
}

// Vendor: original Mineflayer (JS) lives in vendor/mineflayer
// This file keeps backward compatibility for `require('minevlayer')` when package main is not used,
// and for internal `require('../index')` imports in src/
module.exports = require('./vendor/mineflayer')
