import {
  Connection,
  Keypair,
  VersionedTransaction,
  Transaction,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { buildAuthHeaders } from "./auth.js";
import { okxFetch } from "./http.js";
import {
  getSolanaSwapTxViaOnchainOS,
  shouldUseOnchainOsFallback,
} from "./onchainos-cli.js";
import { USDC_MINT } from "../solana/constants.js";
import { getSolanaConnection, getSolanaKeypair } from "../signing/svm.js";

const BASE = "https://web3.okx.com";
const SOLANA_CHAIN_INDEX = 501;
const NATIVE_SOL_SENTINEL = "11111111111111111111111111111111";

/**
 * Fetch a pre-built swap transaction from OKX Solana aggregator.
 * Returns a base64-encoded serialized transaction ready to sign.
 */
export async function getSolanaSwapTx(
  fromTokenMint: string,
  amount: string,
  userAddress: string,
  slippageBps = 100
): Promise<{ txBase64: string }> {
  try {
    return await getSolanaSwapTxViaOkxApi(
      fromTokenMint,
      amount,
      userAddress,
      slippageBps
    );
  } catch (e) {
    if (!shouldUseOnchainOsFallback(e)) throw e;
    return getSolanaSwapTxViaOnchainOS(
      fromTokenMint,
      amount,
      userAddress,
      slippageBps
    );
  }
}

async function getSolanaSwapTxViaOkxApi(
  fromTokenMint: string,
  amount: string,
  userAddress: string,
  slippageBps = 100
): Promise<{ txBase64: string }> {
  const from = fromTokenMint || NATIVE_SOL_SENTINEL;
  const slippage = (slippageBps / 10000).toString();
  const path =
    `/api/v6/dex/aggregator/swap?` +
    `chainIndex=${SOLANA_CHAIN_INDEX}&amount=${amount}` +
    `&fromTokenAddress=${from}&toTokenAddress=${USDC_MINT.toBase58()}` +
    `&userWalletAddress=${userAddress}&slippage=${slippage}`;
  const res = await okxFetch(BASE + path, {
    headers: buildAuthHeaders("GET", path, ""),
  });
  if (!res.ok) throw new Error(`OKX Solana swap HTTP ${res.status}`);
  const json = (await res.json()) as any;
  if (json.code !== "0")
    throw new Error(`OKX Solana swap: ${json.msg ?? "unknown"}`);
  const d = json.data?.[0]?.tx;
  if (!d) throw new Error("OKX Solana swap: empty tx");
  // OKX returns base64 serialized tx (versioned) in tx.data
  return { txBase64: d.data };
}

/**
 * Sign and broadcast a Solana swap transaction. If `owner` is given, that
 * specific signer must be configured; otherwise the first configured Solana
 * signer is used.
 */
export async function executeSolanaSwap(
  fromTokenMint: string,
  amount: string,
  owner?: string
): Promise<string> {
  const kp = getSolanaKeypair(owner);
  if (!kp) {
    throw new Error(
      owner
        ? `No Solana signer configured for ${owner}`
        : "PRIVATE_KEY_SOL not set"
    );
  }
  const connection = getSolanaConnection();

  const { txBase64 } = await getSolanaSwapTx(
    fromTokenMint,
    amount,
    kp.publicKey.toBase58()
  );

  const raw = Buffer.from(txBase64, "base64");
  // Try as VersionedTransaction first, fall back to legacy.
  let sig: string;
  try {
    const vt = VersionedTransaction.deserialize(raw);
    vt.sign([kp]);
    sig = await connection.sendRawTransaction(vt.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
  } catch {
    const legacy = Transaction.from(raw);
    legacy.partialSign(kp);
    sig = await sendAndConfirmRawTransaction(connection, legacy.serialize(), {
      commitment: "confirmed",
    });
  }
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}
