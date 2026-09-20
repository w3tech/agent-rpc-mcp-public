# Changelog

Notable changes to the Ankr Agent RPC MCP server as a consumer of it sees them.

Version headings are npm releases of
[`@w3tech.io/agent-rpc-mcp`](https://www.npmjs.com/package/@w3tech.io/agent-rpc-mcp), dated to the
day that version was published, so an entry describes a released package rather than a commit. This
repository is the public home of the README, `llms.txt`, the `server.json` registry manifest and
`.well-known/torpc.json`; changes that landed here but that no published version carries yet sit
under Unreleased. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- `server.json`, an MCP registry manifest in the `io.github.w3tech` namespace, declaring both ways
  to reach the server: the hosted endpoint at `https://mcp.ankr.com/rpc` and the npm package run as
  a local stdio process. Publishing the listing is a manual step rather than a side effect of a
  merge, because a registry listing is permanent and public.
- A **Discovery** section in the README, documenting the two machine-readable documents that
  describe this deployment: the TORPC descriptor and the
  [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent card, each with its served URL on both
  `mcp.ankr.com` and `rpc.ankr.com`, the note that both also ship in the package under
  `static/.well-known/` and that the served copy is the deployment's own statement because a
  packaged copy can lag it, and the card's `x402Support: false` with no on-chain registration and no
  trust mechanism claimed. Both documents are served and both ship in 0.2.2; this is the
  documentation of them, and the README published with 0.2.2 carries none of it.
- A **Discovery** section in `llms.txt` covering the same ground for an agent reading the file: both
  documents, both hosts for each, and that the served copy is authoritative because packaged copies
  can lag it.
- A Links entry in the README pointing at the two discovery documents.

## [0.2.2] - 2026-08-27

### Added

- The TORPC descriptor is now served, at
  [`https://mcp.ankr.com/.well-known/torpc.json`](https://mcp.ankr.com/.well-known/torpc.json) and
  at `https://rpc.ankr.com/.well-known/torpc.json`, and still ships in the package at
  `static/.well-known/torpc.json`. Previously it reached consumers only inside the tarball, which a
  client deciding whether to negotiate a tier cannot read. Both copies are public, carry no
  credential and are readable cross-origin; read the served copy as the deployment's own statement,
  since a packaged copy can lag it.
- An [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent card at
  `/.well-known/agent-card.json`, on both hosts and in the package, naming who answers and at which
  MCP endpoints — the keyless data plane and the OAuth-gated management plane. It states
  `x402Support: false`, and claims no on-chain registration and no trust mechanism, because there is
  none to claim.
- The descriptor's `negotiation` block states the batch rule: a response array carries one
  `Token-Tier` header, whose value is the minimum tier applied across its elements, and v1 defines
  no per-element signal, so a client reads each element's tier from its shape. The README and
  `llms.txt` say the same.
- The descriptor marks `eth_getUncleByBlockHashAndIndex` and `eth_getUncleByBlockNumberAndIndex` as
  carrying no payload post-merge.

### Changed

- The descriptor's tier-2 method list is the full set of ten that the specification applies. It
  listed eight, missing the uncle pair.
- The descriptor names the specification version `evm-v1` with `status: draft`, and its `spec` field
  now resolves to the normative text. It previously named `1.1`, a TORPC revision that has never
  existed.
- Measured token savings replace an unsourced "25–58% fewer tokens" in the README and `llms.txt`:
  48.4% fewer tokens at tier 2 and 35.3% at tier 1, over 21 methods and 25 Ethereum mainnet blocks,
  token-weighted and counted with `o200k_base` over the full HTTP body, with per-method figures and
  the date of the run linked to the published result.
- Tier 1 is credited correctly: tier 1 already renames the fields, converts hex to decimal and drops
  the service fields (`logsBloom`, `cumulativeGasUsed`, `contractAddress`, `type`, the header
  roots); tier 2 adds only the ABI decode on top.
- `_meta.tier` is named as the field to read before looking for decoded output. `tier_degraded` is
  set by some tools and not others, so it is not a reliable signal.
- The reference decoder is named as it is published,
  [`@w3tech.io/torpc-decoder`](https://www.npmjs.com/package/@w3tech.io/torpc-decoder), and the
  documentation links point at the canonical `agentic-rpc` paths.
- Depends on `@ankr.com/ankr.js` 0.7.0, which declares its own `axios` requirement. The resolved
  dependency tree is unchanged.

## [0.2.1] - 2026-08-14

### Changed

- Documentation-only release. The README and `llms.txt` name the published specification and
  reference implementation, [w3tech/torpc](https://github.com/w3tech/torpc) (CC0-1.0) and
  [w3tech/torpc-js](https://github.com/w3tech/torpc-js) (Apache-2.0), in place of three lines that
  promised a link "when it is published"; the documentation links point at their own paths rather
  than the docs root; and `llms.txt` gains this package's repository and npm page. Conformance is
  stated as not claimed, because the suite is a single-case scaffold. Per-version metadata on npm is
  immutable, so the wrong text shipped in 0.2.0 could only be corrected by publishing again.

## [0.2.0] - 2026-08-14

First npm release, under MIT.

### Added

- An MCP server giving agents token-efficient access to blockchain data over Ankr RPC, in two
  shapes: the hosted endpoint at `https://mcp.ankr.com/rpc`, which takes the caller's key in the
  `x-ankr-api-key` header and holds no credential of its own, or `npx -y @w3tech.io/agent-rpc-mcp`
  as a local stdio process with `ANKR_API_KEY`.
- 17 tools. Three raw-RPC reads at TORPC tier 2 (`getTransaction`, `getLogs`, `getBlock`); eleven
  indexed and mixed reads (`getBalances`, `getAccountBalance`, `getWalletActivity`, `getNFTs`,
  `getTokenHolders`, `getTokenPrice`, `getTokenPriceHistory`, `getInteractions`, `resolveContract`,
  `searchChain`, `expandResult`); and three for discovery and escape (`listChains`,
  `describeMethods`, `rpcCall`).
- `rpcCall` is a write denylist, not a read allowlist: it refuses transaction broadcast and signing,
  transaction building, node and dev-node administration, mutating verbs and the node-operation half
  of the `debug_*` namespace on every chain family, and forwards everything else. A forwarded read
  can still be refused by the endpoint's blockchain schema or by the tenant's own permissions, and
  that refusal is the authoritative answer.
- Every successful result carries `_meta.tier`, the TORPC tier actually applied, and
  `_meta.token_count`, a real `o200k_base` count of the emitted text rather than a `chars/4`
  estimate. An error result carries `_meta.error_code` and no tier. Tool inputs are strict: an
  unknown argument is rejected rather than silently dropped.
- `llms.txt` and `.well-known/torpc.json` ship in the package.
