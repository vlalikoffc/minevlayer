/**
 * Vanilla server bootstrap for the playtest. No minecraft-wrap, no magic:
 *   1. resolve the version in Mojang's piston-meta manifest and download server.jar
 *   2. write eula.txt (eula=true) and server.properties (offline, survival, no monsters)
 *   3. start java, wait for "Done", expose stop()
 *
 * The bots are NOT op — the world is exactly what a fresh survival player gets.
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const { spawn } = require('child_process')

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

function fetchJson (url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`))
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (err) { reject(err) }
      })
    }).on('error', reject)
  })
}

function downloadFile (url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part'
    const file = fs.createWriteStream(tmp)
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`GET ${url} -> HTTP ${res.statusCode}`))
      res.pipe(file)
      file.on('finish', () => file.close(() => { fs.renameSync(tmp, dest); resolve() }))
    }).on('error', err => { fs.rmSync(tmp, { force: true }); reject(err) })
  })
}

async function downloadServerJar (mcVersion, jarDir) {
  fs.mkdirSync(jarDir, { recursive: true })
  const jar = path.join(jarDir, `minecraft_server.${mcVersion}.jar`)
  if (fs.existsSync(jar) && fs.statSync(jar).size > 1_000_000) return jar
  const manifest = await fetchJson(MANIFEST_URL)
  const entry = manifest.versions.find(v => v.id === mcVersion)
  if (!entry) throw new Error(`Minecraft ${mcVersion} is not in Mojang's version manifest`)
  const meta = await fetchJson(entry.url)
  const url = meta.downloads?.server?.url
  if (!url) throw new Error(`Minecraft ${mcVersion} has no server download`)
  console.log(`  downloading ${url}`)
  await downloadFile(url, jar)
  return jar
}

function writeProperties (dir, props) {
  const lines = Object.entries(props).map(([k, v]) => `${k}=${v}`)
  fs.writeFileSync(path.join(dir, 'server.properties'), lines.join('\n') + '\n')
}

/**
 * @param {object} o
 * @param {string} o.mcVersion   e.g. "1.21.4"
 * @param {number} o.port
 * @param {string} o.dir         server working directory (world lives here)
 * @param {string} [o.jarDir]    where server jars are cached
 * @param {boolean} [o.log]      echo server console
 * @param {string} [o.seed]
 */
async function startServer ({ mcVersion, port, dir, jarDir = path.join(process.cwd(), 'server_jars'), log = false, seed = '' }) {
  console.log(`Preparing Minecraft ${mcVersion} server in ${dir}`)
  const jar = await downloadServerJar(mcVersion, jarDir)

  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // Mojang makes you accept the EULA by hand. We are a CI, so: read https://aka.ms/MinecraftEULA
  fs.writeFileSync(path.join(dir, 'eula.txt'), '# accepted automatically by minevlayer playtest\neula=true\n')
  writeProperties(dir, {
    'server-port': port,
    'online-mode': 'false',
    'enforce-secure-profile': 'false',
    gamemode: 'survival',
    'force-gamemode': 'true',
    difficulty: 'easy', // hunger works (peaceful would refill it), but no monsters:
    'spawn-monsters': 'false',
    'spawn-animals': 'true',
    'spawn-npcs': 'false',
    'level-type': 'minecraft\\:normal',
    'level-seed': seed,
    'generate-structures': 'false',
    'spawn-protection': '0', // bots are not op: without this they could not dig near spawn
    'view-distance': '6',
    'simulation-distance': '6',
    'max-players': '20',
    'allow-flight': 'true', // a laggy CI runner must not get bots kicked for "flying"
    'player-idle-timeout': '0',
    'sync-chunk-writes': 'false',
    'use-native-transport': 'false',
    motd: 'minevlayer playtest'
  })

  const java = process.env.JAVA || 'java'
  const child = spawn(java, ['-Xms1G', '-Xmx2G', '-XX:+UseG1GC', '-jar', jar, 'nogui'], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] })
  const lines = []
  const onLine = (line) => {
    lines.push(line)
    if (lines.length > 500) lines.shift()
    if (log) console.log('  [server] ' + line)
  }
  let buffer = ''
  const feed = chunk => {
    buffer += chunk.toString()
    let idx
    while ((idx = buffer.indexOf('\n')) >= 0) {
      onLine(buffer.slice(0, idx).trimEnd())
      buffer = buffer.slice(idx + 1)
    }
  }
  child.stdout.on('data', feed)
  child.stderr.on('data', feed)

  const exited = new Promise(resolve => child.once('exit', code => resolve(code)))

  console.log(`Starting server on port ${port} (java: ${java})`)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not print "Done" within 5 minutes\n' + lines.slice(-30).join('\n'))), 5 * 60_000)
    const check = setInterval(() => {
      if (lines.some(l => /\]: Done \(/.test(l))) { clearTimeout(timer); clearInterval(check); resolve() }
    }, 250)
    exited.then(code => {
      clearTimeout(timer); clearInterval(check)
      reject(new Error(`server exited with code ${code} before it was ready\n` + lines.slice(-30).join('\n')))
    })
  })

  return {
    host: '127.0.0.1',
    port,
    process: child,
    lastLines: () => lines.slice(-50),
    async stop () {
      if (child.exitCode !== null) return
      child.stdin.write('stop\n')
      const code = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve('timeout'), 30_000))])
      if (code === 'timeout') child.kill('SIGKILL')
    }
  }
}

module.exports = { startServer, downloadServerJar }
