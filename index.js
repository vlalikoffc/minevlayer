if (typeof process !== 'undefined' && !process.browser && parseInt(process.versions.node.split('.')[0]) < 22) {
  console.error('Your node version is currently', process.versions.node)
  console.error('Please update it to a version >= 22 from https://nodejs.org/')
  process.exit(1)
}

// minevlayer: вся логика в src/ -> dist/. Mineflayer — зависимость в vendor/.
module.exports = require('./dist')
