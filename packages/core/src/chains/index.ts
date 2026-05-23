import type { Chain } from "../types.js";
import { getRuntimeRpcConfig } from "./runtime.js";

export interface ChainConfig {
  chain: Chain;
  chainId: number;
  isEVM: boolean;
  name: string;
  nativeSymbol: string;
  rpcEnvVar: string;
  publicRpc: string;
  // Alchemy network slug (e.g., "eth-mainnet"). Empty string means Alchemy
  // does not host this chain — fallback to publicRpc.
  alchemyNetwork: string;
  usdcAddress: string;
  cctpDomain: number;
  tokenMessengerAddress: string;
  messageTransmitterAddress: string;
  okxChainId: number;
  okxPortfolioSupported?: boolean;
}

// CCTP V2 addresses/domains verified against Circle's current docs:
//   https://developers.circle.com/cctp/references/contract-addresses
//   https://developers.circle.com/cctp/references/solana-programs
// USDC addresses verified against Circle's published chain metadata.
const EVM_TOKEN_MESSENGER_V2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const EVM_MESSAGE_TRANSMITTER_V2 = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const EDGE_TOKEN_MESSENGER_V2 = "0x98706A006bc632Df31CAdFCBD43F38887ce2ca5c";
const EDGE_MESSAGE_TRANSMITTER_V2 = "0x5b61381Fc9e58E70EfC13a4A97516997019198ee";

export const CHAINS: Record<Chain, ChainConfig> = {
  ethereum: {
    chain: "ethereum",
    chainId: 1,
    isEVM: true,
    name: "Ethereum",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_ETHEREUM",
    publicRpc: "https://eth.llamarpc.com",
    alchemyNetwork: "eth-mainnet",
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    cctpDomain: 0,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 1,
  },
  arbitrum: {
    chain: "arbitrum",
    chainId: 42161,
    isEVM: true,
    name: "Arbitrum",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_ARBITRUM",
    publicRpc: "https://arb1.arbitrum.io/rpc",
    alchemyNetwork: "arb-mainnet",
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    cctpDomain: 3,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 42161,
  },
  base: {
    chain: "base",
    chainId: 8453,
    isEVM: true,
    name: "Base",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_BASE",
    publicRpc: "https://mainnet.base.org",
    alchemyNetwork: "base-mainnet",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    cctpDomain: 6,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 8453,
  },
  polygon: {
    chain: "polygon",
    chainId: 137,
    isEVM: true,
    name: "Polygon",
    nativeSymbol: "MATIC",
    rpcEnvVar: "RPC_POLYGON",
    publicRpc: "https://polygon-rpc.com",
    alchemyNetwork: "polygon-mainnet",
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    cctpDomain: 7,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 137,
  },
  optimism: {
    chain: "optimism",
    chainId: 10,
    isEVM: true,
    name: "Optimism",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_OPTIMISM",
    publicRpc: "https://mainnet.optimism.io",
    alchemyNetwork: "opt-mainnet",
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    cctpDomain: 2,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 10,
  },
  avalanche: {
    chain: "avalanche",
    chainId: 43114,
    isEVM: true,
    name: "Avalanche",
    nativeSymbol: "AVAX",
    rpcEnvVar: "RPC_AVALANCHE",
    publicRpc: "https://api.avax.network/ext/bc/C/rpc",
    alchemyNetwork: "avax-mainnet",
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    cctpDomain: 1,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 43114,
  },
  unichain: {
    chain: "unichain",
    chainId: 130,
    isEVM: true,
    name: "Unichain",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_UNICHAIN",
    publicRpc: "https://mainnet.unichain.org",
    alchemyNetwork: "unichain-mainnet",
    usdcAddress: "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    cctpDomain: 10,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 130,
    okxPortfolioSupported: false,
  },
  linea: {
    chain: "linea",
    chainId: 59144,
    isEVM: true,
    name: "Linea",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_LINEA",
    publicRpc: "https://rpc.linea.build",
    alchemyNetwork: "linea-mainnet",
    usdcAddress: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff",
    cctpDomain: 11,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 59144,
  },
  sonic: {
    chain: "sonic",
    chainId: 146,
    isEVM: true,
    name: "Sonic",
    nativeSymbol: "S",
    rpcEnvVar: "RPC_SONIC",
    publicRpc: "https://rpc.soniclabs.com",
    alchemyNetwork: "",
    usdcAddress: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894",
    cctpDomain: 13,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 146,
  },
  monad: {
    chain: "monad",
    chainId: 143,
    isEVM: true,
    name: "Monad",
    nativeSymbol: "MON",
    rpcEnvVar: "RPC_MONAD",
    publicRpc: "https://rpc.monad.xyz",
    alchemyNetwork: "",
    usdcAddress: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    cctpDomain: 15,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 143,
  },
  codex: {
    chain: "codex",
    chainId: 81224,
    isEVM: true,
    name: "Codex",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_CODEX",
    publicRpc: "https://rpc.codex.xyz",
    alchemyNetwork: "",
    usdcAddress: "0xd996633a415985DBd7D6D12f4A4343E31f5037cf",
    cctpDomain: 12,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 81224,
    okxPortfolioSupported: false,
  },
  edge: {
    chain: "edge",
    chainId: 3343,
    isEVM: true,
    name: "Edge",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_EDGE",
    publicRpc: "https://edge-mainnet.g.alchemy.com/public",
    alchemyNetwork: "",
    usdcAddress: "0x98d2919b9A214E6Fa5384AC81E6864bA686Ad74c",
    cctpDomain: 28,
    tokenMessengerAddress: EDGE_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EDGE_MESSAGE_TRANSMITTER_V2,
    okxChainId: 3343,
    okxPortfolioSupported: false,
  },
  hyperevm: {
    chain: "hyperevm",
    chainId: 999,
    isEVM: true,
    name: "HyperEVM",
    nativeSymbol: "HYPE",
    rpcEnvVar: "RPC_HYPEREVM",
    publicRpc: "https://rpc.hyperliquid.xyz/evm",
    alchemyNetwork: "",
    usdcAddress: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    cctpDomain: 19,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 999,
    okxPortfolioSupported: false,
  },
  ink: {
    chain: "ink",
    chainId: 57073,
    isEVM: true,
    name: "Ink",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_INK",
    publicRpc: "https://rpc-gel.inkonchain.com",
    alchemyNetwork: "",
    usdcAddress: "0x2D270e6886d130D724215A266106e6832161EAEd",
    cctpDomain: 21,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 57073,
    okxPortfolioSupported: false,
  },
  morph: {
    chain: "morph",
    chainId: 2818,
    isEVM: true,
    name: "Morph",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_MORPH",
    publicRpc: "https://rpc.morphl2.io",
    alchemyNetwork: "",
    usdcAddress: "0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B",
    cctpDomain: 30,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 2818,
    okxPortfolioSupported: false,
  },
  pharos: {
    chain: "pharos",
    chainId: 1672,
    isEVM: true,
    name: "Pharos",
    nativeSymbol: "PHAROS",
    rpcEnvVar: "RPC_PHAROS",
    publicRpc: "https://rpc.pharos.xyz",
    alchemyNetwork: "",
    usdcAddress: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815",
    cctpDomain: 31,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 1672,
    okxPortfolioSupported: false,
  },
  plume: {
    chain: "plume",
    chainId: 98866,
    isEVM: true,
    name: "Plume",
    nativeSymbol: "PLUME",
    rpcEnvVar: "RPC_PLUME",
    publicRpc: "https://rpc.plume.org",
    alchemyNetwork: "",
    usdcAddress: "0x222365EF19F7947e5484218551B56bb3965Aa7aF",
    cctpDomain: 22,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 98866,
    okxPortfolioSupported: false,
  },
  sei: {
    chain: "sei",
    chainId: 1329,
    isEVM: true,
    name: "Sei",
    nativeSymbol: "SEI",
    rpcEnvVar: "RPC_SEI",
    publicRpc: "https://evm-rpc.sei-apis.com",
    alchemyNetwork: "",
    usdcAddress: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
    cctpDomain: 16,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 1329,
    okxPortfolioSupported: false,
  },
  worldchain: {
    chain: "worldchain",
    chainId: 480,
    isEVM: true,
    name: "World Chain",
    nativeSymbol: "ETH",
    rpcEnvVar: "RPC_WORLDCHAIN",
    publicRpc: "https://worldchain-mainnet.g.alchemy.com/public",
    alchemyNetwork: "",
    usdcAddress: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
    cctpDomain: 14,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 480,
    okxPortfolioSupported: false,
  },
  xdc: {
    chain: "xdc",
    chainId: 50,
    isEVM: true,
    name: "XDC",
    nativeSymbol: "XDC",
    rpcEnvVar: "RPC_XDC",
    publicRpc: "https://erpc.xdcrpc.com",
    alchemyNetwork: "",
    usdcAddress: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1",
    cctpDomain: 18,
    tokenMessengerAddress: EVM_TOKEN_MESSENGER_V2,
    messageTransmitterAddress: EVM_MESSAGE_TRANSMITTER_V2,
    okxChainId: 50,
    okxPortfolioSupported: false,
  },
  solana: {
    chain: "solana",
    chainId: 501,
    isEVM: false,
    name: "Solana",
    nativeSymbol: "SOL",
    rpcEnvVar: "RPC_SOLANA",
    publicRpc: "https://api.mainnet-beta.solana.com",
    alchemyNetwork: "solana-mainnet",
    usdcAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    cctpDomain: 5,
    tokenMessengerAddress: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe",
    messageTransmitterAddress: "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC",
    okxChainId: 501,
  },
};

export const SUPPORTED_CHAINS: Chain[] = Object.keys(CHAINS) as Chain[];

export function getChainConfig(chain: Chain): ChainConfig {
  return CHAINS[chain];
}

/**
 * Resolve RPC URL with priority:
 *   1. RPC_<CHAIN> or <CHAIN>_RPC_URL env var (explicit per-chain override)
 *   2. Alchemy URL (if ALCHEMY_API_KEY, or any configured Alchemy RPC key,
 *      is set AND this chain is on Alchemy)
 *   3. Public fallback RPC
 */
export function getRpcUrl(chain: Chain): string {
  const cfg = CHAINS[chain];
  const explicit = getExplicitRpcUrl(chain);
  if (explicit) return explicit;
  const alchemyKey = getAlchemyApiKey();
  if (alchemyKey && cfg.alchemyNetwork) {
    return `https://${cfg.alchemyNetwork}.g.alchemy.com/v2/${alchemyKey}`;
  }
  return cfg.publicRpc;
}

function getExplicitRpcUrl(chain: Chain): string | undefined {
  const cfg = CHAINS[chain];
  const upper = chain.toUpperCase().replace(/-/g, "_");
  const candidates = [cfg.rpcEnvVar, `${upper}_RPC_URL`];
  for (const key of candidates) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function getAlchemyApiKey(): string | undefined {
  const runtime = getRuntimeRpcConfig()?.alchemyApiKey?.trim();
  if (runtime) return runtime;

  const direct = process.env.ALCHEMY_API_KEY?.trim();
  if (direct) return direct;

  for (const chain of SUPPORTED_CHAINS) {
    const url = getExplicitRpcUrl(chain);
    const key = extractAlchemyKey(url);
    if (key) return key;
  }
  return undefined;
}

function extractAlchemyKey(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/^https:\/\/[^/]+\.g\.alchemy\.com\/v2\/([^/?#]+)/i);
  return match?.[1];
}

export function hasCCTPSupport(chain: Chain): boolean {
  const cfg = CHAINS[chain];
  // Solana uses program IDs (constants.ts) instead of the EVM-style contract
  // address fields, so treat it as always-supported here.
  if (!cfg.isEVM) return chain === "solana";
  return cfg.tokenMessengerAddress !== "" && cfg.messageTransmitterAddress !== "";
}
