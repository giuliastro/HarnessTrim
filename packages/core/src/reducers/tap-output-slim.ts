import type { Reducer, ReducerResult } from "./types.ts";

const MARKER = "[harnesstrim:tap-output-slim]";
const SIGNAL = /\b(fail(ed|ure)?|error|warn(ing)?|exception|traceback|assertionerror)\b/i;

/**
 * Conservative Node TAP reduction. Only flat successful subtests with the exact
 * known duration/type envelope are collapsible. Suites, skip/todo, diagnostics,
 * bailouts, unknown YAML and every failure remain verbatim. Linear scan, no LLM.
 */
export const tapOutputSlim: Reducer = {
  name: "tap-output-slim",
  reduce(input: string): ReducerResult {
    if (input.includes(MARKER) || !/^TAP version 13\r?$/m.test(input)) {
      return { output: input, changed: false };
    }
    const eol = input.includes("\r\n") ? "\r\n" : "\n";
    const lines = input.split(eol);
    const out: string[] = [];
    let omitted = 0;
    let pending: string[] = [];
    let count = 0;
    const flush = () => {
      if (count >= 2) {
        out.push(`${MARKER} omitted ${count} passing subtests (duration/type only)`);
        omitted += count;
      } else out.push(...pending);
      pending = []; count = 0;
    };
    let diagnosticTail = false;
    for (let i = 0; i < lines.length;) {
      // After a failure/bailout even success-looking assertion text is evidence.
      if (/^not ok\b|^Bail out!/i.test(lines[i])) diagnosticTail = true;
      const header = /^# Subtest: (.+)$/.exec(lines[i]);
      const success = /^ok \d+ - (.+)$/.exec(lines[i + 1] ?? "");
      let end = i + 2;
      let known = !diagnosticTail && !!header && !!success &&
        header[1] === success[1] && !SIGNAL.test(header[1]) && !/#\s*(?:SKIP|TODO)/i.test(success[1]);
      if (known && lines[end] === "  ---") {
        end++;
        const start = end;
        while (/^  (?:duration_ms: [0-9]+(?:\.[0-9]+)?|type: ['"]?test['"]?)$/.test(lines[end] ?? "")) end++;
        known = end > start && lines[end] === "  ...";
        if (known) end++;
      }
      // Never detach arbitrary diagnostics from their subtest identity.
      known = known && (end === lines.length || /^(?:# Subtest: |1\.\.|# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b)/.test(lines[end] ?? ""));
      if (known) { pending.push(...lines.slice(i, end)); count++; i = end; }
      else { flush(); out.push(lines[i]); i++; }
    }
    flush();
    const output = out.join(eol);
    return omitted > 0 && output.length < input.length
      ? { output, changed: true, note: `omitted ${omitted} passing subtests` }
      : { output: input, changed: false };
  },
};
