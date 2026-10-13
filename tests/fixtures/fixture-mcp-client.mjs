/**
 * Stand-in for `@deepseek-ai/dsh-mcp-client` used by `selfcheck.ts`, so the
 * packaging test can prove the mount path without a harness installation.
 * The real module is a Cordis plugin; only its shape matters here.
 */

/** Cordis plugin name, mirroring the real client's export. */
export const name = 'fixture-mcp-client'

/** Records nothing: `selfcheck` asserts on the config `ctx.plugin` receives. */
export function apply() {}
