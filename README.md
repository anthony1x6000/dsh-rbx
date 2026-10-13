# dsh-rbx

Roblox Studio's MCP server on **Linux**, for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Roblox ships Studio's MCP server only for other platforms, as `StudioMCP.exe`. On Linux, Roblox Studio itself runs under Wine through [Vinegar](https://github.com/vinegarhq/vinegar) — and so does `StudioMCP.exe`. This bundle supplies the missing Linux launcher (`bin/rbx-studio-mcp`), mounts it as the harness MCP server `Roblox_Studio`, and registers the `roblox-get-started` skill that walks a user from "nothing installed" to a live Studio connection.

Studio's tools then appear as `mcp__Roblox_Studio__<tool>`: `list_roblox_studios`, `execute_luau`, `script_read`, `script_grep`, `search_game_tree`, `start_stop_play`, `screen_capture`, and the rest of Roblox's documented set.

## Install

System prerequisites (outside pnpm):

```sh
flatpak remote-add --if-not-exists --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install -y --user flathub org.vinegarhq.Vinegar
```

Launch Studio once so Vinegar downloads Studio and creates its Wine prefix:

```sh
flatpak run org.vinegarhq.Vinegar
```

Then install the bundle into a profile (pnpm only — no profile hand-editing):

```sh
dsh plugin --profile web add "github:anthony1x6000/dsh-rbx#main"
```

Verify the layer without booting:

```sh
dsh --profile web --dump-config | grep -A 2 dsh-rbx
```

A running `dsh web` normally hot-applies the new layer and connects the server within a second or two — no restart needed. If Studio's tools still don't appear, restart the harness so the MCP client connects at boot:

```sh
systemctl --user restart dsh-web     # or restart `dsh web` however you launched it
```

Local development: `pnpm install && pnpm build`, then `dsh plugin --profile web add link:/path/to/dsh-rbx`. Build artifacts (`lib/`) are committed, so installing from git runs no build and needs no pnpm `allowBuilds` approval.

### The one manual step

Studio's MCP server is **off by default and only the user can turn it on**, per Roblox account. With a place open in Studio: **Assistant → … → Manage MCP Servers → Enable Studio as MCP server**. Until then the bridge starts, answers `initialize`, and reports an empty tool list. That is expected, not a bug — the `roblox-get-started` skill walks the user through it.

The Assistant button is easy to miss (it's on the right side of the mezzanine bar), so if the user can't find the panel, send them to Roblox's guide, which shows it: <https://create.roblox.com/docs/assistant/guide>.

## Use

```sh
bin/rbx-studio-mcp --detect        # what the launcher found: data dir, version, wine, prefix
bin/rbx-studio-mcp                 # the stdio MCP server itself (what the harness spawns)
bin/rbx-studio                     # open Studio through Vinegar
```

`--detect` on a healthy machine:

```
rbx-studio-mcp detection
  vinegar data dir : /home/me/.var/app/org.vinegarhq.Vinegar/data/vinegar
  studio version   : …/versions/version-9b554450a0fc4e65
  StudioMCP.exe    : …/versions/version-9b554450a0fc4e65/StudioMCP.exe (ok)
  wine             : …/vinegar/kombucha/bin/wine
  WINEPREFIX       : …/vinegar/prefixes/studio
  running studio   : …/versions/version-9b554450a0fc4e65
  stdout contract  : JSON-RPC only
```

The launcher is not harness-specific: any MCP client can run it as a stdio server. `skills/roblox-get-started/references/connect.md` documents the harness wiring and a generic `mcpServers` entry.

## How it works

```
dsh ──stdio JSON-RPC──▶ bin/rbx-studio-mcp ──exec──▶ wine StudioMCP.exe
                                                          │ ws://127.0.0.1:13469
                                                          ▼
                                                  Roblox Studio (Wine, Vinegar)
```

- **`bin/rbx-studio-mcp`** finds Vinegar's data directory (`~/.var/app/org.vinegarhq.Vinegar/data/vinegar` for the Flatpak, `${XDG_DATA_HOME}/vinegar` otherwise), picks the Studio deployment — preferring the build Studio is *currently running*, so the two halves of the bridge never disagree — finds Wine (Vinegar's bundled `kombucha` build, or the `wineroot` from Vinegar's `config.toml`), sets `WINEPREFIX`, and `exec`s `StudioMCP.exe` with stdout reserved for JSON-RPC.
- **`index.ts`** mounts one `@deepseek-ai/dsh-mcp-client` instance against that launcher and registers the bundled skill. It is loaded through the harness's own resolution (the CLI entry point), so a linked checkout needs no `node_modules` of its own.
- **`skills/roblox-get-started/`** is the ported setup skill: Linux install/open, connection wiring per client, troubleshooting, and security notes.

Nothing in this package is a third-party MCP proxy: it starts the `StudioMCP.exe` that ships inside Studio, the official MCP server binary.

## Config

The bundle inserts one row; override it by id to configure the mount.

| Row field | Default | Meaning |
| --- | --- | --- |
| `mcp` | `true` | Mount the Studio MCP server |
| `serverName` | `Roblox_Studio` | Tool namespace: `mcp__<serverName>__<tool>` |
| `skills` | `true` | Register the bundled `roblox-get-started` skill |
| `launcher` | `<package>/bin/rbx-studio-mcp` | Launcher to spawn |
| `vineDataDir` | auto | Vinegar data dir → `RBX_STUDIO_MCP_DATA` |
| `vineConfigDir` | auto | Vinegar config dir → `RBX_STUDIO_MCP_CONFIG` |
| `wine` | auto | Wine executable → `RBX_STUDIO_MCP_WINE` |
| `wineprefix` | auto | `WINEPREFIX` → `RBX_STUDIO_MCP_PREFIX` |
| `studioMcp` | auto | `StudioMCP.exe` → `RBX_STUDIO_MCP_EXE` |
| `studioVersion` | auto | Deployment name or path → `RBX_STUDIO_MCP_VERSION` |
| `env` | `{}` | Extra launcher environment, merged last |
| `toolCallTimeoutMs` | `60000` | Per-call timeout for Studio tools |
| `failOnStartupError` | `false` | Refuse to activate when the first connection fails |

Example override in a profile or `--patch` overlay:

```yaml
- id: dsh-rbx
  config:
    vineDataDir: /home/me/.var/app/org.vinegarhq.Vinegar/data/vinegar
    toolCallTimeoutMs: 120000
```

The launcher also reads `RBX_STUDIO_MCP_*` from its own environment, so the same knobs work outside the harness.

## Files

| File | Role |
| --- | --- |
| `index.ts` / `lib/index.js` | Cordis plugin: mounts the MCP client against the bundled launcher, registers the bundled skill |
| `bin/rbx-studio-mcp` | Stdio MCP launcher: Vinegar discovery, Wine selection, `StudioMCP.exe` exec |
| `bin/rbx-studio` | Opens Studio through Vinegar |
| `skills/roblox-get-started/` | Ported setup skill (`SKILL.md`, `references/`, `SECURITY.md`) |
| `cordis.patch.yml` | Bundle layer: one `dsh-rbx` row |
| `tests/fixtures/` | Loader stand-in used by `selfcheck.ts` |
| `selfcheck.ts` | Packaging, launcher, skill, and mount asserts: `pnpm selfcheck` |

## Caveats

- **Vinegar is required.** There is no Roblox-published Linux build; Vinegar is the supported way to run Studio on Linux.
- **Studio's MCP server is opt-in per account** and must be enabled in Studio's UI by the user (see above).
- **`kombucha: ntsync is unavailable, performance will be affected.`** on stderr is a harmless Wine notice on kernels without `ntsync`; it does not affect the MCP bridge.
- The launcher detects the running Studio from `/proc` command lines, so it needs permission to read `/proc` — normal on a desktop, sometimes restricted in containers.
- Studio's tool set varies with the Studio version and its feature flags.

## License

MIT. See [LICENSE](LICENSE). Roblox Studio, `StudioMCP.exe`, and Roblox's tool names belong to Roblox Corporation; Vinegar is a separate GPL-3.0 project.
