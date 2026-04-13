# rebar-mcp

MCP server for [Rebar](https://github.com/spotcircuit/rebar) -- serve project expertise to any AI editor.

Rebar captures project knowledge in `expertise.yaml`, `wiki/`, and `memory/`. This MCP server exposes that knowledge as structured resources and tools that any MCP-compatible editor can consume: Claude Desktop, Cursor, Windsurf, Copilot, and others.

## Install

```bash
npm install -g rebar-mcp
```

Or run directly with npx:

```bash
npx rebar-mcp
```

## What it exposes

### Resources (read-only data)

| URI | Description |
|---|---|
| `rebar://expertise/{project}` | Full expertise.yaml for a project |
| `rebar://brief/{project}` | Structured summary of a project's current state |
| `rebar://wiki` | Wiki index (list of all pages with summaries) |
| `rebar://wiki/{page}` | A specific wiki page |
| `rebar://observations/{project}` | Unvalidated observations from expertise.yaml |
| `rebar://commands` | List all available slash commands with descriptions |
| `rebar://gotchas/{project}` | API gotchas from a project's expertise.yaml |

### Tools (actions)

| Tool | Description |
|---|---|
| `rebar_list_projects` | List all projects (apps/ + clients/ + tools/) with basic info |
| `rebar_observe` | Append an observation to a project's unvalidated_observations |
| `rebar_validate` | Check if an observation should be promoted, discarded, or deferred |
| `rebar_search` | Search across all expertise files and wiki for a term |
| `rebar_diff` | Show what changed in expertise.yaml since last session (git diff) |
| `rebar_promote` | Promote an observation into a target section of expertise.yaml |
| `rebar_discard` | Discard a stale observation with a reason |
| `rebar_ingest` | List files in raw/ ready for wiki ingestion |
| `rebar_stats` | Dashboard overview: projects, observations, wiki pages, last updated |

## Editor Setup

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (Linux) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "rebar": {
      "command": "npx",
      "args": ["rebar-mcp"],
      "cwd": "/path/to/your/rebar-project"
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "rebar": {
      "command": "rebar-mcp",
      "cwd": "/path/to/your/rebar-project"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "rebar": {
      "command": "npx",
      "args": ["rebar-mcp"],
      "cwd": "/path/to/your/rebar-project"
    }
  }
}
```

Then in Cursor Settings > MCP, verify the server appears and is connected.

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "rebar": {
      "command": "npx",
      "args": ["rebar-mcp"],
      "cwd": "/path/to/your/rebar-project"
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "rebar": {
      "command": "npx",
      "args": ["rebar-mcp"],
      "cwd": "/path/to/your/rebar-project"
    }
  }
}
```

## How it finds your project

The server walks up from the current working directory looking for a Rebar project root (a directory with `CLAUDE.md` and `apps/` or `clients/`). If it cannot find one, it falls back to `~/rebar`.

Set `cwd` in your editor config to point at your Rebar project if running from a different directory.

## Development

```bash
git clone https://github.com/spotcircuit/rebar-mcp.git
cd rebar-mcp
npm install
node index.js
```

Test with the MCP inspector:

```bash
npx @modelcontextprotocol/inspector node index.js
```

## How it works

The server reads directly from the Rebar filesystem structure:

- `apps/{project}/expertise.yaml`, `clients/{project}/expertise.yaml`, and `tools/{project}/expertise.yaml` for project knowledge
- `wiki/` for synthesized knowledge pages
- The self-learn loop: observations appended via `rebar_observe` get validated by `/improve`

No database, no config files, no API keys needed. It reads the same files Claude Code reads, making the knowledge available to every other AI tool.

## License

MIT
