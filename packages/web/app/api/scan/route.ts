import { NextRequest, NextResponse } from "next/server";
import {
  scanDust,
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
    const body = await req.json();
    const settings = body?.settings ?? body;
    const signerKeys = body?.signerKeys as RuntimeSignerKeys | undefined;
    const rpcConfig = body?.rpcConfig as RuntimeRpcConfig | undefined;
    const demoMode =
      typeof body?.demoMode === "boolean" ? body.demoMode : undefined;
    const inv = await withRuntimeRpcConfig(rpcConfig, () =>
      withRuntimeDemoMode(demoMode, () =>
        withRuntimeSignerKeys(demoMode ? undefined : signerKeys, () =>
          scanDust(settings)
        )
      )
    );
    return NextResponse.json(inv);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}
