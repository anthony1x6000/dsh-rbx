# Security notes: roblox-get-started

This skill sets up Roblox Studio on the user's own Linux machine, through [Vinegar](https://github.com/vinegarhq/vinegar). Two steps can look risky to automated scanners, so here is exactly what they do and how they are limited.

| ID | What the skill does | Where |
| --- | --- | --- |
| `SEC_INSTALL_VINEGAR` | Installs Vinegar from Flathub | `references/install.md` section B |
| `SEC_RUN_WINE` | Runs Roblox's `StudioMCP.exe` under Wine, in the Wine prefix Vinegar created | `bin/rbx-studio-mcp` |

Both run only on the user's own computer, and only after the user approves a list that names them. One approval covers the actions on that list and nothing else.

## Why Linux needs a compatibility layer

Roblox ships Roblox Studio and its MCP server (`StudioMCP.exe`) for Windows and macOS only. Vinegar is the widely used open-source bootstrapper that runs Studio on Linux under Wine. There is no Roblox-published Linux build, so `install.md` relaxes the "no package managers" rule of the macOS and Windows version of this skill to allow Vinegar — and nothing else.

## Installing Vinegar

- **Source:** only Flathub, `org.vinegarhq.Vinegar`. Alternative installs (distro package, source build) are the user's choice and are linked from the upstream repository.
- **What it is:** a GPL-3.0 bootstrapper, not a Roblox product and not an MCP server. It downloads Roblox Studio from Roblox's own content servers and manages a Wine prefix.
- **Signature/provenance:** the Flatpak is sandboxed by Flatpak and signed by Flathub. The skill never downloads a Studio binary directly and never uses a mirror.
- **No elevation:** the skill uses `--user` Flatpak installs. It never uses `sudo`.

## Running `StudioMCP.exe` under Wine

- **What runs:** the `StudioMCP.exe` that ships inside the Studio deployment Vinegar installed, under the Wine build Vinegar installed (`…/vinegar/kombucha/bin/wine`) with `WINEPREFIX=…/vinegar/prefixes/studio`.
- **Why it is safe to run:** it is Roblox's own binary from Roblox's own deployment, the same process the macOS and Windows launchers start.
- **What it does:** speaks MCP over stdio to the local client, and connects to the local Studio instance over loopback WebSocket. It does not upload anything by itself; individual Studio tools (asset search, AI generation, image upload, documentation fetch) call Roblox services under the user's Studio account when the model invokes them.
- **No credentials:** the launcher reads no tokens and stores nothing. Wine is only used because that is how Studio itself runs on Linux.

## Turning on Studio's MCP server

The skill doesn't do this itself. It asks whether the user is signed in, then has them turn on **Enable Studio as MCP server** in Studio: **Assistant → … → Manage MCP Servers**. It doesn't read or edit Studio's settings or local-storage files, and it doesn't touch Wine's registry to force the setting on.

## What the skill never does

- Ask for, read, type, or store Roblox passwords or sign-in tokens.
- Close, force-quit, or restart Studio itself.
- Check whether the user is signed in by reading files. It asks them.
- Read or edit Studio's settings or local-storage files, or change system security settings.
- Install third-party MCP servers, proxies, or `npx` packages.
- Register a second Studio MCP server.
