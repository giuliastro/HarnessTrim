import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runReduceTool, createServer } from "./server.ts";

const noisy =
  "PASS suite test case number NN ok\n".repeat(40) +
  "FAIL suite broken case\nExpected: 1\nReceived: 2\nTests: 1 failed, 40 passed, 41 total\n";

/** Narrow a tool result's first content block to text (tests only). */
function textOf(content: unknown): string {
  const first = (content as Array<{ type: string; text?: string }>)[0];
  assert.equal(first.type, "text");
  return first.text ?? "";
}

test("runReduceTool slims noisy output", () => {
  const text = textOf(runReduceTool(noisy).content);
  assert.ok(text.length < noisy.length);
  assert.match(text, /1 failed, 40 passed/);
});

test("runReduceTool passes through non-reducible text", () => {
  const plain = "just a short normal sentence";
  assert.equal(textOf(runReduceTool(plain).content), plain);
});

test("MCP end-to-end: client lists and calls the reduce tool", async () => {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const tools = await client.listTools();
  assert.ok(tools.tools.some((t) => t.name === "reduce"));

  const result = await client.callTool({ name: "reduce", arguments: { text: noisy } });
  const text = textOf(result.content);
  assert.ok(text.length < noisy.length);
  assert.match(text, /omitted \d+ passing\/noise line\(s\)/);

  await client.close();
  await server.close();
});
