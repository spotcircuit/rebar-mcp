# rebar-mcp

MCP server for [Rebar](https://github.com/spotcircuit/rebar) -- project intelligence for any AI editor.

**No Claude Code required.** This MCP server gives Cursor, Windsurf, VS Code Copilot, and any MCP-compatible editor full access to rebar's knowledge system: expertise files, wiki, observations, and the self-learn loop.

## Quick Start (Cursor)

```bash
# In your project directory:
mkdir -p .cursor
cat > .cursor/mcp.json << 'EOF'
{
  "mcpServers": {
    "rebar": {
      "command": "npx",
      "args": ["@spotcircuit/rebar-mcp"]
    }
  }
}
EOF
```

Then in Cursor, ask your AI to:
1. `rebar_init` — scaffold rebar into your project
2. `rebar_discover my-app` — scan your codebase, generate expertise.yaml
3. Fill in the expertise based on the scan results
4. `rebar_improve my-app` — validate observations over time

That's it. Your AI now has persistent project memory that compounds.

## Install

```bash
npm install -g @spotcircuit/rebar-mcp
```

Or run directly with npx (recommended):

```bash
npx @spotcircuit/rebar-mcp
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

### Tools — Core Workflow

These replace the Claude Code slash commands. Your AI calls them directly.

| Tool | Replaces | Description |
|---|---|---|
| `rebar_init` | `npx create-rebar` | Scaffold rebar into the current project |
| `rebar_discover` | `/discover` | Scan codebase, generate expertise.yaml with project analysis |
| `rebar_improve` | `/improve` | Review unvalidated observations with context for promote/discard/defer |
| `rebar_brief_tool` | `/brief` | Generate a standup/handoff summary |
| `rebar_write_expertise` | — | Write or update a project's expertise.yaml |
| `rebar_wiki_ingest` | `/wiki-ingest` | Scan raw/ files, return contents for the AI to create wiki pages |
| `rebar_wiki_write` | — | Write a wiki page to wiki/{category}/{page}.md |
| `rebar_wiki_move_processed` | — | Move a processed raw file to raw/processed/ |
| `rebar_read_file` | — | Read any file in the project (code, configs, etc.) |

### Tools — Knowledge Management

| Tool | Description |
|---|---|
| `rebar_list_projects` | List all projects (apps/ + clients/ + tools/) |
| `rebar_observe` | Append an observation to unvalidated_observations |
| `rebar_validate` | Check if an observation should be promoted, discarded, or deferred |
| `rebar_search` | Search across all expertise files and wiki |
| `rebar_diff` | Show what changed in expertise.yaml since last session (git diff) |
| `rebar_promote` | Promote an observation into a target section |
| `rebar_discard` | Discard a stale observation with a reason |
| `rebar_ingest` | List files in raw/ ready for ingestion |
| `rebar_stats` | Dashboard: projects, observations, wiki pages, last updated |

## Editor Setup

### Cursor

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "rebar": {
      "command": "npx",
      "args": ["@spotcircuit/rebar-mcp"]
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
      "args": ["@spotcircuit/rebar-mcp"]
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
      "args": ["@spotcircuit/rebar-mcp"]
    }
  }
}
```

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (Linux) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "rebar": {
      "command": "npx",
      "args": ["@spotcircuit/rebar-mcp"]
    }
  }
}
```

### Claude Code

Claude Code users get slash commands natively via `.claude/commands/`. The MCP server is optional for Claude Code but useful if you want the same knowledge available in other tools too.

## How it finds your project

The server walks up from the current working directory looking for a Rebar project root (a directory with `CLAUDE.md` and `apps/` or `clients/`). If it cannot find one, run `rebar_init` to scaffold one.

You can also set the `REBAR_ROOT` environment variable to point at your project explicitly.

## The Self-Learn Loop (without Claude Code)

The same loop works via MCP tools:

```
1. rebar_discover my-app     → scans codebase, creates expertise.yaml
2. (work on your project)    → AI notices things, calls rebar_observe
3. rebar_improve my-app      → reviews observations, returns context
4. rebar_promote / discard   → AI validates each observation
5. rebar_brief_tool my-app   → next session starts with full context
```

Every session, your AI reads expertise.yaml (via `rebar://expertise/my-app`) and starts with full project context. Observations compound. Stale facts get discarded. Your AI gets smarter about your project over time.

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

The server reads and writes directly to the Rebar filesystem:

- `apps/{project}/expertise.yaml`, `clients/{project}/expertise.yaml`, and `tools/{project}/expertise.yaml` for project knowledge
- `wiki/` for synthesized knowledge pages
- `raw/` for file ingestion intake

No database, no config files, no API keys needed. It reads the same files Claude Code reads, making the knowledge available to every AI tool.

## License

MIT
