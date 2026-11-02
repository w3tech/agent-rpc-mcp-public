# Sui quickstart

Zero to a useful Sui answer. Every request and every response on this page was
executed against Sui mainnet through this server and pasted back verbatim.

Sui is not an EVM chain. It has no `eth_` namespace, no accounts holding token
balances in a contract's storage, and no transaction hash you can grep for. It
has Move objects with owners, checkpoints instead of blocks, and events emitted
by Move modules. This server answers Sui over Sui's own gRPC API and shapes the
answers to be small enough to put in a model's context.

---

## 1. Get a key

A free Ankr API key at [ankr.com/rpc](https://www.ankr.com/rpc/). The same key
serves the EVM chains and Sui. Nothing on this page needs a wallet, a seed
phrase or a signer: every tool here reads.

## 2. Pick an access path

Two ways in, and both carry the Sui tools. `tools/list` is the authority on
what a session can call.

| Path                                      | Auth                              | Sui tools                                        |
| ----------------------------------------- | --------------------------------- | ------------------------------------------------ |
| Hosted, `https://mcp.ankr.com/rpc`        | your Ankr key, in a header        | <!-- verify:surface target=hosted sui=yes -->yes |
| `npx @w3tech.io/agent-rpc-mcp` over stdio | your Ankr key, in the environment | <!-- verify:surface target=npm sui=yes -->yes    |

A separate hosted surface at `https://mcp.ankr.com/mcp` covers Ankr account
management and authenticates with OAuth rather than an API key. It serves no
chain data, and an RPC key is refused there.

### Hosted

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

The wire form, if you would rather see it than configure it. A Streamable HTTP
MCP session is an `initialize`, then the notification, then calls; the server
answers `initialize` as `text/event-stream`, so both encodings are read here:

<!-- verify:shell -->

```sh
URL=https://mcp.ankr.com/rpc
HDR="content-type: application/json"
ACC="accept: application/json, text/event-stream"
SID=$(curl -sD - -o /dev/null -X POST "$URL" -H "$HDR" -H "$ACC" \
  -H "x-ankr-api-key: $ANKR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' \
  | tr -d '\r' | awk -F': ' '/^mcp-session-id/{print $2}')
curl -s -X POST "$URL" -H "$HDR" -H "$ACC" -H "x-ankr-api-key: $ANKR_API_KEY" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' > /dev/null
curl -s -X POST "$URL" -H "$HDR" -H "$ACC" -H "x-ankr-api-key: $ANKR_API_KEY" \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | sed -n 's/^data: //p' | awk 'NR==1 { print substr($0, 1, 120) }'
curl -s -X DELETE "$URL" -H "x-ankr-api-key: $ANKR_API_KEY" -H "mcp-session-id: $SID" > /dev/null
```

### stdio, with nothing installed

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

Either JSON block goes in your client's MCP config: Claude Desktop
(`claude_desktop_config.json`), Cursor, Windsurf, or any other MCP client. The
stdio server needs Node.js 24 or newer.

## 3. See what you got

`tools/list` returns 25 tools: 17 that work across EVM chains and the Advanced
API, and 8 that are Sui-only. Six of the chain-generic ones take `chain: "sui"`
and route themselves. The whole listing costs about 9050 o200k tokens, and it is
carried by every session.

**The eight Sui-only tools**

| Tool                     | What it answers                                                         |
| ------------------------ | ----------------------------------------------------------------------- |
| `suiGetObjects`          | Move objects by id, batched, with their decoded fields                  |
| `suiListOwnedObjects`    | every object an address owns, paged, filterable by Move type            |
| `suiListDynamicFields`   | tables, bags and dynamic object fields under one object's UID           |
| `suiGetPackage`          | the modules a published Move package declares                           |
| `suiGetFunction`         | one Move function's signature                                           |
| `suiResolveName`         | a SuiNS name to its address, or an address to its name                  |
| `suiSimulateTransaction` | what a transaction would do, run against current state, never submitted |
| `suiWatchEvents`         | Move events from the executed tip on, polled from a resumable cursor    |

**The chain-generic tools that take `chain: "sui"`**

`getBalances`, `getBlock`, `getTransaction`, `getWalletActivity` and `getLogs`
answer from Sui's gRPC API. `expandResult` continues any cursor they issue.
`rpcCall` bridges a fixed set of `sui_`/`suix_` method names onto the same API
and refuses the rest. `resolveContract` and `searchChain` are built out of
`eth_` calls and refuse on Sui, naming the tool that answers instead.

## 4. One call per family

Each block below is a `tools/call` params object: the tool name and its
arguments, exactly as an MCP client sends them. The response under it is the
real one, from Sui mainnet. Values that move with the chain, such as versions,
digests and checkpoint numbers, will differ on yours.

### A name

<!-- verify:call pin=name,status,record.name -->

```json
{ "name": "suiResolveName", "arguments": { "name": "example.sui" } }
```

<!-- verify:response -->

```json
{
  "served_by": "full",
  "name": "example.sui",
  "status": "resolved",
  "record": {
    "id": "0xb14395960677cf28319f973a9e04c7622b0c112296af7c9c262d9cb4ffbb90cc",
    "name": "example.sui",
    "registrationNftId": "0xaf7cdae904dbe0ad18b093aacb73b8ac9a78c4e9f2decf0156c8c315df060eed",
    "expirationTimestamp": "2030-08-14T15:45:38.221Z",
    "targetAddress": "0x214a4199264348df2364acd683a3971a9927a5252747f4e0776f0506922f9db0"
  }
}
```

Read `status` before the record. `resolved` is the only value that makes
`targetAddress` a destination: `expired` returns the lapsed record and must not
be trusted, `no_target_address` means the name is registered and points nowhere,
and `not_registered` means there is no record at all. All four are answers, not
errors. Reverse lookup takes `address` instead of `name` and is not the inverse:
an address answers with its own default name, which need not point back.

### An object

<!-- verify:call pin=chain,view,result.items.0.objectId,result.items.0.objectType,result.items.0.owner.kind -->

```json
{
  "name": "suiGetObjects",
  "arguments": {
    "ids": [
      "0x0000000000000000000000000000000000000000000000000000000000000006"
    ]
  }
}
```

<!-- verify:response -->

```json
{
  "chain": "sui",
  "view": "ledger.objects",
  "requested": 1,
  "served_by": "full",
  "result": {
    "items": [
      {
        "objectId": "0x0000000000000000000000000000000000000000000000000000000000000006",
        "version": "932941849",
        "digest": "H3z52EPZZm5UcXbjiE1ScxS5wpJgRBeeYH3RbRsEgSJC",
        "objectType": "0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock",
        "owner": { "kind": "SHARED", "version": "1" },
        "previousTransaction": "DW7h8X9H7HgbGsHgy2TvnAieirMYSaD39eHVkWSQ9uxu",
        "storageRebate": "0",
        "hasPublicTransfer": false,
        "json": { "timestamp_ms": "1787846699098" }
      }
    ]
  },
  "recoverable": { "owner.kind": "ledger.object(objectId) at tier 0" },
  "lowest_available_checkpoint": "310089745"
}
```

`0x6` is Sui's Clock, so `version`, `digest`, `previousTransaction` and
`timestamp_ms` move every checkpoint. Up to 50 ids go in one call; an id the
node cannot serve comes back under `failed` with the index it was asked at,
never dropped silently. `lowest_available_checkpoint` is the full node's pruning
boundary: anything older is not served from this host.

### Objects an address owns

<!-- verify:call pin=chain,view,args.owner,args.object_type -->

```json
{
  "name": "suiListOwnedObjects",
  "arguments": {
    "owner": "0x214a4199264348df2364acd683a3971a9927a5252747f4e0776f0506922f9db0",
    "type": "0x2::coin::Coin<0x2::sui::SUI>",
    "pageSize": 5
  }
}
```

<!-- verify:response -->

```json
{
  "chain": "sui",
  "view": "state.ownedObjects",
  "args": {
    "owner": "0x214a4199264348df2364acd683a3971a9927a5252747f4e0776f0506922f9db0",
    "object_type": "0x2::coin::Coin<0x2::sui::SUI>"
  },
  "served_by": "full",
  "result": {
    "items": [
      {
        "objectId": "0xc8a5e423d37126a911eccd94433edc55c8278657460a3aa5e7f10f19656d259e",
        "version": "947399574",
        "digest": "9ahgFz3z9qWpX2YFSHmoVKvhPFeTDo6F2H79rWXuYa4m",
        "objectType": "0x0000000000000000000000000000000000000000000000000000000000000002::coin::Coin<0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI>",
        "owner": "0x214a4199264348df2364acd683a3971a9927a5252747f4e0776f0506922f9db0",
        "balance": "850018725545"
      }
    ]
  },
  "recoverable": { "owner.kind": "ledger.object(objectId) at tier 0" },
  "lowest_available_checkpoint": "310089782"
}
```

`type` is a filter, not a requirement. A bare `0x2::coin::Coin` matches every
instantiation; the fully applied form above matches only SUI coins. Drop it and
every owned object comes back. Balances are raw base units: SUI has 9 decimals,
so `850018725545` is 850.018725545 SUI. Ask `getBalances` with `chain: "sui"`
for the per-coin-type totals with `decimals` and `symbol` already attached.

When the address holds more than the page, an opaque `cursor` comes back and
`expandResult` returns the next page in the same shape.

### Dynamic fields

<!-- verify:call pin=chain,view,args.parent -->

```json
{
  "name": "suiListDynamicFields",
  "arguments": {
    "parent": "0x0000000000000000000000000000000000000000000000000000000000000005",
    "pageSize": 3
  }
}
```

<!-- verify:response -->

```json
{
  "chain": "sui",
  "view": "state.dynamicFields",
  "args": {
    "parent": "0x0000000000000000000000000000000000000000000000000000000000000005"
  },
  "served_by": "full",
  "result": {
    "items": {
      "0x5b890eaf2abcfa2ab90b77b8e6f3d5d8609586c3e583baf3dccd5af17edf48d1": {
        "kind": "FIELD",
        "parent": "0x0000000000000000000000000000000000000000000000000000000000000005",
        "name": "u64",
        "valueType": "0x0000000000000000000000000000000000000000000000000000000000000003::sui_system_state_inner::SuiSystemStateInnerV2"
      }
    }
  },
  "recoverable": { "name.value": "state.dynamicFields(parent) at tier 0" },
  "lowest_available_checkpoint": "310089782"
}
```

`0x5` is the Sui system state, and its one dynamic field is where the validator
set actually lives. A row names the field's own object id, its kind, the name it
is keyed by and the Move type of its value; the value itself is a BCS blob and
is left out. Hand the row's object id to `suiGetObjects` and it comes back
decoded.

### A Move package, then a function in it

<!-- verify:call pin=ids,moduleCount -->

```json
{ "name": "suiGetPackage", "arguments": { "package": "0x2", "maxModules": 5 } }
```

<!-- verify:response -->

```json
{
  "served_by": "full",
  "storageId": "$1",
  "originalId": "$1",
  "version": "60",
  "packages": {
    "@1": "0x0000000000000000000000000000000000000000000000000000000000000001"
  },
  "ids": {
    "$1": "0x0000000000000000000000000000000000000000000000000000000000000002"
  },
  "moduleCount": 68,
  "modules": [
    { "name": "accumulator", "functionCount": 18, "datatypeCount": 3 },
    { "name": "accumulator_metadata", "functionCount": 2, "datatypeCount": 5 },
    {
      "name": "accumulator_settlement",
      "functionCount": 8,
      "datatypeCount": 1
    },
    { "name": "address", "functionCount": 10, "datatypeCount": 0 },
    { "name": "address_alias", "functionCount": 5, "datatypeCount": 3 }
  ],
  "truncated": true,
  "note": "Listing 5 of 68 modules. There is no cursor for this method; raise maxModules, or name a module."
}
```

By default this is an index, one row per module, so an agent can pick what to
read next without pulling a package it cannot afford: the `0x2` framework in
full is around 484 KB. There is no upstream paging here, so a truncated index
carries no cursor. The way past the cap is `maxModules`, then `module` for one
module in full, then `suiGetFunction` for a single signature. Repeated addresses
arrive as `$n` and `@n` handles, resolved by the `ids` and `packages` tables
beside them.

<!-- verify:call pin=package,module,signature -->

```json
{
  "name": "suiGetFunction",
  "arguments": { "package": "0x2", "module": "coin", "function": "value" }
}
```

<!-- verify:response -->

```json
{
  "served_by": "full",
  "package": "0x2",
  "module": "coin",
  "signature": {
    "name": "value",
    "visibility": "PUBLIC",
    "isEntry": false,
    "parameters": [
      {
        "reference": "IMMUTABLE",
        "body": {
          "type": "DATATYPE",
          "typeName": "0x0000000000000000000000000000000000000000000000000000000000000002::coin::Coin",
          "typeParameterInstantiation": [
            { "type": "TYPE_PARAMETER", "typeParameter": 0 }
          ]
        }
      }
    ],
    "returns": [{ "body": { "type": "U64" } }]
  }
}
```

This is what a programmable transaction block needs in order to call the
function. Nothing here truncates and nothing here pages: a signature is small.

### The tip of the chain

<!-- verify:call pin=chain,served_by -->

```json
{ "name": "getBlock", "arguments": { "chain": "sui", "block": "latest" } }
```

<!-- verify:response -->

```json
{
  "chain": "sui",
  "served_by": "full",
  "block": {
    "sequenceNumber": "315617046",
    "digest": "6HA5Bd1GwioB7MAXSRqkgPEHJuoLVjwVM9FmNTHVma11",
    "summary": {
      "epoch": "1232",
      "timestamp": "2026-08-27T16:05:00.425Z",
      "totalNetworkTransactions": "5782104790",
      "epochRollingGasCostSummary": {
        "computationCost": "1973310129252",
        "storageCost": "140975616722800",
        "storageRebate": "139230275935212",
        "nonRefundableStorageFee": "1406366423588"
      }
    }
  }
}
```

A Sui block is a checkpoint, and `sequenceNumber` is what every other tool here
means by a block number. Sui executes roughly four checkpoints a second, so this
number moves while you read it.

## 5. The cursor loop

`suiWatchEvents` does not push. The first call establishes a start position,
returns no events and hands back a cursor; each `expandResult` on that cursor
returns what has been emitted since, plus the next cursor. Nothing falls into
the gap between two polls, which is the whole difference from `getLogs`.

<!-- verify:call pin=chain,count -->

```json
{
  "name": "suiWatchEvents",
  "arguments": {
    "eventType": "0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809::order::OrderCanceled",
    "maxLogs": 3
  }
}
```

<!-- verify:response -->

```json
{
  "chain": "sui",
  "logs": [],
  "count": 0,
  "watching_from_checkpoint": "315617051",
  "cursor": "eyJ0Ijoic3VpV2F0Y2gi...",
  "note": "Start position only: this call establishes where the watch begins and returns no events, because the executed tip is a position and nothing precedes it that you asked for. Continue with expandResult and `cursor`."
}
```

Then poll it. The `cursor` value is opaque and belongs to that one watch, so
substitute the one you were handed:

<!-- verify:call cursor=previous retry=6 pin=chain -->

```json
{
  "name": "expandResult",
  "arguments": { "cursor": "<the cursor from the response above>" }
}
```

<!-- verify:response -->

```json
{
  "chain": "sui",
  "logs": [
    {
      "contract": "0xe735f8c93a95722efd73521aca7a7652c0bb71ed1daf41b26dfd7d1ff71f748::pool",
      "event": "0x2c8d603bc51326b8c13cef9dd07031a408a48dddb541963357661df5d3204809::order::OrderCanceled",
      "args": {
        "balance_manager_id": "0x1e622305acf17733ed02981df0eb697908199b2a4360f7fd258c9d2a9a78f786",
        "base_asset_quantity_canceled": "2220000000000",
        "client_order_id": "6941459170871652417",
        "is_bid": false,
        "order_id": "170141183460469273458222398446897976488",
        "original_quantity": "2220000000000",
        "pool_id": "0xfa732993af2b60d04d7049511f801e79426b2b6a5103e22769c0cead982b0f47",
        "price": "2262",
        "timestamp": "1787846701749",
        "trader": "0x246a7c59dffe45e63f0a81ac7b7893398d756f85cdd0b4e64cf63d2ea6cbb5fe"
      },
      "sender": "0x246a7c59dffe45e63f0a81ac7b7893398d756f85cdd0b4e64cf63d2ea6cbb5fe",
      "checkpoint": "315617052",
      "digest": "AQifUE5EPZE88GJ1dT5cwVeMSWWAubboRtbKJNCzKE7h",
      "index": 0
    }
  ],
  "count": 1,
  "cursor": "eyJ0Ijoic3VpV2F0Y2gi..."
}
```

The event type above is DeepBook's order book, which is the busiest thing on
Sui and therefore the easiest one to see the loop working on. Filter instead by
`address` for a package or `package::module`, or by `sender` for one account.
`more_available: true` in a poll means the display cap was already full and the
next poll should go out at once rather than after an interval.

`getLogs` with `chain: "sui"` answers the other half of the question: a
checkpoint range you name, rather than a position you resume from. It needs a
concrete `fromBlock`, because on Sui that is a checkpoint sequence number and an
absent one would mean genesis rather than the head. Read the tip with
`getBlock {"chain": "sui", "block": "latest"}` and count back from it.

## 6. What Sui refuses here, and why that stays true

These three refusals are properties of the server rather than accidents of
routing, and their text below is exact.

An EVM-shaped tool on Sui:

<!-- verify:call error pin=text -->

```json
{
  "name": "resolveContract",
  "arguments": {
    "chain": "sui",
    "address": "0x1234567890123456789012345678901234567890"
  }
}
```

<!-- verify:response -->

```text
Error [RPC_ERROR]: sui has no eth_ JSON-RPC namespace, so this tool has nothing to call there. A Move object is read with suiGetObjects, a published package with suiGetPackage, and a coin's decimals and symbol come back from getBalances.
```

A write, on any chain:

<!-- verify:call error pin=text -->

```json
{
  "name": "rpcCall",
  "arguments": {
    "chain": "sui",
    "method": "sui_executeTransactionBlock",
    "params": []
  }
}
```

<!-- verify:response -->

```text
rpcCall refused "sui_executeTransactionBlock" locally, on every chain: it matches a write path (broadcast, signing, transaction construction, node administration, or node/wallet state mutation) and rpcCall is a read/data tool. On dot-namespaced chains such as Filecoin/Lotus that also means the whole Push family and the wallet, msig, paych, market, miner, worker, log, net, sync and admin families. Reads are not filtered here: an unrecognised read is forwarded, and the chain's schema decides whether it is served. Use a routed tool, or sign and send transactions with your own wallet/signer.
```

`suiSimulateTransaction` is the read-only counterpart: it takes the base64 BCS
`TransactionData` a wallet or SDK produces, runs it against current state and
reports the abort, the gas, the object changes, the balance changes and the
events it would emit. No signature is accepted and nothing is broadcast. It is
not executed on this page because it needs a transaction only your own SDK can
build:

<!-- verify:unrun -->

```json
{
  "name": "suiSimulateTransaction",
  "arguments": { "transactionBytes": "<base64 BCS TransactionData>" }
}
```

A Sui JSON-RPC method that is not bridged:

<!-- verify:call error pin=text -->

```json
{
  "name": "rpcCall",
  "arguments": {
    "chain": "sui",
    "method": "sui_getTotalTransactionBlocks",
    "params": []
  }
}
```

<!-- verify:response -->

```text
Error [RPC_ERROR]: rpcCall does not bridge "sui_getTotalTransactionBlocks" onto Sui's gRPC API, so it is refused here rather than sent to Sui JSON-RPC. Sui's JSON-RPC is being retired on a calendar: disabled on the Foundation's own mainnet nodes in the week of 27 July 2026, snapshots stopping at the end of August 2026, the archival fallback disconnected at the end of September 2026, and the code removed from full-node software in mid-October 2026. It still answers on this endpoint today; a call routed through it now stops working then. Bridged today: sui_getcheckpoint, sui_getlatestcheckpointsequencenumber, sui_getnormalizedmovefunction, sui_getnormalizedmovemodulesbypackage, sui_getobject, sui_gettransactionblock, sui_multigetobjects, sui_trygetpastobject, suix_getallbalances, suix_getcoinmetadata, suix_getdynamicfields, suix_getownedobjects, suix_resolvenameserviceaddress — describeMethods reports the same per method. No tool on this server answers "sui_getTotalTransactionBlocks" either — there is no route to it here.
```

The bridge exists so that an agent carrying Sui JSON-RPC method names in its
training data lands somewhere honest. `describeMethods` with `chain: "sui"`
reports, per method, whether it is bridged.

## 7. A whole answer, end to end

[`examples/sui-agent/`](../examples/sui-agent/) is a demo agent that answers one
question through this server and prints what it cost. It starts the server with
`npx`, so the example directory is all it needs:

<!-- verify:example -->

```sh
cd examples/sui-agent
npm install
export ANKR_API_KEY=<YOUR_KEY>
npm start
```

It resolves a SuiNS name, lists what that address owns, opens a watch on the
events that address sends and polls the cursor. It opens no socket of its own:
every upstream call is the MCP server's, and it has been run with the network
taken away from the example process to show it.

## 8. Reading the answers

Two `_meta` fields decide how to read any response, and an agent that skips them
misreads output that is technically correct.

`_meta.tier` is the shaping actually applied, and on Sui `_meta.tier_source` is
`local`: there is no proxy on this path and no ABI decode, so a Sui response
never carries `args` from a decoder. Tier 0 is the view's `read_mask`
projection, tier 1 is lossless, tier 2 additionally drops BCS blobs, collapses
owners and groups collections.

`_meta.token_count` is a real o200k_base count of the text the tool emitted, not
a `chars/4` estimate. It is exact up to 256 KB of emitted text.

Amounts are raw base units with no decimals applied, everywhere. Sui object
versions and checkpoint numbers are u64 and travel as decimal strings for the
same reason.

## Further reading

- Sui's own documentation: [docs.sui.io](https://docs.sui.io/)
- The `sui.rpc.v2` gRPC API this server calls: [MystenLabs/sui](https://github.com/MystenLabs/sui)
- Ankr Agent RPC documentation: [ankr.com/docs](https://www.ankr.com/docs/agentic-rpc/agent-rpc-mcp/)
