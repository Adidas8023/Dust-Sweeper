import type { Chain } from "@dust-sweeper/core";

export const EXPLORERS: Record<Chain, string> = {
  ethereum: "https://etherscan.io/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  base: "https://basescan.org/tx/",
  polygon: "https://polygonscan.com/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  avalanche: "https://snowtrace.io/tx/",
  linea: "https://lineascan.build/tx/",
  unichain: "https://uniscan.xyz/tx/",
  sonic: "https://sonicscan.org/tx/",
  monad: "",
  codex: "https://explorer.codex.xyz/tx/",
  edge: "https://pro.edgex.exchange/en-US/explorer/tx/",
  hyperevm: "https://hyperevmscan.io/tx/",
  ink: "https://explorer.inkonchain.com/tx/",
  morph: "https://explorer.morph.network/tx/",
  pharos: "https://pharos.socialscan.io/tx/",
  plume: "https://explorer.plume.org/tx/",
  sei: "https://seiscan.io/tx/",
  worldchain: "https://worldscan.org/tx/",
  xdc: "https://xdcscan.io/tx/",
  solana: "https://solscan.io/tx/",
};

const OKX_EXPLORER_SLUGS: Partial<Record<Chain, string>> = {
  ethereum: "eth",
  arbitrum: "arbitrum",
  base: "base",
  polygon: "polygon",
  optimism: "optimism",
  avalanche: "avax",
  linea: "linea",
  solana: "solana",
};

export function explorerUrl(chain: Chain, hash: string): string | null {
  if (!hash || hash.startsWith("0xDEMO")) return null;
  const base = EXPLORERS[chain];
  if (!base) return null;
  return base + hash;
}

export function okxAddressUrl(chain: Chain, address: string): string | null {
  const slug = OKX_EXPLORER_SLUGS[chain];
  if (!slug || !address) return null;
  return `https://web3.okx.com/explorer/${slug}/address/${address}`;
}

export function okxTokenUrl(chain: Chain, tokenAddress: string): string | null {
  const slug = OKX_EXPLORER_SLUGS[chain];
  if (!slug || !tokenAddress) return null;
  return `https://web3.okx.com/token/${slug}/${tokenAddress}`;
}

export function shortHash(hash: string): string {
  if (!hash) return "";
  if (hash.length <= 22) return hash;
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}
