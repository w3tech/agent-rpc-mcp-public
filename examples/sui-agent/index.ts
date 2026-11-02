// A demo agent that answers ONE question about Sui, end to end, and prints what
// the answer cost: is `example.sui` moving on chain right now, and what is it
// holding?
//
// It opens no socket of its own. The only thing it starts is the MCP server, as
// a child process speaking MCP over stdin and stdout, so every upstream call and
// every use of the API key belongs to the server.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
/** The SuiNS name this run is about. Override to point it at another one. */
const NAME = process.env.SUI_AGENT_NAME ?? "example.sui";

/** How many times the watch cursor is polled, and how long between polls. */
const POLLS = Number(process.env.SUI_AGENT_POLLS ?? "3");
const POLL_INTERVAL_MS = Number(process.env.SUI_AGENT_POLL_MS ?? "2000");

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

// ---------------------------------------------------------------------------
// Reading the server's answers without pretending to know their whole shape.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

const isJson = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** `a.b.c` out of a decoded body, or undefined at the first missing hop. */
const at = (body: Json, path: string): unknown => {
  let node: unknown = body;
  for (const key of path.split(".")) {
    if (!isJson(node)) return undefined;
    node = node[key];
  }
  return node;
};

// ---------------------------------------------------------------------------
// The session, and the meter on it.
// ---------------------------------------------------------------------------

interface ToolReply {
  readonly body: Json;
  readonly tokens: number;
}

class Session {
  calls = 0;
  tokens = 0;

  constructor(private readonly client: Client) {}

  /**
   * One `tools/call`, metered.
   *
   * `_meta.token_count` is the server's own o200k_base count of the text it
   * emitted, so the total printed at the end is measured rather than estimated.
   * A tool error is thrown rather than returned: this agent has one path
   * through the question and no fallback that would still be an answer.
   */
  async call(name: string, args: Json): Promise<ToolReply> {
    const reply = (await this.client.callTool({
      name,
      arguments: args,
    })) as {
      isError?: boolean;
      content?: { type?: string; text?: string }[];
      _meta?: { token_count?: number };
    };
    this.calls += 1;
    this.tokens += reply._meta?.token_count ?? 0;
    const text = (reply.content ?? []).map((c) => c.text ?? "").join("");
    if (reply.isError) throw new Error(`${name} failed: ${text}`);
    const parsed: unknown = JSON.parse(text);
    if (!isJson(parsed)) throw new Error(`${name} returned no JSON object`);
    return { body: parsed, tokens: reply._meta?.token_count ?? 0 };
  }
}

// ---------------------------------------------------------------------------
// Step 1 — the name.
// ---------------------------------------------------------------------------

async function resolveName(session: Session): Promise<string> {
  const { body } = await session.call("suiResolveName", { name: NAME });
  const status = str(body.status);
  const address = str(at(body, "record.targetAddress"));
  out(`  ${NAME} -> ${status ?? "no status"}`);
  if (status !== "resolved" || !address) {
    // Every other status is a real answer about the registry, and none of them
    // yields an address this run may treat as a destination.
    throw new Error(
      `${NAME} is "${status ?? "unknown"}", so there is no address to look at. ` +
        `Set SUI_AGENT_NAME to a name whose status is "resolved".`
    );
  }
  out(`  address ${address}`);
  return address;
}

// ---------------------------------------------------------------------------
// Step 2 — what it owns.
// ---------------------------------------------------------------------------

interface Holding {
  readonly coinType: string;
  readonly objects: number;
}

/** The tier-2 shape: a type maps either to rows, or to {common, items}. */
const rowsOf = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (isJson(value) && Array.isArray(value.items)) return value.items;
  return [];
};

/**
 * The type parameter of `Coin<...>`, with the framework address collapsed.
 *
 * ONLY the framework address is shortened. A Sui address is a number and its
 * leading zeros are insignificant, so a general "strip zeros" pass is lossless
 * on chain and unreadable on a page: it turns 0x067c... into 0x67c..., which a
 * reader compares against an explorer and concludes does not match.
 */
const FRAMEWORK = `0x${"0".repeat(63)}2`;

const shortType = (coinType: string): string =>
  (/<(.*)>$/.exec(coinType)?.[1] ?? coinType).replaceAll(FRAMEWORK, "0x2");

async function listHoldings(
  session: Session,
  owner: string
): Promise<{ holdings: Holding[]; truncated: boolean }> {
  const { body } = await session.call("suiListOwnedObjects", {
    owner,
    type: "0x2::coin::Coin",
    pageSize: 50,
  });
  const items = at(body, "result.items");
  const holdings: Holding[] = isJson(items)
    ? Object.entries(items).map(([coinType, value]) => ({
        coinType,
        objects: rowsOf(value).length,
      }))
    : [];
  holdings.sort(
    (a, b) => b.objects - a.objects || a.coinType.localeCompare(b.coinType)
  );
  return { holdings, truncated: typeof body.cursor === "string" };
}

// ---------------------------------------------------------------------------
// Step 3 — is it moving?
// ---------------------------------------------------------------------------

interface Watch {
  readonly events: number;
  readonly fromCheckpoint: string;
  readonly throughCheckpoint: string | undefined;
  readonly samples: string[];
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

async function watchSender(session: Session, sender: string): Promise<Watch> {
  const start = await session.call("suiWatchEvents", { sender, maxLogs: 50 });
  const fromCheckpoint = str(start.body.watching_from_checkpoint) ?? "unknown";
  let cursor = str(start.body.cursor);
  let events = 0;
  let throughCheckpoint: string | undefined;
  const samples: string[] = [];

  for (let poll = 0; poll < POLLS && cursor; poll += 1) {
    await sleep(POLL_INTERVAL_MS);
    const { body } = await session.call("expandResult", { cursor });
    const logs = Array.isArray(body.logs) ? body.logs : [];
    events += logs.length;
    throughCheckpoint =
      str(body.scanned_through_checkpoint) ?? throughCheckpoint;
    for (const log of logs.slice(0, 3)) {
      if (isJson(log)) samples.push(str(log.event) ?? "an event");
    }
    cursor = str(body.cursor);
  }
  return { events, fromCheckpoint, throughCheckpoint, samples };
}

// ---------------------------------------------------------------------------
// The report.
// ---------------------------------------------------------------------------

function report(
  session: Session,
  address: string,
  holdings: Holding[],
  truncated: boolean,
  watch: Watch
): void {
  out("");
  out("THE ANSWER");
  out(`  ${NAME} is ${address}.`);
  if (holdings.length === 0) {
    out("  It holds no coin objects.");
  } else {
    const total = holdings.reduce((n, h) => n + h.objects, 0);
    const counted = truncated
      ? `at least ${String(total)} coin object(s) across ${String(holdings.length)} coin type(s), on the first page alone`
      : `${String(total)} coin object(s) across ${String(holdings.length)} coin type(s)`;
    out(`  It holds ${counted}:`);
    for (const h of holdings.slice(0, 5)) {
      out(`    ${String(h.objects)} x ${shortType(h.coinType)}`);
    }
    if (holdings.length > 5)
      out(`    and ${String(holdings.length - 5)} more type(s)`);
  }
  const span =
    watch.throughCheckpoint === undefined
      ? `from checkpoint ${watch.fromCheckpoint}`
      : `checkpoints ${watch.fromCheckpoint} to ${watch.throughCheckpoint}`;
  if (watch.events === 0) {
    out(`  It sent no Move events over ${span}, so it is idle right now.`);
  } else {
    out(`  It emitted ${String(watch.events)} Move event(s) over ${span}:`);
    for (const s of [...new Set(watch.samples)]) out(`    ${s}`);
  }
  out("");
  out("WHAT IT COST");
  out(`  MCP tool calls: ${String(session.calls)}`);
  out(
    `  Tool output:    ${String(session.tokens)} tokens (o200k_base, summed from _meta.token_count)`
  );
  out("  Direct gRPC or HTTP calls made by this agent: 0");
}

// ---------------------------------------------------------------------------
// Wiring.
// ---------------------------------------------------------------------------

/** The published server, unless AGENT_RPC_MCP_COMMAND names another one. */
function serverCommand(): { command: string; args: string[] } {
  const command = process.env.AGENT_RPC_MCP_COMMAND;
  const args = process.env.AGENT_RPC_MCP_ARGS;
  if (command)
    return { command, args: args ? (JSON.parse(args) as string[]) : [] };
  return { command: "npx", args: ["-y", "@w3tech.io/agent-rpc-mcp"] };
}

async function main(): Promise<void> {
  const apiKey = process.env.ANKR_API_KEY ?? process.env.ANKR_RPC_KEY;
  if (!apiKey) {
    throw new Error(
      "ANKR_API_KEY is not set. Get a free key at https://www.ankr.com/rpc/ ."
    );
  }
  const { command, args } = serverCommand();
  const transport = new StdioClientTransport({
    command,
    args,
    env: { ...process.env, ANKR_API_KEY: apiKey },
    stderr: "inherit",
  });
  const client = new Client({ name: "sui-agent-example", version: "1" });
  await client.connect(transport);
  const session = new Session(client);
  try {
    out(
      `QUESTION: is ${NAME} moving on chain right now, and what is it holding?`
    );
    out("");
    out("STEP 1  resolve the name");
    const address = await resolveName(session);
    out("STEP 2  list the coin objects that address owns");
    const { holdings, truncated } = await listHoldings(session, address);
    out(`  ${String(holdings.length)} coin type(s)`);
    out(
      `STEP 3  watch the events it sends, ${String(POLLS)} poll(s) ${String(POLL_INTERVAL_MS)}ms apart`
    );
    const watch = await watchSender(session, address);
    out(`  ${String(watch.events)} event(s)`);
    report(session, address, holdings, truncated, watch);
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
