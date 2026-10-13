# Troubleshooting the Studio connection on Linux

Match the symptom, give the user the single fix, then re-run setup from the top. For anything about registering the server or loading its tools in this client, see `connect.md`.

Start with `../../bin/rbx-studio-mcp --detect`. It names the data directory, Studio version, Wine binary, and `WINEPREFIX` it resolved, so most rows below become obvious from its output.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No Studio tools in this chat | The MCP client hasn't connected, or Studio wasn't installed when the harness booted | Follow `connect.md`; restart the harness |
| Tools appear twice | Studio's server is registered twice | Follow the duplicates section in `connect.md` |
| Tools present, but `list_roblox_studios` is empty | Studio isn't running, no place is open, or the MCP setting is off | Open Studio, open a place, and turn on the setting (`install.md` sections C and D) |
| `list_roblox_studios` returns `[]` and stderr shows `WS host connection error: Connection refused` | Studio's MCP server is off | Turn on **Enable Studio as MCP server** (`install.md` section D) |
| `--detect` says "no Vinegar installation found" | Vinegar is missing, or has never run | `install.md` section B, then open Vinegar once (section C) |
| `--detect` says "no StudioMCP.exe under …/versions" | Studio is missing or out of date | Open Studio through Vinegar; it updates in place |
| `--detect` says "the Wine prefix … does not exist" | Studio has never completed a launch | Open Studio through Vinegar and let it finish the first run |
| `--detect` says "no wine executable found" | A custom `wineroot` is set in Vinegar's `config.toml` to a path that isn't executable here | Set `RBX_STUDIO_MCP_WINE`, or fix `wineroot` in Vinegar's settings |
| The launcher picks the wrong Studio version | More than one deployment exists under `versions/` | Set `RBX_STUDIO_MCP_VERSION` to the version name, or `RBX_STUDIO_MCP_EXE` to the full path |
| `kombucha: ntsync is unavailable, performance will be affected.` on stderr | Wine's newer synchronization path isn't available on this kernel | Harmless; ignore it. Only Studio's own performance is affected, not the MCP bridge |
| `kombucha: using stable+…` on stderr | Vinegar's bundled Wine announcing itself | Harmless |
| The MCP client reports a protocol or JSON parse error | Something other than JSON-RPC reached stdout, usually a shell wrapper or `wine` debug output | Run the launcher directly with no wrapper, and make sure `WINEDEBUG` isn't forced to something chatty |
| The MCP setting was on, but now it's off | The setting is per Roblox account, and the user switched accounts | Turn it on again for this account |
| A connection worked, then Studio stopped seeing it | Studio was restarted or updated, so the old `StudioMCP.exe` no longer matches | Let the MCP client reconnect; the launcher re-resolves the running Studio's version on every start |
| Connection fails right after the setting is turned on | Another process is holding Studio's MCP port | Close it, then restart Studio |
| Tool calls go to the wrong place | Several Studio windows are open | Call `list_roblox_studios`, confirm the place by name, and pass that `studio_id` |
| A tool mentioned in the docs is missing | Studio's tool set varies with its version and feature flags | Use the tools that are there, and suggest updating Studio |

## What "working" looks like

A healthy Linux bridge answers the standard MCP handshake:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}' \
  | timeout 60 ../../bin/rbx-studio-mcp 2>/dev/null
```

```
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"RobloxStudio","version":"1.0.0"},"instructions":"Studio MCP Proxy - bridges MCP clients with Roblox Studio"}}
```

The server is named `RobloxStudio` and always reports protocol version `2025-06-18` in this handshake. If `initialize` answers but `tools/list` is empty, the bridge is fine and the problem is on Studio's side (the MCP setting or an open place).

## What never to do

- Don't install a third-party MCP server, bridge, or `npx` package as a workaround. `StudioMCP.exe` ships inside Studio; the plugin's launcher only starts it.
- Don't download Studio from a mirror. Vinegar fetches Roblox's own files.
- Don't quit the user's Studio for them; they may have unsaved work.
- Don't edit Studio's settings files or the Wine registry to force the MCP setting on.
