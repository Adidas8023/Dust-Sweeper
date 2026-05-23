import { fetch as undiciFetch, ProxyAgent } from "undici";

let proxyAgent: ProxyAgent | null | undefined;
let proxyUrlCached: string | undefined;
let proxyTlsRejectUnauthorizedCached: string | undefined;

function shouldRejectProxyTls(): boolean {
  const value = process.env.OKX_PROXY_TLS_REJECT_UNAUTHORIZED;
  if (!value) return true;
  return !["0", "false", "no"].includes(value.toLowerCase());
}

function getProxyAgent(): ProxyAgent | null {
  const proxyUrl =
    process.env.OKX_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  if (!proxyUrl) return null;
  const tlsRejectUnauthorized = process.env.OKX_PROXY_TLS_REJECT_UNAUTHORIZED;
  if (
    proxyAgent !== undefined &&
    proxyUrlCached === proxyUrl &&
    proxyTlsRejectUnauthorizedCached === tlsRejectUnauthorized
  ) {
    return proxyAgent;
  }
  proxyUrlCached = proxyUrl;
  proxyTlsRejectUnauthorizedCached = tlsRejectUnauthorized;
  proxyAgent = new ProxyAgent({
    uri: proxyUrl,
    proxyTls: { rejectUnauthorized: shouldRejectProxyTls() },
  });
  return proxyAgent;
}

export function okxFetch(
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  const agent = getProxyAgent();
  const response = agent
    ? undiciFetch(input, {
        ...init,
        dispatcher: agent,
      } as Parameters<typeof undiciFetch>[1] & { dispatcher: ProxyAgent })
    : undiciFetch(input, init as Parameters<typeof undiciFetch>[1]);
  return response as unknown as Promise<Response>;
}
