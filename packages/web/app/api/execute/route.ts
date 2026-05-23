import { NextRequest } from "next/server";
import {
  executeSweep,
  withRuntimeDemoMode,
  withRuntimeRpcConfig,
  withRuntimeSignerKeys,
  type RuntimeRpcConfig,
  type RuntimeSignerKeys,
} from "@dust-sweeper/core";
import { loadServerEnv } from "@/lib/server-env";

loadServerEnv();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { plan, signerKeys, rpcConfig, demoMode } = (await req.json()) as {
    plan: Parameters<typeof executeSweep>[0];
    signerKeys?: RuntimeSignerKeys;
    rpcConfig?: RuntimeRpcConfig;
    demoMode?: boolean;
  };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const result = await withRuntimeRpcConfig(rpcConfig, () =>
          withRuntimeDemoMode(demoMode, () =>
            withRuntimeSignerKeys(demoMode ? undefined : signerKeys, () =>
              executeSweep(plan, (ev) => emit(ev))
            )
          )
        );
        emit({ kind: "final", result, timestamp: Date.now() });
      } catch (e: any) {
        emit({ kind: "fatal", error: e.message ?? String(e), timestamp: Date.now() });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
