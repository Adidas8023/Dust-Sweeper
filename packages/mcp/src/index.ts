#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  scanDust,
  planSweep,
  executeSweep,
  SUPPORTED_CHAINS,
  CHAINS,
  type SweepSettings,
} from "@dust-sweeper/core";
import { z } from "zod";

const SettingsSchema = z.object({
  thresholdUSD: z.number().default(5),
  includeNativeGas: z.boolean().default(false),
  gasReserveUSD: z.number().default(20),
  includeStables: z.boolean().default(false),
  includeWrapped: z.boolean().default(false),
  excludeAddresses: z.array(z.string()).default([]),
  chains: z.array(z.string()).optional(),
  aggregationMode: z.enum(["per-wallet", "unified"]).optional(),
  recipientEvm: z.string().optional(),
  recipientSolana: z.string().optional(),
});

const server = new Server(
  { name: "dust-sweeper", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scan_dust",
      description:
        "Scan dust tokens across all supported chains. Returns DustInventory grouped by chain.",
      inputSchema: {
        type: "object",
        properties: {
          thresholdUSD: {
            type: "number",
            description: "Max USD value for a token to be considered dust",
          },
          includeNativeGas: { type: "boolean" },
          gasReserveUSD: { type: "number" },
          includeStables: { type: "boolean" },
          includeWrapped: { type: "boolean" },
          excludeAddresses: { type: "array", items: { type: "string" } },
          chains: {
            type: "array",
            items: { type: "string" },
            description: "Optional chain subset; defaults to all supported",
          },
        },
      },
    },
    {
      name: "plan_sweep",
      description:
        "Build a SweepPlan with per-(owner, chain) steps and cost estimate. " +
        "aggregationMode='per-wallet' (default) mints USDC back to each source wallet. " +
        "aggregationMode='unified' routes all USDC to a single recipientEvm (EVM dest) " +
        "or recipientSolana (Solana dest). Recipient family must match destChain.",
      inputSchema: {
        type: "object",
        required: ["inventory", "destChain"],
        properties: {
          inventory: { type: "object" },
          destChain: { type: "string" },
          aggregationMode: {
            type: "string",
            enum: ["per-wallet", "unified"],
          },
          recipientEvm: { type: "string" },
          recipientSolana: { type: "string" },
        },
      },
    },
    {
      name: "execute_sweep",
      description:
        "Execute a SweepPlan. Runs chains in parallel, per-chain steps sequentially. Returns SweepResult with tx hashes.",
      inputSchema: {
        type: "object",
        required: ["plan"],
        properties: { plan: { type: "object" } },
      },
    },
    {
      name: "get_supported_chains",
      description: "List all supported chains with their chainId and EVM flag.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "scan_dust") {
    const parsed = SettingsSchema.parse(args ?? {});
    const settings = parsed as unknown as SweepSettings;
    const inv = await scanDust(settings);
    return {
      content: [{ type: "text", text: JSON.stringify(inv, null, 2) }],
    };
  }

  if (name === "plan_sweep") {
    const a = args as {
      inventory: any;
      destChain: string;
      aggregationMode?: "per-wallet" | "unified";
      recipientEvm?: string;
      recipientSolana?: string;
    };
    const plan = planSweep(a.inventory, a.destChain as any, {
      aggregationMode: a.aggregationMode,
      recipientEvm: a.recipientEvm,
      recipientSolana: a.recipientSolana,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(plan, null, 2) }],
    };
  }

  if (name === "execute_sweep") {
    const a = args as { plan: any };
    const events: unknown[] = [];
    const result = await executeSweep(a.plan, (e) => events.push(e));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ result, events }, null, 2),
        },
      ],
    };
  }

  if (name === "get_supported_chains") {
    const list = SUPPORTED_CHAINS.map((c) => ({
      chain: c,
      chainId: CHAINS[c].chainId,
      isEVM: CHAINS[c].isEVM,
      name: CHAINS[c].name,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
