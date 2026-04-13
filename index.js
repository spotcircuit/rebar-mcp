#!/usr/bin/env node

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { z } = require("zod");

// ---------------------------------------------------------------------------
// Find the Rebar root directory
// ---------------------------------------------------------------------------
function findRebarRoot(startDir) {
  let dir = startDir || process.cwd();
  for (let i = 0; i < 20; i++) {
    // Rebar root has CLAUDE.md and either apps/ or clients/
    if (
      fs.existsSync(path.join(dir, "CLAUDE.md")) &&
      (fs.existsSync(path.join(dir, "apps")) || fs.existsSync(path.join(dir, "clients")))
    ) {
      return dir;
    }
    // Also check for .claude/commands/ as a marker
    if (fs.existsSync(path.join(dir, ".claude", "commands"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRebarRoot() {
  // Check REBAR_ROOT env var first
  if (process.env.REBAR_ROOT && fs.existsSync(process.env.REBAR_ROOT)) {
    return process.env.REBAR_ROOT;
  }
  const root = findRebarRoot(process.cwd());
  if (!root) {
    // Fall back to common locations
    const fallbacks = [
      path.join(process.env.HOME || "", "rebar"),
      path.join(process.env.HOME || "", "clarity-framework"),
    ];
    for (const fb of fallbacks) {
      if (fs.existsSync(path.join(fb, "CLAUDE.md"))) return fb;
    }
    throw new Error(
      "Could not find Rebar root. Run rebar-mcp from within a Rebar project directory."
    );
  }
  return root;
}

function listProjects(root) {
  const projects = [];
  for (const type of ["apps", "clients"]) {
    const dir = path.join(root, type);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith("_") || name.startsWith(".")) continue;
      const projDir = path.join(dir, name);
      if (!fs.statSync(projDir).isDirectory()) continue;
      const expertisePath = path.join(projDir, "expertise.yaml");
      const hasExpertise = fs.existsSync(expertisePath);
      let lastUpdated = null;
      let observationCount = 0;
      if (hasExpertise) {
        try {
          const stat = fs.statSync(expertisePath);
          lastUpdated = stat.mtime.toISOString().split("T")[0];
          const data = yaml.load(fs.readFileSync(expertisePath, "utf8"));
          if (data && Array.isArray(data.unvalidated_observations)) {
            observationCount = data.unvalidated_observations.length;
          }
        } catch (_) {}
      }
      projects.push({ name, type, last_updated: lastUpdated, observation_count: observationCount });
    }
  }
  return projects;
}

function resolveProjectDir(root, project) {
  for (const type of ["apps", "clients"]) {
    const dir = path.join(root, type, project);
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function readExpertise(root, project) {
  const projDir = resolveProjectDir(root, project);
  if (!projDir) return null;
  const expertisePath = path.join(projDir, "expertise.yaml");
  if (!fs.existsSync(expertisePath)) return null;
  return fs.readFileSync(expertisePath, "utf8");
}

function parseExpertise(root, project) {
  const raw = readExpertise(root, project);
  if (!raw) return null;
  return yaml.load(raw);
}

function generateBrief(data) {
  if (!data) return "No expertise data found.";
  const lines = [];
  lines.push(`# ${data.app || data.client || "Project"} Brief`);
  lines.push("");
  if (data.status) lines.push(`**Status:** ${data.status}`);
  if (data.tagline) lines.push(`**Tagline:** ${data.tagline}`);
  if (data.last_updated) lines.push(`**Last Updated:** ${data.last_updated}`);
  if (data.repo) lines.push(`**Repo:** ${data.repo}`);
  lines.push("");

  // Architecture summary
  if (data.architecture) {
    lines.push("## Architecture");
    const arch = data.architecture;
    if (arch.frontend) {
      lines.push(`- **Frontend:** ${arch.frontend.framework || "N/A"} (port ${arch.frontend.port || "N/A"})`);
    }
    if (arch.backend) {
      lines.push(`- **Backend:** ${arch.backend.framework || "N/A"} (port ${arch.backend.port || "N/A"})`);
    }
    lines.push("");
  }

  // Pipeline summary
  if (data.pipeline && data.pipeline.steps) {
    lines.push("## Pipeline");
    lines.push(`${data.pipeline.overview || ""}`);
    for (const step of data.pipeline.steps) {
      lines.push(`${step.step}. **${step.status_key}** -- ${step.does}`);
    }
    lines.push("");
  }

  // Key decisions
  if (data.decisions && Array.isArray(data.decisions)) {
    lines.push("## Key Decisions");
    for (const d of data.decisions) {
      lines.push(`- **${d.decision}:** ${d.rationale}`);
    }
    lines.push("");
  }

  // API gotchas
  if (data.api_gotchas && Array.isArray(data.api_gotchas)) {
    lines.push("## API Gotchas");
    for (const g of data.api_gotchas) {
      lines.push(`- **${g.gotcha}:** ${g.detail}`);
    }
    lines.push("");
  }

  // Observations
  if (data.unvalidated_observations && data.unvalidated_observations.length > 0) {
    lines.push("## Unvalidated Observations");
    for (const obs of data.unvalidated_observations) {
      lines.push(`- ${typeof obs === "string" ? obs : JSON.stringify(obs)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getWikiIndex(root) {
  const indexPath = path.join(root, "wiki", "index.md");
  if (fs.existsSync(indexPath)) return fs.readFileSync(indexPath, "utf8");
  // Fall back to README
  const readmePath = path.join(root, "wiki", "README.md");
  if (fs.existsSync(readmePath)) return fs.readFileSync(readmePath, "utf8");
  return "No wiki index found.";
}

function getWikiPage(root, page) {
  // Try direct path first
  let pagePath = path.join(root, "wiki", page);
  if (!pagePath.endsWith(".md")) pagePath += ".md";
  if (fs.existsSync(pagePath)) return fs.readFileSync(pagePath, "utf8");

  // Search recursively in wiki/
  const wikiDir = path.join(root, "wiki");
  const found = findFileRecursive(wikiDir, path.basename(pagePath));
  if (found) return fs.readFileSync(found, "utf8");
  return null;
}

function findFileRecursive(dir, filename) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const result = findFileRecursive(path.join(dir, entry.name), filename);
      if (result) return result;
    } else if (entry.name === filename) {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

function searchAllContent(root, query) {
  const results = [];
  const lowerQuery = query.toLowerCase();

  // Search expertise files
  for (const proj of listProjects(root)) {
    const content = readExpertise(root, proj.name);
    if (content && content.toLowerCase().includes(lowerQuery)) {
      // Extract matching lines with context
      const lines = content.split("\n");
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length - 1, i + 1);
          matches.push(lines.slice(start, end + 1).join("\n"));
        }
      }
      if (matches.length > 0) {
        results.push({
          source: `expertise: ${proj.type}/${proj.name}`,
          matches: matches.slice(0, 5),
        });
      }
    }
  }

  // Search wiki
  const wikiDir = path.join(root, "wiki");
  if (fs.existsSync(wikiDir)) {
    searchDirForContent(wikiDir, lowerQuery, results, root);
  }

  return results;
}

function searchDirForContent(dir, query, results, root) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      searchDirForContent(fullPath, query, results, root);
    } else if (entry.name.endsWith(".md")) {
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.toLowerCase().includes(query)) {
          const relPath = path.relative(path.join(root, "wiki"), fullPath);
          const lines = content.split("\n");
          const matches = [];
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(query)) {
              const start = Math.max(0, i - 1);
              const end = Math.min(lines.length - 1, i + 1);
              matches.push(lines.slice(start, end + 1).join("\n"));
            }
          }
          if (matches.length > 0) {
            results.push({
              source: `wiki: ${relPath}`,
              matches: matches.slice(0, 5),
            });
          }
        }
      } catch (_) {}
    }
  }
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "rebar-mcp",
  version: "1.0.0",
});

let REBAR_ROOT;
try {
  REBAR_ROOT = getRebarRoot();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// --- Resources ---

server.resource(
  "expertise",
  "rebar://expertise/{project}",
  { description: "Full expertise.yaml for a project" },
  (uri, { project }) => {
    const content = readExpertise(REBAR_ROOT, project);
    if (!content) return { contents: [{ uri: uri.href, mimeType: "text/plain", text: `Project '${project}' not found or has no expertise.yaml` }] };
    return { contents: [{ uri: uri.href, mimeType: "text/yaml", text: content }] };
  }
);

server.resource(
  "brief",
  "rebar://brief/{project}",
  { description: "Structured summary of a project's current state" },
  (uri, { project }) => {
    const data = parseExpertise(REBAR_ROOT, project);
    const brief = generateBrief(data);
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: brief }] };
  }
);

server.resource(
  "wiki-index",
  "rebar://wiki",
  { description: "Wiki index -- list of all pages with summaries" },
  (uri) => {
    const content = getWikiIndex(REBAR_ROOT);
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }] };
  }
);

server.resource(
  "wiki-page",
  "rebar://wiki/{page}",
  { description: "A specific wiki page" },
  (uri, { page }) => {
    const content = getWikiPage(REBAR_ROOT, page);
    if (!content) return { contents: [{ uri: uri.href, mimeType: "text/plain", text: `Wiki page '${page}' not found` }] };
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }] };
  }
);

server.resource(
  "observations",
  "rebar://observations/{project}",
  { description: "Unvalidated observations from a project's expertise.yaml" },
  (uri, { project }) => {
    const data = parseExpertise(REBAR_ROOT, project);
    if (!data) return { contents: [{ uri: uri.href, mimeType: "text/plain", text: `Project '${project}' not found` }] };
    const observations = data.unvalidated_observations || [];
    const text = observations.length === 0
      ? "No unvalidated observations."
      : observations.map((o, i) => `${i}: ${typeof o === "string" ? o : JSON.stringify(o)}`).join("\n");
    return { contents: [{ uri: uri.href, mimeType: "text/plain", text }] };
  }
);

// --- Tools ---

server.tool(
  "rebar_list_projects",
  "List all projects (apps/ + clients/) with basic info",
  {},
  async () => {
    const projects = listProjects(REBAR_ROOT);
    return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
  }
);

server.tool(
  "rebar_observe",
  "Append an observation to a project's unvalidated_observations",
  {
    project: z.string().describe("Project name (resolved from apps/ or clients/)"),
    observation: z.string().describe("The observation to append"),
  },
  async ({ project, observation }) => {
    const projDir = resolveProjectDir(REBAR_ROOT, project);
    if (!projDir) {
      return { content: [{ type: "text", text: `Project '${project}' not found.` }], isError: true };
    }
    const expertisePath = path.join(projDir, "expertise.yaml");
    if (!fs.existsSync(expertisePath)) {
      return { content: [{ type: "text", text: `No expertise.yaml found for '${project}'.` }], isError: true };
    }

    const raw = fs.readFileSync(expertisePath, "utf8");
    const data = yaml.load(raw);
    if (!data.unvalidated_observations) {
      data.unvalidated_observations = [];
    }
    const timestamp = new Date().toISOString().split("T")[0];
    data.unvalidated_observations.push(`[${timestamp}] ${observation}`);

    // Write back -- use yaml.dump to preserve structure
    fs.writeFileSync(expertisePath, yaml.dump(data, { lineWidth: 120, noRefs: true }), "utf8");

    return {
      content: [{
        type: "text",
        text: `Observation appended to ${project}/expertise.yaml (${data.unvalidated_observations.length} total observations).`,
      }],
    };
  }
);

server.tool(
  "rebar_validate",
  "Check if an observation should be promoted, discarded, or deferred",
  {
    project: z.string().describe("Project name"),
    observation_index: z.number().describe("Index of the observation to validate"),
  },
  async ({ project, observation_index }) => {
    const data = parseExpertise(REBAR_ROOT, project);
    if (!data) {
      return { content: [{ type: "text", text: `Project '${project}' not found.` }], isError: true };
    }
    const observations = data.unvalidated_observations || [];
    if (observation_index < 0 || observation_index >= observations.length) {
      return {
        content: [{ type: "text", text: `Invalid index ${observation_index}. There are ${observations.length} observations (0-${observations.length - 1}).` }],
        isError: true,
      };
    }
    const obs = observations[observation_index];
    const obsText = typeof obs === "string" ? obs : JSON.stringify(obs);

    // Return the observation with context so the LLM can decide
    const sections = Object.keys(data).filter(k => k !== "unvalidated_observations").join(", ");
    return {
      content: [{
        type: "text",
        text: [
          `**Observation #${observation_index}:** ${obsText}`,
          "",
          `**Existing sections in expertise.yaml:** ${sections}`,
          "",
          "To validate, check if this observation:",
          "- Is already captured in an existing section -> **discard**",
          "- Contains a confirmed fact that belongs in a section -> **promote** (specify which section)",
          "- Needs more investigation before promoting -> **defer**",
          "",
          "Use rebar_observe to update or manually edit expertise.yaml to promote.",
        ].join("\n"),
      }],
    };
  }
);

server.tool(
  "rebar_search",
  "Search across all expertise files and wiki for a term",
  {
    query: z.string().describe("Search term"),
  },
  async ({ query }) => {
    const results = searchAllContent(REBAR_ROOT, query);
    if (results.length === 0) {
      return { content: [{ type: "text", text: `No results found for '${query}'.` }] };
    }
    const text = results.map((r) => {
      return `### ${r.source}\n${r.matches.join("\n---\n")}`;
    }).join("\n\n");
    return { content: [{ type: "text", text }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`rebar-mcp started (root: ${REBAR_ROOT})`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
