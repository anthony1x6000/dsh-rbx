# Connect Studio to this app

This file has one section per client. **Follow only the section for the client you're running in, and ignore the others.** Commands and settings from another client's section don't work here and can break the connection, for example by adding a duplicate server.

- DeepSeek Harness (`dsh`): read **DeepSeek Harness**.
- Claude Code / Claude Desktop / claude.ai: read **Claude**.
- ChatGPT desktop or the Codex CLI: read **ChatGPT and Codex**.
- Anything else that speaks MCP over stdio: read **Other MCP clients**.

On every client the command is the same Linux launcher, `bin/rbx-studio-mcp`, which starts Roblox's own `StudioMCP.exe` under the Wine prefix Vinegar created. Nothing here needs a third-party MCP proxy.

---

## DeepSeek Harness

### Registration

The `dsh-rbx` plugin registers Studio's server itself as `Roblox_Studio`, so its tools appear as `mcp__Roblox_Studio__<tool>`. There is nothing to add by hand, and **you must never register a second Studio MCP server**.

The plugin needs `@deepseek-ai/dsh-mcp-client` to be part of the running composition, which every shipped profile includes. The server connects when the harness boots.

### Loading the tools

MCP servers are connected when the harness boots, and a running harness normally hot-applies a newly installed bundle within a second or two. If the Studio tools still don't appear — for example Studio wasn't installed when the harness booted — restart it:

```sh
systemctl --user restart dsh-web     # when dsh web runs as the user service
# or: stop the running `dsh web` and start it again
```

Then ask the user to repeat their original request, and say **continue Roblox setup** if they need to re-enter setup.

### Checking the wiring

```sh
dsh --profile web --dump-config | grep -A 12 -i roblox
```

should show one `mcp-client` row named `Roblox_Studio` and one `dsh-rbx` row. `../../bin/rbx-studio-mcp --detect` checks the Linux side.

### Where this can run

- `dsh` on the user's own Linux machine can read Vinegar's data directory and run Wine, which is all the bridge needs.
- A container or sandbox that can't see `~/.var/app/org.vinegarhq.Vinegar` (or the native `~/.local/share/vinegar`) cannot reach Studio. Say so and keep helping without Studio.
- Linux without Vinegar and Roblox Studio cannot reach Studio at all. Follow `install.md`.

### Duplicates

If the Studio tools appear twice, the user probably also added Studio's server by hand. Remove the hand-written `Roblox_Studio` row from the profile's `cordis.patch.yml` (or a `--patch` overlay), keep the plugin's, and restart.

---

## Claude

### Registration

Register Studio's server yourself, once. Never add a second one. The Linux command is the plugin's launcher; substitute the path where `dsh-rbx` is checked out:

```sh
claude mcp add Roblox_Studio -- /path/to/dsh-rbx/bin/rbx-studio-mcp
```

Equivalent `mcpServers` entry:

```json
{
  "mcpServers": {
    "Roblox_Studio": {
      "command": "/path/to/dsh-rbx/bin/rbx-studio-mcp"
    }
  }
}
```

### Loading the tools

The server starts when the session starts. If Studio wasn't installed at that point, the tools aren't loaded yet: have the user run `/mcp` and reconnect `Roblox_Studio`, or start a new session and say **continue Roblox setup**.

### Where this can run

Claude Code on the user's own Linux machine can run the commands in `install.md` directly and reach the local Wine prefix. A remote or sandboxed session that can't see the user's home directory cannot reach Studio; walk the user through the steps instead.

### Duplicates

In Claude Code, `claude mcp list` shows every registered server. Keep `Roblox_Studio` and, with approval, remove any other Studio entry.

---

## ChatGPT and Codex

Codex and the ChatGPT desktop app share `~/.codex/config.toml` (`$CODEX_HOME/config.toml` if set). Always name the server `Roblox_Studio`. Check before adding, and never add a second one.

### Registration

First check whether it's already registered: `codex mcp list` shows `Roblox_Studio`, or `config.toml` has `[mcp_servers.Roblox_Studio]`.

If it isn't registered:

```sh
codex mcp add Roblox_Studio -- /path/to/dsh-rbx/bin/rbx-studio-mcp
```

Keep the `--`. Equivalent `config.toml`:

```toml
[mcp_servers.Roblox_Studio]
command = "/path/to/dsh-rbx/bin/rbx-studio-mcp"
```

In the ChatGPT desktop app, add it under **Settings → MCP servers → Add server** with the same name and command.

### Loading the tools

Tools only load at the start of a chat. Once the server is registered, if there are no Studio tools in this chat, tell the user:

> Restart ChatGPT (or open a new Codex thread) and say **continue Roblox setup**.

### Where this can run

The Codex CLI on the user's own Linux machine can reach Studio. Codex's sandbox can block reads outside the workspace and process launches; if the launcher can't read `~/.var/app/org.vinegarhq.Vinegar`, request escalated permissions for that path. A cloud sandbox can't reach Studio at all.

### Duplicates

If more than one entry runs a Studio launcher, keep `Roblox_Studio` and, with approval, `codex mcp remove <other-name>`.

---

## Other MCP clients

Any client that speaks MCP over stdio works with the same command. Use the absolute path to the launcher, and don't set a shell wrapper, because stdio must stay byte-clean:

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

Clients that scrub or replace the child environment should pass nothing at all; the launcher detects Vinegar on its own. If the user installed Vinegar somewhere unusual, pass one of the `RBX_STUDIO_MCP_*` variables from `install.md` in the client's `env` block.
