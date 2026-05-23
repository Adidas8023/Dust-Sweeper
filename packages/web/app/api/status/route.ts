import { NextResponse } from "next/server";
import { isDemoMode } from "@dust-sweeper/core";
import { loadServerEnv } from "@/lib/server-env";

loadServerEnv();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const hasOkxKey = Boolean(process.env.OKX_API_KEY);
  const hasOkxSecret = Boolean(process.env.OKX_SECRET_KEY);
  const hasOkxPassphrase = Boolean(
    process.env.OKX_PASSPHRASE || process.env.OKX_API_PASSPHRASE
  );
  const hasOkxProjectId = Boolean(process.env.OKX_PROJECT_ID);
  return NextResponse.json({
    demoMode: isDemoMode(),
    hasEvmKey: Boolean(
      process.env.PRIVATE_KEY_EVM || process.env.PRIVATE_KEYS_EVM
    ),
    hasSolanaKey: Boolean(
      process.env.PRIVATE_KEY_SOL || process.env.PRIVATE_KEYS_SOL
    ),
    hasOkxAuth: hasOkxKey && hasOkxSecret && hasOkxPassphrase && hasOkxProjectId,
    hasOkxProjectId,
    hasAlchemyApiKey: Boolean(process.env.ALCHEMY_API_KEY),
  });
}
