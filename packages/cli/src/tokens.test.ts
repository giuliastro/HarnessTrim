import { test } from "node:test";
import assert from "node:assert/strict";
import { getEncoding } from "js-tiktoken";
import { countTokens } from "./tokens.ts";

test("lean vocabulary matches cl100k counts for text, source code and Unicode", () => {
  const reference = getEncoding("cl100k_base");
  for (const text of ["", "hello world", "const total = 1 + 2;\n", "caff\u00e8 \u4e16\u754c \ud83d\ude80", "a\r\nb\n"]) {
    assert.equal(countTokens(text), reference.encode(text).length);
  }
});
