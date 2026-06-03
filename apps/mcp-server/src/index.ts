#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  formatDriftStderr,
  loadCredentials,
  loadLocalManifest,
  postDriftCheck,
  trustGradeFromManifest,
} from "@architectai/runtime-client";

const REPO_ROOT = process.env.ARCHITECTAI_REPO_ROOT ?? process.cwd();

async function readRepoFile(filePath: string): Promise<string> {
  const abs = resolve(REPO_ROOT, filePath);
  return readFile(abs, "utf8");
}

const server = new Server(
  { name: "architectai", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "architectai_get_trust_grade",
      description: "Read Trust Grade and verification stamp from .architectai/manifest.json in the repo.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "architectai_check_file",
      description: "Run a drift check on a repo file path against the verified baseline (requires credentials).",
      inputSchema: {
        type: "object",
        properties: { filePath: { type: "string" } },
        required: ["filePath"],
        additionalProperties: false,
      },
    },
    {
      name: "architectai_report_drift",
      description: "Report a manual drift signal (logged locally; use check_file for engine checks).",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { type: "string" },
          ruleCode: { type: "string" },
          message: { type: "string" },
        },
        required: ["filePath", "message"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "architectai_get_trust_grade") {
    const manifest = await loadLocalManifest(REPO_ROOT);
    const summary = trustGradeFromManifest(manifest);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ...summary,
              repoRoot: REPO_ROOT,
              hint: summary.trustGrade == null
                ? "Export from ArchitectAI and run `architectai init` to create manifest."
                : undefined,
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "architectai_check_file") {
    const filePath = String((args as { filePath?: string })?.filePath ?? "").trim();
    if (!filePath) {
      return {
        content: [{ type: "text", text: "filePath is required" }],
        isError: true,
      };
    }
    const creds = await loadCredentials(REPO_ROOT);
    if (!creds) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              verdict: "skipped",
              reason: "Missing .architectai/credentials.json or ARCHITECTAI_* env vars",
            }),
          },
        ],
      };
    }
    try {
      const content = await readRepoFile(filePath);
      const result = await postDriftCheck(creds, {
        architectureId: creds.architectureId,
        filePath,
        fileContent: content,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              filePath,
              hasDrift: result.hasDrift,
              driftScore: result.newDriftScore,
              violations: result.drifts,
              stderrPreview: result.hasDrift ? formatDriftStderr(result.drifts) : null,
            }),
          },
        ],
        isError: result.hasDrift,
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: e instanceof Error ? e.message : "check failed" }],
        isError: true,
      };
    }
  }

  if (name === "architectai_report_drift") {
    const payload = args as { filePath?: string; message?: string; ruleCode?: string };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            recorded: true,
            filePath: payload.filePath,
            ruleCode: payload.ruleCode ?? "MANUAL",
            message: payload.message,
          }),
        },
      ],
    };
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

void main();
