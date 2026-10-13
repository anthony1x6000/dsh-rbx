/**
 * Packaging and wiring asserts for dsh-rbx. Run with `pnpm selfcheck`.
 *
 * Deliberately hermetic: it never starts Studio and never requires Vinegar.
 * The Vinegar-dependent checks are marked and skipped when no install exists,
 * so a machine without one still exercises the packaging contract.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply, findPackageRoot, launcherEnv, loadMcpClient, parseSkillDocument, readSkills } from './index.ts'

const root = findPackageRoot(dirname(fileURLToPath(import.meta.url)))
let failures = 0

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${label}${detail.length > 0 ? ` — ${detail}` : ''}`)
}

console.log('packaging')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  name: string
  type: string
  main: string
  dsh?: { bundle?: { patch?: string | string[] } }
  bin?: Record<string, string>
  files?: string[]
}
check('package name is dsh-rbx', manifest.name === 'dsh-rbx')
check('package is ESM', manifest.type === 'module')
check('main entry exists', existsSync(join(root, manifest.main)), manifest.main)
check('bundle patch is declared', typeof manifest.dsh?.bundle?.patch === 'string', JSON.stringify(manifest.dsh))
const patchPath = join(root, String(manifest.dsh?.bundle?.patch))
check('bundle patch exists', existsSync(patchPath), patchPath)

const patch = readFileSync(patchPath, 'utf8')
check('bundle patch inserts the dsh-rbx row', /-\s*id:\s*dsh-rbx\b/u.test(patch) && /name:\s*'dsh-rbx'/u.test(patch))

for (const [name, relative] of Object.entries(manifest.bin ?? {})) {
  const file = join(root, relative)
  check(`bin ${name} exists`, existsSync(file), relative)
  check(`bin ${name} is executable`, existsSync(file) && (statSync(file).mode & 0o111) !== 0, relative)
}

for (const entry of manifest.files ?? []) {
  check(`files[] entry is packaged: ${entry}`, existsSync(join(root, entry)))
}

console.log('launcher')
const launcher = join(root, 'bin', 'rbx-studio-mcp')
if (existsSync(launcher)) {
  let help = ''
  try {
    help = execFileSync(launcher, ['--help'], { encoding: 'utf8' })
  } catch (error: unknown) {
    check('launcher --help runs', false, String(error))
  }
  check('launcher documents --detect', help.includes('--detect'))
  check(
    'launcher reads the Vinegar override variables',
    ['RBX_STUDIO_MCP_DATA', 'RBX_STUDIO_MCP_WINE', 'RBX_STUDIO_MCP_PREFIX', 'RBX_STUDIO_MCP_EXE']
      .every(name => readFileSync(launcher, 'utf8').includes(name)),
  )
  check(
    'launcher reserves stdout for JSON-RPC',
    readFileSync(launcher, 'utf8').includes('>&2'),
  )
}

console.log('skills')
const skills = readSkills(join(root, 'skills'))
check('exactly one bundled skill', skills.length === 1, `got ${String(skills.length)}`)
const skill = skills[0]
check('skill is roblox-get-started', skill?.name === 'roblox-get-started', skill?.name)
check('skill has a description', (skill?.description.length ?? 0) > 80)
check('skill body mentions Vinegar', (skill?.content ?? '').includes('Vinegar'))
check('skill references are on disk', ['install.md', 'connect.md', 'troubleshoot.md']
  .every(file => existsSync(join(root, 'skills', 'roblox-get-started', 'references', file))))

console.log('frontmatter parser')
const parsed = parseSkillDocument('---\nname: demo\ndescription: A demo skill\nwhenToUse: never\n---\nBody\n')
check('reads name', parsed.data.name === 'demo')
check('reads description', parsed.data.description === 'A demo skill')
check('reads whenToUse', parsed.data.whenToUse === 'never')
check('strips frontmatter from the body', parsed.body === 'Body\n')
check('tolerates a document without frontmatter', parseSkillDocument('plain').body === 'plain')

console.log('config mapping')
const env = launcherEnv({ vineDataDir: '/tmp/v', wine: '/tmp/wine', env: { EXTRA: '1' } })
check('maps vineDataDir', env.RBX_STUDIO_MCP_DATA === '/tmp/v')
check('maps wine', env.RBX_STUDIO_MCP_WINE === '/tmp/wine')
check('merges extra env', env.EXTRA === '1')
check('omits unset keys', !('RBX_STUDIO_MCP_PREFIX' in env))

console.log('plugin apply (mock context)')
const registered: string[] = []
const warnings: string[] = []
const mounted: Array<{ serverName?: string; command?: string; transport?: string }> = []
const mockCtx = {
  logger: {
    info: () => {},
    warn: (message: string) => { warnings.push(message) },
    error: (message: string) => { warnings.push(message) },
  },
  skills: {
    register: (value: { name: string }) => {
      registered.push(value.name)
      return () => {}
    },
  },
  plugin: (_plugin: unknown, config?: unknown) => {
    mounted.push(config as { serverName?: string })
    return {}
  },
}
// The real client ships with the harness, which this test does not have; the
// fixture proves `ctx.plugin` is reached with the right config.
const fixture = join(root, 'tests', 'fixtures', 'fixture-mcp-client.mjs')
process.env.DSH_RBX_MCP_CLIENT = fixture
apply(mockCtx as never, {})
await new Promise(resolvePromise => setTimeout(resolvePromise, 1500))
check('registers the bundled skill', registered.includes('roblox-get-started'), registered.join(','))
check('mounts exactly one MCP client', mounted.length === 1, `got ${String(mounted.length)}`)
check('mounts the Roblox_Studio stdio server',
  mounted[0]?.serverName === 'Roblox_Studio' && mounted[0]?.transport === 'stdio', JSON.stringify(mounted[0]))
check('mounts the bundled launcher', mounted[0]?.command === launcher, String(mounted[0]?.command))
check('loading the MCP client logs no error', !warnings.some(message => message.includes('cannot load')))

console.log('harness resolution (optional)')
if (process.env.DSH_RBX_TEST_HARNESS_ENTRY !== undefined) {
  process.env.DSH_RBX_HARNESS_ENTRY = process.env.DSH_RBX_TEST_HARNESS_ENTRY
  delete process.env.DSH_RBX_MCP_CLIENT
  try {
    const mod = await loadMcpClient()
    check('resolves the harness MCP client from the entry point', typeof mod?.apply === 'function')
  } catch (error: unknown) {
    check('resolves the harness MCP client from the entry point', false, String(error))
  }
} else {
  console.log('  skip set DSH_RBX_TEST_HARNESS_ENTRY to a dsh bin.js to exercise this')
}

console.log('vmg/vinegar (optional)')
if (existsSync(launcher)) {
  try {
    const detect = execFileSync(launcher, ['--detect'], { encoding: 'utf8' })
    check('launcher --detect finds a Vinegar install', detect.includes('StudioMCP.exe') && detect.includes('wine'))
    console.log(detect.trimEnd().split('\n').map(line => `       ${line}`).join('\n'))
  } catch {
    console.log('  skip no Vinegar install on this machine')
  }
}

if (failures > 0) {
  console.error(`\n${String(failures)} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
