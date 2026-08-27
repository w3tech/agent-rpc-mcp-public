# Ankr Agent RPC — MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI agents token-efficient access to blockchain data through Ankr RPC.

Reads go out with the **TORPC** `Accept-Token-Tier: 2` header. Tier 1 already renames the fields, turns hex into decimal and drops the service fields (`logsBloom`, `cumulativeGasUsed`, header roots). Tier 2 adds the ABI decode on top, so contract calls and event logs come back as named arguments.

A live run over 21 methods and 25 Ethereum mainnet blocks, token-weighted and counted with `o200k_base` over the full HTTP body, came out **48.4% smaller at tier 2** and 35.3% smaller at tier 1. Decode-heavy reads save the most: `eth_getTransactionByHash` 69.0%, `eth_getTransactionReceipt` 64.5%, `eth_getBlockReceipts` 60.3%, the block methods 40.4%, `eth_getLogs` 28.9%; scalar reads save 9–19%. Per-method figures: [live-token-savings-2026-07-17.md](https://github.com/w3tech/torpc-js/blob/main/bench/results/live-token-savings-2026-07-17.md).

---

## Quick start

Get a free API key at [ankr.com/rpc](https://www.ankr.com/rpc/).

### Hosted (no install)

The server runs at `https://mcp.ankr.com/rpc`. Send your key as the `x-ankr-api-key` header; each request carries the caller's own key, and the server holds no credential of yours.

```json
{
  "mcpServers": {
    "ankr-agent-rpc": {
      "url": "https://mcp.ankr.com/rpc",
      "headers": { "x-ankr-api-key": "<YOUR_KEY>" }
    }
  }
}
```

### Local (stdio)

```json
{
  "mcpServers": {
    "ankr-agent-rpc": {
      "command": "npx",
      "args": ["-y", "@w3tech.io/agent-rpc-mcp"],
      "env": { "ANKR_API_KEY": "<YOUR_KEY>" }
    }
  }
}
```

That JSON goes in your client's MCP config: Claude Desktop (`claude_desktop_config.json`), Cursor, Windsurf, or any other MCP client. Cursor also accepts the command form:

```sh
env ANKR_API_KEY=<YOUR_KEY> npx -y @w3tech.io/agent-rpc-mcp
```

---

## Tools

**Raw RPC, TORPC tier 2**

| Tool             | What it answers                                                    |
| ---------------- | ------------------------------------------------------------------ |
| `getTransaction` | transaction + receipt by hash, ABI-decoded                         |
| `getLogs`        | event logs, decoded; wide block ranges are chunk-scanned and paged |
| `getBlock`       | block header, optionally with decoded transactions                 |

**Indexed and mixed**

| Tool                   | What it answers                                          |
| ---------------------- | -------------------------------------------------------- |
| `getBalances`          | native coin + ERC-20 balances with USD                   |
| `getAccountBalance`    | balances across many chains at once                      |
| `getWalletActivity`    | an address's transaction history, paged                  |
| `getNFTs`              | NFTs held by an address                                  |
| `getTokenHolders`      | holders of an ERC-20, paged                              |
| `getTokenPrice`        | USD price with chain, asset and `as_of` provenance       |
| `getTokenPriceHistory` | historical price series for a token                      |
| `getInteractions`      | which chains an address has touched, cross-chain         |
| `resolveContract`      | is-contract, best-effort ERC-20 metadata, EIP-1967 proxy |
| `searchChain`          | resolve a tx/block hash, an address, or a block number   |
| `expandResult`         | continue any paged result from its cursor                |

**Discovery and escape hatch**

| Tool              | What it answers                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `listChains`      | supported chains, max TORPC tier, indexer availability                                                    |
| `describeMethods` | the param shape and a worked example per JSON-RPC method, plus whether your key may call it on that chain |
| `rpcCall`         | any read method the routed tools do not cover                                                             |

That is the whole set: **17 tools**.

### What `rpcCall` will and will not do

`rpcCall` is a read and data escape hatch, never a wallet. It is a **write denylist, not a read allowlist**: it refuses transaction broadcast and signing, transaction _building_, node and dev-node administration, mutating verbs, and the node-operation half of geth's `debug_*` namespace — on every chain family — and **forwards everything else**.

It therefore keeps no list of permitted reads. Which reads exist is decided per chain by the endpoint's blockchain schema and by what your tenant may call, so a forwarded read can still come back refused (`Method disabled, reason: restricted by blockchain schema`). That refusal is the authoritative answer; `listChains` reports coverage.

Sign and send transactions with your own wallet or signer.

---

## Reading a response

Two fields decide how to read every result, and an agent that skips them will misread output that is technically correct.

**`_meta.tier`** — the TORPC tier is negotiated **per call and is not guaranteed**. A response comes back at tier 0 (raw, undecoded, no `args`) when it is above the proxy's compression budget, and also when the method is one the proxy does not compress at all, such as `eth_call`, `eth_getCode` and `eth_getStorageAt`. Every successful response carries the tier actually applied in `_meta.tier`, so check it before looking for decoded fields; an error result carries `_meta.error_code` instead and no tier at all. Some tools additionally report `tier_degraded: true` in the body, with a note on how to narrow the request, when they asked for tier 2 on your behalf and got less. Not all of them do, so `_meta.tier` is the field to rely on.

**Decoded amounts are raw base units**, with no decimals applied. `args.value: "41695680"` on a 6-decimal token is 41.69568, not 41 million. Read the token's decimals with `resolveContract` before reporting a human number.

`_meta.token_count` is a real **o200k_base** count of the emitted text, not a `chars/4` estimate. It is exact up to 256 KB of emitted text, which covers every display-capped response; above that it is extrapolated and the response carries `_meta.token_count_estimated: true`. Responses are minified JSON, so a model with a different tokenizer sees a similar but not identical number.

Tool inputs are **strict**: an unknown argument is rejected with a validation error rather than silently dropped, so a misspelled argument name is reported instead of ignored. Block numbers above 2^53 must be passed as strings, because a JSON number that large is not exact.

---

## TORPC tiers

| Tier | Meaning                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | passthrough — standard JSON-RPC                                                                                                            |
| 1    | field rename, hex → decimal, and the service fields dropped: `logsBloom`, `cumulativeGasUsed`, `contractAddress`, `type`, the header roots |
| 2    | tier 1 plus the ABI decode — each log becomes `{contract, event, args}`, calldata becomes a decoded function with named args               |

Negotiation is by header: `Accept-Token-Tier: 0|1|2` on the request, `Token-Tier` on the response. The proxy applies the requested tier only while the response stays inside its compression budget, and that budget is internal to the proxy — so this server never predicts the tier, it detects the applied one and reports it.

On a JSON-RPC **batch** that header describes the array, not any one element: a response array carries a single `Token-Tier`, and its value is the **minimum** tier applied across the elements. v1 defines no per-element tier signal, elements may sit above that floor, and a client reads each element's own tier from its shape — renamed fields and decimal strings for tier 1, `event`/`args` for tier 2 — rather than from the header. So the header is a floor and a signal that a transform was applied; which methods reach tier 2 is declared per method in the descriptor at [`https://mcp.ankr.com/.well-known/torpc.json`](https://mcp.ankr.com/.well-known/torpc.json), which also ships in the npm package at `static/.well-known/torpc.json`.

Specification: [w3tech/torpc](https://github.com/w3tech/torpc), released under CC0-1.0, with the [TORPC docs page](https://www.ankr.com/docs/agentic-rpc/torpc/) as the narrative version. The reference decoder is published as [`@w3tech.io/torpc-decoder`](https://www.npmjs.com/package/@w3tech.io/torpc-decoder) (Apache-2.0); its source and the benchmark harness live in [w3tech/torpc-js](https://github.com/w3tech/torpc-js), under `codec/`. The EVM tier-1 and tier-2 rules are normative in the spec today; the conformance suite is a scaffold, so no implementation, this one included, claims conformance yet.

---

## Discovery

Two machine-readable documents describe this deployment. Both are public, carry no credential and are readable cross-origin.

| Document | Served at |
| --- | --- |
| TORPC descriptor: protocol version, negotiation headers, tier meanings, method lists | [`mcp.ankr.com/.well-known/torpc.json`](https://mcp.ankr.com/.well-known/torpc.json)<br>[`rpc.ankr.com/.well-known/torpc.json`](https://rpc.ankr.com/.well-known/torpc.json) |
| Agent card: an [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) registration file naming who answers, and at which MCP endpoints | [`mcp.ankr.com/.well-known/agent-card.json`](https://mcp.ankr.com/.well-known/agent-card.json)<br>[`rpc.ankr.com/.well-known/agent-card.json`](https://rpc.ankr.com/.well-known/agent-card.json) |

Both also ship in the npm package under `static/.well-known/`. Read the served copy as the deployment's own statement of what it supports: a packaged copy can lag it.

The card lists the MCP services and states `x402Support: false`. It claims no on-chain registration and no trust mechanism, because there is none to claim.

---

## Supported chains

Ethereum, BSC, Polygon, Arbitrum, Optimism, Base, Avalanche and more, plus testnets. Indexed tools cover a wider set than the raw-RPC tools.

Call `listChains` for the live matrix rather than trusting a list in a README — coverage changes without a release here.

---

## Managing your Ankr account

A second, separate MCP surface at `https://mcp.ankr.com/mcp` covers account management — API keys, allowlists, usage, billing reads and team membership — and authenticates with OAuth rather than an API key. Sign in when your client prompts. An RPC API key is not management authority and will be refused there.

---

## Links

- API keys and plans: [ankr.com/rpc](https://www.ankr.com/rpc/)
- Documentation: [Agent RPC](https://www.ankr.com/docs/agentic-rpc/agent-rpc-mcp/) and [account management](https://www.ankr.com/docs/rpc-service/getting-started/management-mcp/) on ankr.com/docs
- TORPC specification: [w3tech/torpc](https://github.com/w3tech/torpc) (CC0-1.0), narrated on the [TORPC docs page](https://www.ankr.com/docs/agentic-rpc/torpc/)
- TORPC decoder: [`@w3tech.io/torpc-decoder`](https://www.npmjs.com/package/@w3tech.io/torpc-decoder) (Apache-2.0), source in [w3tech/torpc-js](https://github.com/w3tech/torpc-js) under `codec/`
- npm package: [`@w3tech.io/agent-rpc-mcp`](https://www.npmjs.com/package/@w3tech.io/agent-rpc-mcp)
- Discovery documents: [TORPC descriptor](https://mcp.ankr.com/.well-known/torpc.json) and [agent card](https://mcp.ankr.com/.well-known/agent-card.json)

## License

MIT — see [LICENSE](./LICENSE).
