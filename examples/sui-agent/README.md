# sui-agent

A demo agent that answers one question about Sui end to end, through the MCP
server, and prints what the answer cost.

**The question:** is `example.sui` moving on chain right now, and what is it
holding?

```sh
npm install
export ANKR_API_KEY=<YOUR_KEY>
npm start
```

Run it from this directory with Node.js 24 or newer. It starts the MCP server
with `npx -y @w3tech.io/agent-rpc-mcp`, so nothing else needs to be installed or
built. A free key comes from [ankr.com/rpc](https://www.ankr.com/rpc/). Nothing
here needs a wallet or a signer.

## What it does

Three tools, in the order an agent would reach for them.

1. `suiResolveName` turns the SuiNS name into an address, and refuses to go on
   unless `status` is `resolved`. The other three statuses are answers about the
   registry, not addresses to spend against.
2. `suiListOwnedObjects`, filtered to `0x2::coin::Coin`, lists the coin objects
   that address owns, grouped by coin type.
3. `suiWatchEvents` opens a watch on the events that address sends and hands
   back a cursor; `expandResult` polls it. The first call establishes a position
   and returns nothing, which is why the run polls afterwards rather than
   reading the first reply for events.

A quiet window is an answer. The run reports the checkpoints it watched, so
"no events" comes with the size of the window it is true of rather than as a
bare zero.

## What it prints

```
THE ANSWER
  example.sui is 0x214a4199264348df2364acd683a3971a9927a5252747f4e0776f0506922f9db0.
  It holds at least 50 coin object(s) across 42 coin type(s), on the first page alone:
    4 x 0x067c294412b5a9586fcb43035ee4be8e738a5dfb1ff3f8b07ba200a3b01d6cac::dune::DUNE
    ...
  It sent no Move events over checkpoints 340782220 to 340782246, so it is idle right now.

WHAT IT COST
  MCP tool calls: 6
  Tool output:    9379 tokens (o200k_base, summed from _meta.token_count)
  Direct gRPC or HTTP calls made by this agent: 0
```

The counts are real. `MCP tool calls` is incremented per `tools/call`, and the
token figure is the sum of `_meta.token_count`, which is the server's own
o200k_base count of the text each tool emitted rather than a `chars/4` estimate.
The numbers above came from one run at the defaults in the table below: three
tools, then one `expandResult` per poll, so six calls at `SUI_AGENT_POLLS=3`.
The call count is fixed at a given poll count. The token total will differ on
yours, because the address is live and the listing is the first page of a
wallet that keeps changing.

## The last line is a tested claim

This agent opens no socket. It speaks MCP over a child process's stdin and
stdout, and every upstream call belongs to the server, which is also the only
place the API key is used. It has been run with `net`, `tls`, `dgram` and
`fetch` intercepted in its own process, and it completes.

## Knobs

| Variable                | Default                              | What it does                                       |
| ----------------------- | ------------------------------------ | -------------------------------------------------- |
| `ANKR_API_KEY`          | required                             | the key the server uses; `ANKR_RPC_KEY` also works |
| `SUI_AGENT_NAME`        | `example.sui`                        | the SuiNS name to ask about                        |
| `SUI_AGENT_POLLS`       | `3`                                  | how many times the watch cursor is polled          |
| `SUI_AGENT_POLL_MS`     | `2000`                               | milliseconds between polls                         |
| `AGENT_RPC_MCP_COMMAND` | `npx`                                | the command that starts the server                 |
| `AGENT_RPC_MCP_ARGS`    | `["-y", "@w3tech.io/agent-rpc-mcp"]` | its arguments, as a JSON array                     |

The last two point the same example at another build of the server, for
example `AGENT_RPC_MCP_COMMAND=node` with `AGENT_RPC_MCP_ARGS='["/path/to/dist/index.js"]'`.

## Where to go next

- [The Sui quickstart](../../docs/sui-quickstart.md), which every tool call in
  this example comes from
