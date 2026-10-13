/**
 * Roblox Studio for DeepSeek Harness, on Linux.
 *
 * Roblox does not ship its Studio MCP server for Linux. On Linux, Roblox
 * Studio itself runs under Wine through
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
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "roblox-studio";
/**
 * `ctx.skills` is required to publish the setup skill. The MCP client is loaded
 * dynamically and tolerates its own absence, so it is not an injection.
 */
export declare const inject: string[];
/** Package specifier of the harness MCP client plugin this bridges into. */
export declare const MCP_CLIENT_SPECIFIER = "@deepseek-ai/dsh-mcp-client";
/** Stable server namespace; Studio's own Quick Connect writes `Roblox_Studio`. */
export declare const DEFAULT_SERVER_NAME = "Roblox_Studio";
/** Relative path of the stdio MCP launcher inside this package. */
export declare const LAUNCHER_RELATIVE_PATH = "bin/rbx-studio-mcp";
/** Relative path of the skills directory inside this package. */
export declare const SKILLS_RELATIVE_PATH = "skills";
/** Plugin configuration; every field is optional. */
export interface Config {
    /** Mount the Studio MCP server. Default `true`. */
    mcp?: boolean;
    /**
     * Server namespace for the discovered tools. Default `Roblox_Studio`.
     * Must match `[A-Za-z0-9_-]{1,32}` and be unique in this scope.
     */
    serverName?: string;
    /** Absolute path to the launcher, when it was moved out of this package. */
    launcher?: string;
    /** Register the bundled `roblox-get-started` skill. Default `true`. */
    skills?: boolean;
    /** Vinegar data directory; same meaning as `RBX_STUDIO_MCP_DATA`. */
    vineDataDir?: string;
    /** Vinegar config directory; same meaning as `RBX_STUDIO_MCP_CONFIG`. */
    vineConfigDir?: string;
    /** Wine executable; same meaning as `RBX_STUDIO_MCP_WINE`. */
    wine?: string;
    /** `WINEPREFIX`; same meaning as `RBX_STUDIO_MCP_PREFIX`. */
    wineprefix?: string;
    /** `StudioMCP.exe`; same meaning as `RBX_STUDIO_MCP_EXE`. */
    studioMcp?: string;
    /** Studio deployment name or absolute path; same as `RBX_STUDIO_MCP_VERSION`. */
    studioVersion?: string;
    /** Extra environment variables for the launcher, merged last. */
    env?: Record<string, string>;
    /** Per-call timeout for Studio tools, in milliseconds. Default 60000. */
    toolCallTimeoutMs?: number;
    /** Reject plugin activation when the initial MCP connection fails. Default `false`. */
    failOnStartupError?: boolean;
}
/** The subset of the Cordis context this plugin uses. */
export interface PluginContext {
    logger?: {
        info(message: string, ...rest: unknown[]): void;
        warn(message: string, ...rest: unknown[]): void;
        error(message: string, ...rest: unknown[]): void;
    };
    skills: {
        register(skill: {
            name: string;
            description: string;
            whenToUse?: string;
            content: string;
            path?: string;
            resourceBase?: {
                kind: 'directory';
                path: string;
            };
            invocation?: {
                modelInvocable: boolean;
                userInvocable: boolean;
            };
        }): () => void;
    };
    plugin(plugin: unknown, config?: unknown): unknown;
}
/** One skill parsed from `skills/<name>/SKILL.md`. */
export interface ParsedSkill {
    /** Kebab-case skill name from frontmatter. */
    name: string;
    /** Routing description from frontmatter. */
    description: string;
    /** Optional extra routing guidance. */
    whenToUse?: string;
    /** Markdown body after the frontmatter block. */
    content: string;
    /** Absolute path of the `SKILL.md` this was read from. */
    path: string;
}
/** Minimal YAML frontmatter reader: enough for this package's own skills. */
export declare function parseSkillDocument(raw: string): {
    data: Record<string, string>;
    body: string;
};
/**
 * Read every `<dir>/<name>/SKILL.md` bundle exactly one level deep, in sorted
 * order. A directory without a `SKILL.md` file is skipped rather than fatal.
 * @param skillsDir - absolute path of the package's `skills/` directory.
 * @returns the parsed skills; malformed frontmatter throws with the file path.
 */
export declare function readSkills(skillsDir: string): ParsedSkill[];
/**
 * Walk up from a module URL until a `package.json` naming this package is
 * found, so the plugin works both from `lib/` and straight from `index.ts`.
 * @param startDir - directory of the running module.
 * @returns the package root, or the start directory when no marker is found.
 */
export declare function findPackageRoot(startDir: string): string;
/** This package's root directory, resolved from the running module. */
export declare function packageRoot(): string;
/**
 * Build the launcher's explicit environment from plugin config. Values are
 * passed through `mcp-client`'s own `env`, because ambient `RBX_*` names are
 * not scrubbed but ambient `DSH_*` names are.
 * @param config - the plugin configuration.
 * @returns the environment entries to set, omitting unset fields.
 */
export declare function launcherEnv(config: Config): Record<string, string>;
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
export declare function loadMcpClient(): Promise<{
    apply?: unknown;
} | undefined>;
/**
 * Register the Roblox Studio bundle: the bundled setup skill and, unless
 * disabled, the Studio MCP server behind the bundled launcher.
 * @param ctx - plugin context; `ctx.skills` must be mounted.
 * @param config - optional overrides for paths, the server name, and the launcher environment.
 */
export declare function apply(ctx: PluginContext, config?: Config): void;
