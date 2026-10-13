# Install, open, and enable Studio on Linux

Commands for the `roblox-get-started` skill. Run them on the user's own machine, and only after the user has approved the actions they're part of. Each command is self-contained, so don't rely on variables from an earlier one.

On Linux, Roblox Studio runs under Wine through **Vinegar**. Vinegar downloads Studio from Roblox's own content servers and manages the Wine prefix (`~/.var/app/org.vinegarhq.Vinegar/data/vinegar/prefixes/studio` for the Flatpak). Studio's MCP server, `StudioMCP.exe`, ships inside the same deployment as `RobloxStudioBeta.exe`.

## A. Check what's there

This only reads. Run it without asking.

```sh
DATA=""
for d in "${RBX_STUDIO_MCP_DATA:-}" "$HOME/.var/app/org.vinegarhq.Vinegar/data/vinegar" "${XDG_DATA_HOME:-$HOME/.local/share}/vinegar"; do
  [ -n "$d" ] && [ -d "$d/versions" ] && { DATA="$d"; break; }
done
if command -v flatpak >/dev/null 2>&1 && flatpak info org.vinegarhq.Vinegar >/dev/null 2>&1; then
  echo "VINEGAR flatpak:org.vinegarhq.Vinegar"
elif command -v vinegar >/dev/null 2>&1; then
  echo "VINEGAR $(command -v vinegar)"
else
  echo "NOT_INSTALLED_VINEGAR"
fi
if [ -n "$DATA" ]; then
  echo "VINEGAR_DATA $DATA"
  MCP="$(find "$DATA/versions" -maxdepth 2 -name StudioMCP.exe 2>/dev/null | head -n 1)"
  if [ -n "$MCP" ]; then echo "INSTALLED $MCP"; else echo "NOT_INSTALLED (no StudioMCP.exe)"; fi
else
  echo "NOT_INSTALLED (Vinegar has no data directory yet)"
fi
pgrep -f 'RobloxStudioBeta\.exe' >/dev/null 2>&1 && echo RUNNING || echo NOT_RUNNING
```

- `INSTALLED` missing → Studio isn't installed (or Vinegar has never run).
- `INSTALLED` present but `RUNNING` absent → Studio is installed and closed.
- `NOT_INSTALLED_VINEGAR` → Vinegar itself is missing; do section B.

## B. Install Vinegar

Vinegar is a GPL-3.0 bootstrapper, not a Roblox product. It downloads Roblox Studio from Roblox's own CDN. The Flatpak is the least invasive install:

```sh
flatpak remote-add --if-not-exists --user flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install -y --user flathub org.vinegarhq.Vinegar
```

Give the install a timeout of at least 5 minutes.

Alternatives, if the user prefers their distro's package or building from source, are on https://github.com/vinegarhq/vinegar. Don't install a third-party MCP server or proxy in its place.

## C. Open Studio

Vinegar installs or updates Studio on first launch, then opens it. The first run downloads roughly 1–2 GB and initializes the Wine prefix, so give the command a timeout of at least 10 minutes and don't kill it.

```sh
if command -v flatpak >/dev/null 2>&1 && flatpak info org.vinegarhq.Vinegar >/dev/null 2>&1; then
  nohup flatpak run org.vinegarhq.Vinegar >/dev/null 2>&1 &
else
  nohup vinegar >/dev/null 2>&1 &
fi
```

The plugin also ships this as `../../bin/rbx-studio`, which picks whichever of the two is installed.

If Studio is already running, don't launch a second copy and don't quit the first: ask the user to use the window they have. If Studio shows an update prompt, let it finish.

## D. Turn on the MCP setting

The user does this in Studio. Don't edit Studio's settings files. It needs a place open, because the Assistant panel only appears then.

The Assistant button itself is easy to miss: it sits on the **right side of the mezzanine bar** at the top of the Studio window. Roblox's own guide shows exactly where it is, with a screenshot — point the user at it if they can't find the panel: <https://create.roblox.com/docs/assistant/guide> ("Access Assistant from Studio").

1. Open **Assistant** and select **… → Manage MCP Servers** (**… → Settings → MCP Servers** in some versions).
2. Turn on **Enable Studio as MCP server**.

The setting is per Roblox account, so after switching accounts it may need turning on again. When a client connects, Studio shows a green indicator with the number of connected clients.

## E. Verify the bridge

This plugin talks to Studio through `StudioMCP.exe` running under Wine. Check that the launcher can find everything:

```sh
../../bin/rbx-studio-mcp --detect
```

It prints the Vinegar data directory, the Studio version it will use, the Wine binary, and the `WINEPREFIX`, and exits non-zero when something is missing.

A full handshake, independent of the harness:

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}' \
  | timeout 60 ../../bin/rbx-studio-mcp 2>/dev/null
```

A line containing `"serverInfo":{"name":"RobloxStudio"` means the bridge is healthy. An empty `"tools":[]` from `tools/list` just means Studio's MCP setting is off or no place is open; the server fills its tool list as soon as Studio connects.

## Overrides

The launcher reads these when detection guesses wrong. Prefer the defaults; only set one when the report in section E shows the wrong path.

| Variable | Meaning |
| --- | --- |
| `RBX_STUDIO_MCP_DATA` | Vinegar data directory (the one holding `versions/`) |
| `RBX_STUDIO_MCP_CONFIG` | Vinegar config directory (the one holding `config.toml`) |
| `RBX_STUDIO_MCP_WINE` | Wine executable to use instead of Vinegar's bundled build |
| `RBX_STUDIO_MCP_PREFIX` | `WINEPREFIX` to use |
| `RBX_STUDIO_MCP_EXE` | `StudioMCP.exe` to run |
| `RBX_STUDIO_MCP_VERSION` | Studio version directory (name under `versions/`, or an absolute path) |
