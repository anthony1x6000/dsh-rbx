# Connect Studio to DeepSeek Harness

Studio's MCP server reaches the harness through `bin/rbx-studio-mcp`, which starts Roblox's own `StudioMCP.exe` under the Wine prefix Vinegar created. Nothing here needs a third-party MCP proxy.

---

## DeepSeek Harness

### Registration

The `dsh-rbx` plugin registers Studio's server itself as `Roblox_Studio`, so its tools appear as `mcp__Roblox_Studio__<tool>`. There is nothing to add by hand, and **you must never register a second Studio MCP server**.

The plugin mounts `@deepseek-ai/dsh-mcp-client`, which every shipped profile includes. The server connects when the harness boots, and a running harness normally hot-applies a newly installed bundle within a second or two.

### Loading the tools

If the Studio tools don't appear — for example Studio wasn't installed when the harness booted — restart it:

```sh
systemctl --user restart dsh-web     # when dsh web runs as the user service
# or: stop the running `dsh web` and start it again
```

Then ask the user to repeat their original request, and say **continue Roblox setup** if they need to re-enter setup.

### Checking the wiring

```sh
dsh --profile web --dump-config | grep -A 2 dsh-rbx
```

should show one `dsh-rbx` row. `../../bin/rbx-studio-mcp --detect` checks the Linux side.

### Where this can run

- `dsh` on the user's own Linux machine can read Vinegar's data directory and run Wine, which is all the bridge needs.
- A container or sandbox that can't see `~/.var/app/org.vinegarhq.Vinegar` (or the native `~/.local/share/vinegar`) cannot reach Studio. Say so and keep helping without Studio.
- Linux without Vinegar and Roblox Studio cannot reach Studio at all. Follow `install.md`.

### Duplicates

If the Studio tools appear twice, the user probably also registered Studio's server by hand. Remove the hand-written `Roblox_Studio` row from the profile's `cordis.patch.yml` (or a `--patch` overlay), keep the plugin's, and restart.

---

## Using the launcher from another MCP client

`bin/rbx-studio-mcp` is an ordinary stdio MCP server, so any client can run it. Point the client at the absolute path and leave stdio untouched — no shell wrapper, because a stray banner corrupts the JSON-RPC stream:

```json
{
  "mcpServers": {
    "Roblox_Studio": {
      "command": "/path/to/dsh-rbx/bin/rbx-studio-mcp",
      "args": []
    }
  }
}
```

The launcher detects Vinegar on its own and needs no environment. If Vinegar lives somewhere unusual, pass the matching `RBX_STUDIO_MCP_*` variable from `install.md` in the client's `env` block.

Do not use this to add a second Studio server to the harness; the plugin already provides one.
