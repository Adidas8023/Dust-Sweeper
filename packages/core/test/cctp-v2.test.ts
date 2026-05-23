import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import {
  Arbitrum,
  Avalanche,
  Base,
  BridgeChain,
  Codex,
  Edge,
  Ethereum,
  HyperEVM,
  Ink,
  Linea,
  Monad,
  Morph,
  Optimism,
  Pharos,
  Plume,
  Polygon,
  Sei,
  Solana,
  Sonic,
  Unichain,
  WorldChain,
  XDC,
} from "@circle-fin/bridge-kit";
import {
  CCTP_FINALITY_THRESHOLD,
  CCTP_ZERO_BYTES32,
  TOKEN_MESSENGER_V2_ABI,
  buildDepositForBurnArgs,
} from "../src/cctp/evm.js";
import { CHAINS, hasCCTPSupport } from "../src/chains/index.js";
import { toBridgeChain } from "../src/cctp/bridge-kit.js";
import {
  MESSAGE_TRANSMITTER_PROGRAM_ID,
  TOKEN_MESSENGER_MINTER_PROGRAM_ID,
} from "../src/solana/constants.js";

const TOKEN_MESSENGER_V2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const MESSAGE_TRANSMITTER_V2 = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

const BRIDGE_KIT_MAINNET_CHAINS = [
  { appChain: "ethereum", bridgeChain: BridgeChain.Ethereum, sdk: Ethereum },
  { appChain: "arbitrum", bridgeChain: BridgeChain.Arbitrum, sdk: Arbitrum },
  { appChain: "base", bridgeChain: BridgeChain.Base, sdk: Base },
  { appChain: "polygon", bridgeChain: BridgeChain.Polygon, sdk: Polygon },
  { appChain: "optimism", bridgeChain: BridgeChain.Optimism, sdk: Optimism },
  { appChain: "avalanche", bridgeChain: BridgeChain.Avalanche, sdk: Avalanche },
  { appChain: "unichain", bridgeChain: BridgeChain.Unichain, sdk: Unichain },
  { appChain: "linea", bridgeChain: BridgeChain.Linea, sdk: Linea },
  { appChain: "sonic", bridgeChain: BridgeChain.Sonic, sdk: Sonic },
  { appChain: "monad", bridgeChain: BridgeChain.Monad, sdk: Monad },
  { appChain: "codex", bridgeChain: BridgeChain.Codex, sdk: Codex },
  { appChain: "edge", bridgeChain: BridgeChain.Edge, sdk: Edge },
  { appChain: "hyperevm", bridgeChain: BridgeChain.HyperEVM, sdk: HyperEVM },
  { appChain: "ink", bridgeChain: BridgeChain.Ink, sdk: Ink },
  { appChain: "morph", bridgeChain: BridgeChain.Morph, sdk: Morph },
  { appChain: "pharos", bridgeChain: BridgeChain.Pharos, sdk: Pharos },
  { appChain: "plume", bridgeChain: BridgeChain.Plume, sdk: Plume },
  { appChain: "sei", bridgeChain: BridgeChain.Sei, sdk: Sei },
  {
    appChain: "worldchain",
    bridgeChain: BridgeChain.World_Chain,
    sdk: WorldChain,
  },
  { appChain: "xdc", bridgeChain: BridgeChain.XDC, sdk: XDC },
  { appChain: "solana", bridgeChain: BridgeChain.Solana, sdk: Solana },
] as const;

describe("CCTP V2 chain configuration", () => {
  it("covers every Bridge Kit mainnet CCTP chain used by Dust Sweeper", () => {
    for (const { appChain, bridgeChain, sdk } of BRIDGE_KIT_MAINNET_CHAINS) {
      expect(CHAINS, `${appChain} missing from CHAINS`).toHaveProperty(appChain);
      const cfg = CHAINS[appChain as keyof typeof CHAINS];
      expect(toBridgeChain(appChain as any), `${appChain} BridgeChain`).toBe(
        bridgeChain
      );
      expect(hasCCTPSupport(appChain as any), `${appChain} CCTP support`).toBe(
        true
      );
      expect(cfg.usdcAddress.toLowerCase(), `${appChain} USDC`).toBe(
        sdk.usdcAddress.toLowerCase()
      );
      expect(cfg.cctpDomain, `${appChain} CCTP domain`).toBe(sdk.cctp.domain);

      if (sdk.type === "evm") {
        expect(cfg.isEVM, `${appChain} EVM flag`).toBe(true);
        expect(cfg.chainId, `${appChain} chainId`).toBe(sdk.chainId);
        expect(
          cfg.tokenMessengerAddress.toLowerCase(),
          `${appChain} TokenMessenger`
        ).toBe(sdk.cctp.contracts.v2.tokenMessenger.toLowerCase());
        expect(
          cfg.messageTransmitterAddress.toLowerCase(),
          `${appChain} MessageTransmitter`
        ).toBe(sdk.cctp.contracts.v2.messageTransmitter.toLowerCase());
      }
    }
  });

  it("uses the standard Circle V2 EVM contracts where Bridge Kit does not override them", () => {
    for (const cfg of Object.values(CHAINS).filter((c) => c.isEVM)) {
      if (cfg.chain === "edge") continue;
      expect(cfg.tokenMessengerAddress, `${cfg.chain} TokenMessenger`).toBe(
        TOKEN_MESSENGER_V2
      );
      expect(
        cfg.messageTransmitterAddress,
        `${cfg.chain} MessageTransmitter`
      ).toBe(MESSAGE_TRANSMITTER_V2);
      expect(hasCCTPSupport(cfg.chain)).toBe(true);
    }
  });

  it("uses current Sonic and Monad CCTP V2 domains and USDC metadata", () => {
    expect(CHAINS.sonic.cctpDomain).toBe(13);
    expect(CHAINS.sonic.chainId).toBe(146);
    expect(CHAINS.sonic.usdcAddress).toBe(
      "0x29219dd400f2Bf60E5a23d13Be72B486D4038894"
    );

    expect(CHAINS.monad.cctpDomain).toBe(15);
    expect(CHAINS.monad.chainId).toBe(143);
    expect(CHAINS.monad.usdcAddress).toBe(
      "0x754704Bc059F8C67012fEd69BC8A327a5aafb603"
    );
    expect(CHAINS.monad.publicRpc).toBeTruthy();
  });

  it("uses Circle Solana CCTP V2 program IDs", () => {
    expect(TOKEN_MESSENGER_MINTER_PROGRAM_ID.toBase58()).toBe(
      "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe"
    );
    expect(MESSAGE_TRANSMITTER_PROGRAM_ID.toBase58()).toBe(
      "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"
    );
  });
});

describe("EVM CCTP V2 depositForBurn encoding", () => {
  it("encodes the 7-argument TokenMessengerV2 depositForBurn call", () => {
    const args = buildDepositForBurnArgs({
      amount: 123_000000n,
      destinationDomain: CHAINS.arbitrum.cctpDomain,
      mintRecipient32:
        "0x0000000000000000000000003333333333333333333333333333333333333333",
      burnToken: CHAINS.ethereum.usdcAddress as `0x${string}`,
    });

    const data = encodeFunctionData({
      abi: TOKEN_MESSENGER_V2_ABI,
      functionName: "depositForBurn",
      args,
    });
    const decoded = decodeFunctionData({
      abi: TOKEN_MESSENGER_V2_ABI,
      data,
    });

    expect(decoded.functionName).toBe("depositForBurn");
    expect(decoded.args).toEqual([
      123_000000n,
      CHAINS.arbitrum.cctpDomain,
      "0x0000000000000000000000003333333333333333333333333333333333333333",
      CHAINS.ethereum.usdcAddress,
      CCTP_ZERO_BYTES32,
      0n,
      CCTP_FINALITY_THRESHOLD.STANDARD,
    ]);
  });
});
