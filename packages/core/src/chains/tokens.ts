import type { Chain } from "../types.js";

// Stablecoin contract addresses (lowercase) per chain.
// Native Circle USDC is classified separately from bridged USDC.e/USDbC in
// filter.ts. Bridged USDC variants stay here because they must be swapped into
// native USDC before the CCTP leg can burn.
export const STABLES: Record<Chain, string[]> = {
  ethereum: [
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
    "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
    "0x853d955acef822db058eb8505911ed77f175b99e", // FRAX
    "0x5f98805a4e8be255a32880fdec7f6728c6568ba0", // LUSD
  ],
  arbitrum: [
    "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8", // USDC.e
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
    "0x17fc002b466eec40dae837fc4be5c67993ddbd6f", // FRAX
  ],
  base: [
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
  ],
  polygon: [
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // bridged USDC.e
    "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
    "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DAI
    "0x45c32fa6df82ead1e2ef74d17b76547eddfaff89", // FRAX
  ],
  optimism: [
    "0x7f5c764cbc14f9669b88837ca1490cca17c31607", // USDC.e
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // USDT
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
  ],
  avalanche: [
    "0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664", // USDC.e
    "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT
    "0xd586e7f844cea2f87f50152665bcbc2c279d8d70", // DAI.e
  ],
  unichain: [],
  linea: [
    "0xa219439258ca9da29e9cc4ce5596924745e12b93", // USDT
  ],
  sonic: [],
  monad: [],
  codex: [],
  edge: [],
  hyperevm: [],
  ink: [],
  morph: [],
  pharos: [],
  plume: [],
  sei: [],
  worldchain: [],
  xdc: [],
  solana: [
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  ],
};

// Wrapped native tokens (lowercase) per chain. Opt-in sweep category.
export const WRAPPED_NATIVES: Record<Chain, string[]> = {
  ethereum: ["0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"], // WETH
  arbitrum: ["0x82af49447d8a07e3bd95bd0d56f35241523fbab1"], // WETH
  base: ["0x4200000000000000000000000000000000000006"], // WETH
  polygon: ["0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270"], // WMATIC
  optimism: ["0x4200000000000000000000000000000000000006"], // WETH
  avalanche: ["0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7"], // WAVAX
  unichain: [],
  linea: ["0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f"], // WETH
  sonic: [],
  monad: [],
  codex: [],
  edge: [],
  hyperevm: [],
  ink: [],
  morph: [],
  pharos: [],
  plume: [],
  sei: [],
  worldchain: [],
  xdc: [],
  solana: ["So11111111111111111111111111111111111111112"], // wSOL
};
