/**
 * Roblox Studio for DeepSeek Harness, on Linux.
 *
 * Roblox ships Studio's MCP server as a Windows/macOS binary (`StudioMCP.exe` /
 * `StudioMCP`). On Linux, Roblox Studio itself runs under Wine through
 * [Vinegar](https://github.com/vinegarhq/vinegar), and so does `StudioMCP.exe`.
 * This plugin wires that bridge into the harness:
 *
 * 1. It mounts one `@deepseek-ai/dsh-mcp-client` instance for the stdio server
 *    `bin/rbx-studio-mcp` shipped beside this file, so Studio's tools appear as
 *    `mcp__Roblox_Studio__<tool>`.
 * 2. It registers the `roblox-get-started` skill, which walks a user through
 *    installing Vinegar, opening Studio, and turning on Studio's MCP server.
 *
 * The launcher, not this file, owns every platform detail (Vinegar's data
 * directory, the Wine build, the running Studio's version). It is also usable
 * on its own by any MCP client, which is what `skills/…/references/connect.md`
 * documents.
 *
 * Bundle entry: `cordis.patch.yml` inserts one row for this package. Nothing
 * else is required; the MCP row is mounted here so the launcher path is always
 * the one inside this installation, never a hardcoded string.
 *
 * @module dsh-rbx
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'roblox-studio'

/**
 * `ctx.skills` is required to publish the setup skill. The MCP client is loaded
 * dynamically and tolerates its own absence, so it is not an injection.
 */
export const inject = ['skills']

/** Package specifier of the harness MCP client plugin this bridges into. */
export const MCP_CLIENT_SPECIFIER = '@deepseek-ai/dsh-mcp-client'

/** Stable server namespace; Studio's own Quick Connect writes `Roblox_Studio`. */
export const DEFAULT_SERVER_NAME = 'Roblox_Studio'

/** Relative path of the stdio MCP launcher inside this package. */
export const LAUNCHER_RELATIVE_PATH = 'bin/rbx-studio-mcp'

/** Relative path of the skills directory inside this package. */
export const SKILLS_RELATIVE_PATH = 'skills'

/** Environment variable names the launcher understands, in config-key order. */
const LAUNCHER_ENV_KEYS = [
  'RBX_STUDIO_MCP_DATA',
  'RBX_STUDIO_MCP_CONFIG',
  'RBX_STUDIO_MCP_WINE',
  'RBX_STUDIO_MCP_PREFIX',
  'RBX_STUDIO_MCP_EXE',
  'RBX_STUDIO_MCP_VERSION',
] as const

/** Plugin configuration; every field is optional. */
export interface Config {
  /** Mount the Studio MCP server. Default `true`. */
  mcp?: boolean
  /**
   * Server namespace for the discovered tools. Default `Roblox_Studio`.
   * Must match `[A-Za-z0-9_-]{1,32}` and be unique in this scope.
   */
  serverName?: string
  /** Absolute path to the launcher, when it was moved out of this package. */
  launcher?: string
  /** Register the bundled `roblox-get-started` skill. Default `true`. */
  skills?: boolean
  /** Vinegar data directory; same meaning as `RBX_STUDIO_MCP_DATA`. */
  vineDataDir?: string
  /** Vinegar config directory; same meaning as `RBX_STUDIO_MCP_CONFIG`. */
  vineConfigDir?: string
  /** Wine executable; same meaning as `RBX_STUDIO_MCP_WINE`. */
  wine?: string
  /** `WINEPREFIX`; same meaning as `RBX_STUDIO_MCP_PREFIX`. */
  wineprefix?: string
  /** `StudioMCP.exe`; same meaning as `RBX_STUDIO_MCP_EXE`. */
  studioMcp?: string
  /** Studio deployment name or absolute path; same as `RBX_STUDIO_MCP_VERSION`. */
  studioVersion?: string
  /** Extra environment variables for the launcher, merged last. */
  env?: Record<string, string>
  /** Per-call timeout for Studio tools, in milliseconds. Default 60000. */
  toolCallTimeoutMs?: number
  /** Reject plugin activation when the initial MCP connection fails. Default `false`. */
  failOnStartupError?: boolean
}

/** The subset of the Cordis context this plugin uses. */
export interface PluginContext {
  logger?: {
    info(message: string, ...rest: unknown[]): void
    warn(message: string, ...rest: unknown[]): void
    error(message: string, ...rest: unknown[]): void
  }
  skills: {
    register(skill: {
      name: string
      description: string
      whenToUse?: string
      content: string
      path?: string
      resourceBase?: { kind: 'directory'; path: string }
      invocation?: { modelInvocable: boolean; userInvocable: boolean }
    }): () => void
  }
  plugin(plugin: unknown, config?: unknown): unknown
}

/** One skill parsed from `skills/<name>/SKILL.md`. */
export interface ParsedSkill {
  /** Kebab-case skill name from frontmatter. */
  name: string
  /** Routing description from frontmatter. */
  description: string
  /** Optional extra routing guidance. */
  whenToUse?: string
  /** Markdown body after the frontmatter block. */
  content: string
  /** Absolute path of the `SKILL.md` this was read from. */
  path: string
}

/** Minimal YAML frontmatter reader: enough for this package's own skills. */
export function parseSkillDocument(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(raw)
  if (match === null) return { data: {}, body: raw }
  const data: Record<string, string> = {}
  for (const line of (match[1] ?? '').split(/\r?\n/u)) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/u.exec(line)
    if (kv === null) continue
    let value = (kv[2] ?? '').trim()
    if (value.length >= 2) {
      const first = value[0]
      const last = value[value.length - 1]
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1)
      }
    }
    data[kv[1] as string] = value
  }
  return { data, body: raw.slice(match[0].length) }
}

/**
 * Read every `<dir>/<name>/SKILL.md` bundle exactly one level deep, in sorted
 * order. A directory without a `SKILL.md` file is skipped rather than fatal.
 * @param skillsDir - absolute path of the package's `skills/` directory.
 * @returns the parsed skills; malformed frontmatter throws with the file path.
 */
export function readSkills(skillsDir: string): ParsedSkill[] {
  if (!existsSync(skillsDir)) return []
  const skills: ParsedSkill[] = []
  for (const entry of readdirSync(skillsDir).sort()) {
    const file = join(skillsDir, entry, 'SKILL.md')
    if (!existsSync(file)) continue
    const { data, body } = parseSkillDocument(readFileSync(file, 'utf8'))
    const skillName = data.name
    const description = data.description
    if (skillName === undefined || skillName.length === 0) {
      throw new Error(`dsh-rbx: ${file} is missing a frontmatter "name"`)
    }
    if (description === undefined || description.length === 0) {
      throw new Error(`dsh-rbx: ${file} is missing a frontmatter "description"`)
    }
    skills.push({
      name: skillName,
      description,
      ...data.whenToUse !== undefined && data.whenToUse.length > 0 ? { whenToUse: data.whenToUse } : {},
      content: body,
      path: file,
    })
  }
  return skills
}

/**
 * Walk up from a module URL until a `package.json` naming this package is
 * found, so the plugin works both from `lib/` and straight from `index.ts`.
 * @param startDir - directory of the running module.
 * @returns the package root, or the start directory when no marker is found.
 */
export function findPackageRoot(startDir: string): string {
  let dir = resolve(startDir)
  for (;;) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown }
        if (parsed.name === 'dsh-rbx') return dir
      } catch {
        // A malformed ancestor manifest is not this plugin's problem.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return resolve(startDir)
    dir = parent
  }
}

/** This package's root directory, resolved from the running module. */
export function packageRoot(): string {
  return findPackageRoot(dirname(fileURLToPath(import.meta.url)))
}

/**
 * Build the launcher's explicit environment from plugin config. Values are
 * passed through `mcp-client`'s own `env`, because ambient `RBX_*` names are
 * not scrubbed but ambient `DSH_*` names are.
 * @param config - the plugin configuration.
 * @returns the environment entries to set, omitting unset fields.
 */
export function launcherEnv(config: Config): Record<string, string> {
  const mapped: Array<[string, string | undefined]> = [
    [LAUNCHER_ENV_KEYS[0], config.vineDataDir],
    [LAUNCHER_ENV_KEYS[1], config.vineConfigDir],
    [LAUNCHER_ENV_KEYS[2], config.wine],
    [LAUNCHER_ENV_KEYS[3], config.wineprefix],
    [LAUNCHER_ENV_KEYS[4], config.studioMcp],
    [LAUNCHER_ENV_KEYS[5], config.studioVersion],
  ]
  const env: Record<string, string> = {}
  for (const [key, value] of mapped) {
    if (typeof value === 'string' && value.length > 0) env[key] = value
  }
  for (const [key, value] of Object.entries(config.env ?? {})) env[key] = String(value)
  return env
}

/** True when `path` is an executable regular file. */
function isExecutableFile(path: string): boolean {
  try {
    const stat = statSync(path)
    if (!stat.isFile()) return false
    return (stat.mode & 0o111) !== 0
  } catch {
    return false
  }
}

/**
 * Emit one startup diagnostic.
 *
 * `ctx.logger` is the idiomatic channel, but a host that wires no sink to it
 * swallows these lines; stderr is visible in every surface and, unlike stdout,
 * never mixes into `dsh headless`'s answer.
 * @param context - plugin context carrying the optional logger.
 * @param message - the already-prefixed diagnostic line.
 */
function notice(context: PluginContext, message: string): void {
  context.logger?.info(message)
  console.error(message)
}

/** Report a degraded or failed step; same channels as {@link notice}. */
function problem(context: PluginContext, message: string): void {
  context.logger?.warn(message)
  console.error(message)
}

/**
 * Load the harness MCP client.
 *
 * A linked or installed out-of-tree plugin has no `node_modules` of its own, so
 * the bare specifier only resolves when the profile happens to provide it. When
 * it does not, resolve the harness's own copy from the running entry point
 * (the `dsh` CLI's `bin.js`): realpath first, because the pnpm link layout only
 * exposes a package's dependencies beside its real location. That yields the
 * same physical module the harness would load, so its services stay shared.
 *
 * `DSH_RBX_MCP_CLIENT` overrides the specifier or absolute path.
 * @returns the plugin module namespace, or `undefined` when nothing resolved.
 */
export async function loadMcpClient(): Promise<{ apply?: unknown } | undefined> {
  const override = process.env.DSH_RBX_MCP_CLIENT
  const specifiers = override !== undefined && override.length > 0
    ? [override, MCP_CLIENT_SPECIFIER]
    : [MCP_CLIENT_SPECIFIER]
  let lastError: unknown
  for (const specifier of specifiers) {
    try {
      return (await import(specifier)) as { apply?: unknown }
    } catch (error: unknown) {
      lastError = error
    }
  }
  const anchors = [process.argv[1], process.env.DSH_RBX_HARNESS_ENTRY]
  for (const anchor of anchors) {
    if (anchor === undefined || anchor.length === 0) continue
    try {
      const require = createRequire(realpathSync(anchor))
      const resolved = require.resolve(MCP_CLIENT_SPECIFIER)
      return (await import(pathToFileURL(resolved).href)) as { apply?: unknown }
    } catch (error: unknown) {
      lastError = error
    }
  }
  throw lastError ?? new Error(`${MCP_CLIENT_SPECIFIER} could not be resolved`)
}

/**
 * Mount the harness MCP client against the bundled launcher. The import is
 * dynamic so this package still loads (skills only, with a warning) in a
 * composition that omits the MCP client.
 * @param ctx - plugin context.
 * @param config - plugin configuration.
 * @param root - this package's root directory.
 * @returns the mounted client, or `undefined` when mounting was skipped.
 */
async function mountStudioMcp(
  ctx: PluginContext,
  config: Config,
  root: string,
): Promise<unknown> {
  const launcher = config.launcher ?? join(root, LAUNCHER_RELATIVE_PATH)
  if (!existsSync(launcher)) {
    problem(ctx, 
      `[dsh-rbx] launcher not found at ${launcher}; Studio tools will not be available. `
      + 'Reinstall the dsh-rbx bundle.',
    )
    return undefined
  }
  if (!isExecutableFile(launcher)) {
    problem(ctx, 
      `[dsh-rbx] launcher ${launcher} is not executable; run: chmod +x "${launcher}"`,
    )
  }
  const env = launcherEnv(config)
  const clientConfig: Record<string, unknown> = {
    serverName: config.serverName ?? DEFAULT_SERVER_NAME,
    transport: 'stdio',
    command: launcher,
    args: [],
    env,
    cwd: root,
    failOnStartupError: config.failOnStartupError ?? false,
    reconnect: { enabled: true },
  }
  if (config.toolCallTimeoutMs !== undefined) {
    clientConfig.toolCallTimeoutMs = config.toolCallTimeoutMs
  }
  let mod: { apply?: unknown } | undefined
  try {
    mod = await loadMcpClient()
  } catch (error: unknown) {
    problem(ctx, 
      `[dsh-rbx] cannot load ${MCP_CLIENT_SPECIFIER}, so Studio's tools stay unavailable: ${String(error)}. `
      + 'It ships with the harness; set DSH_RBX_MCP_CLIENT to its entry point, or drop the mcp row.',
    )
    return undefined
  }
  if (typeof mod?.apply !== 'function') {
    problem(ctx, `[dsh-rbx] ${MCP_CLIENT_SPECIFIER} does not export a Cordis plugin; skipping the MCP mount`)
    return undefined
  }
  return ctx.plugin(mod, clientConfig)
}

/**
 * Register every bundled skill with `ctx.skills`.
 * @param ctx - plugin context.
 * @param skillsDir - absolute path of the package's `skills/` directory.
 * @returns the number of registered skills.
 */
function registerSkills(ctx: PluginContext, skillsDir: string): number {
  let skills: ParsedSkill[]
  try {
    skills = readSkills(skillsDir)
  } catch (error: unknown) {
    problem(ctx, `[dsh-rbx] cannot read bundled skills: ${String(error)}`)
    return 0
  }
  let registered = 0
  for (const skill of skills) {
    const directory = dirname(skill.path)
    try {
      ctx.skills.register({
        name: skill.name,
        description: skill.description,
        ...skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {},
        content: skill.content,
        path: skill.path,
        resourceBase: { kind: 'directory', path: directory },
      })
      registered += 1
    } catch (error: unknown) {
      problem(ctx, `[dsh-rbx] cannot register skill "${skill.name}": ${String(error)}`)
    }
  }
  return registered
}

/**
 * Register the Roblox Studio bundle: the bundled setup skill and, unless
 * disabled, the Studio MCP server behind the bundled launcher.
 * @param ctx - plugin context; `ctx.skills` must be mounted.
 * @param config - optional overrides for paths, the server name, and the launcher environment.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const root = packageRoot()

  if (config.skills !== false) {
    const registered = registerSkills(ctx, join(root, SKILLS_RELATIVE_PATH))
    if (registered > 0) notice(ctx, `[dsh-rbx] registered ${registered} Roblox skill(s)`)
  }

  if (config.mcp === false) {
    notice(ctx, '[dsh-rbx] MCP mounting disabled by configuration')
    return
  }
  // The MCP client connects during its own activation; not awaiting here keeps
  // this plugin's apply synchronous, exactly like a loader-mounted row. A
  // failed connection is the client's startup policy to report.
  void mountStudioMcp(ctx, config, root).catch((error: unknown) => {
    problem(ctx, `[dsh-rbx] mounting the Studio MCP client failed: ${String(error)}`)
  })
}
