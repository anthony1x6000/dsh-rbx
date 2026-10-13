---
name: roblox-get-started
description: Get Roblox Studio connected on Linux so you can build Roblox games with the user. Installs Vinegar and Studio if they're missing, opens Studio, guides the user through signing in and turning on Studio's MCP server, and confirms the connection, automating every step the user doesn't have to do by hand. Use when the user wants to make or work on a Roblox game and Studio isn't connected yet, says "continue Roblox setup", or the Studio tools are missing, failing, or `list_roblox_studios` returns nothing. Don't use it once a Studio instance is listed and the user is just building.
---

# Get started with Roblox Studio on Linux

This skill gets you to a working Studio connection, then stops. After that, use the Studio tools (`mcp__Roblox_Studio__*`) and Studio's own `skill` tool for the actual work.

On Linux, Roblox Studio runs under Wine through [Vinegar](https://github.com/vinegarhq/vinegar). Studio itself, and Studio's MCP server (`StudioMCP.exe`), are Windows programs; Vinegar makes them run natively enough. The `dsh-rbx` plugin wires that up: its launcher starts `StudioMCP.exe` under the same Wine prefix Vinegar uses, so Studio and the MCP bridge always agree on the version.

It's safe to re-run. Each time, start at step 1 and skip whatever's already done. In a new chat, "continue Roblox setup" picks up where the user left off.

Do as much as you can yourself. The user should only have to approve once, sign in, open a place, turn on Studio's MCP setting, and reconnect if needed.

## References

- `references/install.md`: commands to check for, install, and open Vinegar and Studio on Linux, and where the user turns on Studio's MCP setting.
- `references/connect.md`: how the plugin registers and loads Studio's MCP server, how to check the wiring, and how to reuse the launcher from another MCP client.
- `references/troubleshoot.md`: symptoms and fixes.

## Rules

- **One approval, up front.** Before you change anything, list what you'll do: for example, install Vinegar from Flathub, let it download Roblox Studio, and open Studio. Ask once. That covers everything on the list. Ask again only for something that wasn't on it.
- Vinegar is the supported way to run Studio on Linux and it downloads Studio from Roblox's own CDN. Do not install third-party MCP servers, proxies, or `npx` packages, and do not download Studio builds from mirrors.
- Never ask for, read, or type the user's Roblox password. The user signs in to Studio themselves.
- **Ask whether the user is signed in.** Ask "Are you signed in to Roblox Studio?" and believe the answer. Don't try to check it yourself.
- Never close or force-quit Studio yourself, because the user could lose unsaved work. Ask them to quit it.
- Don't edit Studio's settings files or change system security settings. The user turns on the MCP setting in Studio.
- If a step fails, say which step and what you saw, then check `troubleshoot.md`.

## 1. Can this app reach Studio?

Check `references/connect.md` for where this app can run. The MCP bridge needs to read Vinegar's data directory (usually `~/.var/app/org.vinegarhq.Vinegar/data/vinegar`) and execute Wine. If a sandbox blocks either, say so, link https://create.roblox.com/docs/studio/setup, and keep helping in the meantime: plan the game, explain Roblox concepts, or write Luau they can paste in later. Don't leave the user at a dead end.

## 2. Already connected?

If the `mcp__Roblox_Studio__list_roblox_studios` tool is available, call it.

- **One or more instances:** go to step 7.
- **Empty list:** the bridge is running, but Studio is closed, no place is open, or the MCP setting is off. Go to step 3.
- **Tool not available, or the call fails:** the bridge isn't loaded, usually because Studio wasn't installed when the harness started. Go to step 3, and plan on step 6.

If the Studio tools appear twice, follow the duplicates section in `references/connect.md` first.

## 3. Check what's there

Without asking, run the read-only check in `references/install.md` section A. It reports whether Vinegar is installed, whether Studio is installed, whether `StudioMCP.exe` is present, and whether Studio is running.

## 4. Ask once

Tell the user, in one short list, what's missing and what you'll do about it. Mention that Studio is free, comes from Roblox, and that Vinegar only downloads Roblox's own files. Then ask for approval.

If the user would rather set things up themselves, send them to https://create.roblox.com/docs/studio/setup and https://github.com/vinegarhq/vinegar. Wait until they say it's done, then continue from step 5.

## 5. Install and open

In this order, skipping whatever's already done:

1. **Install Vinegar** (`references/install.md` section B).
2. **Open Studio** (`references/install.md` section C). The first launch downloads Studio and creates the Wine prefix; it can take several minutes.

Then give the user what's left as **one** short list, and wait for them to say it's done:

- **Sign in:** ask "Are you signed in to Roblox Studio?" If not, ask them to sign in.
- **Open a place:** an existing place, or **Baseplate** on the start page.
- **Turn on the MCP setting**, if it isn't on yet: **Assistant → … → Manage MCP Servers** (**… → Settings → MCP Servers** in some versions), then turn on **Enable Studio as MCP server** (`references/install.md` section D). The Assistant panel only appears with a place open, and its button sits on the right side of the mezzanine bar — if the user can't find it, send them to <https://create.roblox.com/docs/assistant/guide>, which shows where it is.

## 6. Register and load the tools

The `dsh-rbx` plugin registers Studio's server when the harness boots, so there is usually nothing to add by hand. If the Studio tools weren't available at the start of this chat, follow `references/connect.md`: confirm the launcher works (`references/install.md` section E), then restart the harness so the MCP client connects. Include any registration in the step 4 approval.

## 7. Handshake

Call `mcp__Roblox_Studio__list_roblox_studios`:

- **One or more instances:** you're connected. If several are listed, match the user's words to a `name`, or ask which one they mean before changing anything. Keep that `studio_id` for the rest of the conversation.
- **Empty list:** no place is open, or the MCP setting is off. Go back to step 5.
- **Tool unavailable or failing:** go to step 6, then check `references/troubleshoot.md`.

Once you're connected, tell the user in one line, then get on with what they asked for. For Roblox-specific guidance, call Studio's `skill` tool, which lists the skills available in their Studio version. Don't rerun this skill, and don't add another MCP server.
