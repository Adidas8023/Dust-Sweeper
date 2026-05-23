import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApproveTx } from "../../src/okx/dex.js";
import { okxFetch } from "../../src/okx/http.js";

vi.mock("../../src/okx/http.js", () => ({
  okxFetch: vi.fn(),
}));

describe("OKX DEX adapter", () => {
  beforeEach(() => {
    vi.mocked(okxFetch).mockReset();
    process.env.OKX_API_KEY = "key";
    process.env.OKX_SECRET_KEY = "secret";
    process.env.OKX_PASSPHRASE = "pass";
    process.env.OKX_PROJECT_ID = "project";
  });

  it("builds ERC20 approvals against the token contract, not the router spender", async () => {
    const token = "0xd6df932a45c0f255f85145f286ea0b292b21c90b";
    const router = "0x3B86917369B83a6892f553609F3c2F439C184e31";
    vi.mocked(okxFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              dexContractAddress: router,
              data: "0x095ea7b3",
              gasLimit: "70000",
            },
          ],
        }),
        { status: 200 }
      )
    );

    const tx = await getApproveTx("polygon", token, "1000");

    expect(tx.to).toBe(token);
    expect(tx.data).toBe("0x095ea7b3");
  });
});
