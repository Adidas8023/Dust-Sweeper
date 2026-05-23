import { NextRequest, NextResponse } from "next/server";
import { convertUSDCToGas } from "@dust-sweeper/core";
import { loadServerEnv } from "@/lib/server-env";

loadServerEnv();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { chain, amountUSDC } = await req.json();
    if (!chain || typeof amountUSDC !== "number" || amountUSDC <= 0) {
      return NextResponse.json(
        { error: "chain and amountUSDC (positive number) required" },
        { status: 400 }
      );
    }
    const result = await convertUSDCToGas(chain, amountUSDC);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}
