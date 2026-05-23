import { NextRequest, NextResponse } from "next/server";
import {
  enrichPlanWithBridgeKitEstimates,
  planSweep,
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
  try {
    const {
      inventory,
      destChain,
      aggregationMode,
      recipientEvm,
      recipientSolana,
      destinationPayerEvm,
      destinationPayerSolana,
      requireDestinationPayer,
      signerKeys,
      rpcConfig,
      demoMode,
    } = await req.json();
    const plan = await withRuntimeRpcConfig(
      rpcConfig as RuntimeRpcConfig | undefined,
      async () => {
        const basePlan = planSweep(inventory, destChain, {
          aggregationMode,
          recipientEvm,
          recipientSolana,
          destinationPayerEvm,
          destinationPayerSolana,
          requireDestinationPayer,
        });
        return withRuntimeDemoMode(demoMode, () =>
          withRuntimeSignerKeys(
            demoMode ? undefined : (signerKeys as RuntimeSignerKeys | undefined),
            () =>
              demoMode
                ? Promise.resolve(basePlan)
                : enrichPlanWithBridgeKitEstimates(basePlan)
          )
        );
      }
    );
    return NextResponse.json(jsonSafe(plan));
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v
    )
  ) as T;
}
