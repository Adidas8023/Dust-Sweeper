import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

describe("Onchain OS CLI adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    execFileMock.mockReset();
    delete process.env.ONCHAINOS_BIN;
    process.env.ONCHAINOS_MAX_RPS = "3";
  });

  it("paces concurrent CLI calls to at most three starts per second", async () => {
    const starts: number[] = [];
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: Function) => {
        starts.push(Date.now());
        cb(null, {
          stdout: JSON.stringify({
            ok: true,
            data: [
              {
                fromTokenAmount: "1000",
                toTokenAmount: "990",
              },
            ],
          }),
          stderr: "",
        });
      }
    );

    const { getQuoteViaOnchainOS } = await import(
      "../../src/okx/onchainos-cli.js"
    );

    const requests = Promise.all([
      getQuoteViaOnchainOS("polygon", "0xd6df932a45c0f255f85145f286ea0b292b21c90b", "1000"),
      getQuoteViaOnchainOS("polygon", "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", "1000"),
      getQuoteViaOnchainOS("polygon", "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", "1000"),
    ]);

    await vi.runAllTimersAsync();
    await requests;

    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(333);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(333);
  });

  it("parses the final JSON payload after verbose debug logs", async () => {
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, {
          stdout: [
            '[DEBUG][fetch_quote] response: Ok(Array [Object {"chainIndex": String("8453")}])',
            JSON.stringify({
              ok: true,
              data: [
                {
                  fromTokenAmount: "319462001550344344537",
                  toTokenAmount: "7765013",
                  priceImpactPercent: "-1.01",
                  estimateGasFee: "288000",
                  dexRouterList: [{ dexProtocol: { dexName: "Hydrex" } }],
                },
              ],
            }),
          ].join("\n"),
          stderr: "",
        });
      }
    );

    const { getQuoteViaOnchainOS } = await import(
      "../../src/okx/onchainos-cli.js"
    );

    const quote = await getQuoteViaOnchainOS(
      "base",
      "0xe57e601c06689d3e2bf7db7bebb14b4ff28400c6",
      "319462001550344344537"
    );

    expect(quote.toAmount).toBe("7765013");
    expect(quote.priceImpactPct).toBe(-1.01);
  });

  it("does not mistake an inner approve tx object for the CLI payload", async () => {
    const data =
      "0x095ea7b300000000000000000000000057df6092665eb6058de53939612413ff4b09114e" +
      "000000000000000000000000000000000000000000000011516d05d3eb9053d9";
    execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, {
          stdout: [
            '[DEBUG][fetch_approve] response: Ok(Array [Object {"data": String("0x095ea7b3"), "gasLimit": String("70000")}])',
            JSON.stringify({
              ok: true,
              data: [
                {
                  data,
                  dexContractAddress: "0x57df6092665eb6058DE53939612413ff4B09114E",
                  gasLimit: "70000",
                },
              ],
            }),
          ].join("\n"),
          stderr: "",
        });
      }
    );

    const { getApproveTxViaOnchainOS } = await import(
      "../../src/okx/onchainos-cli.js"
    );

    const tx = await getApproveTxViaOnchainOS(
      "base",
      "0xe57e601c06689d3e2bf7db7bebb14b4ff28400c6",
      "319462001550344344537"
    );

    expect(tx.data).toBe(data);
    expect(tx.gas).toBe("70000");
  });
});
