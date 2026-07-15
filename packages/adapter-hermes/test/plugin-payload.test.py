"""Regression tests for the shipped Hermes plugin's result-schema handling."""

import importlib.util
import json
import os
from pathlib import Path
import unittest

PLUGIN_PATH = Path(__file__).parents[1] / "plugin" / "__init__.py"
spec = importlib.util.spec_from_file_location("harnesstrim_plugin_test", PLUGIN_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load plugin at {PLUGIN_PATH}")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)


class PluginPayloadTests(unittest.TestCase):
    def setUp(self):
        self.previous_env = {
            key: os.environ.get(key)
            for key in ("HARNESSTRIM_MODE", "HARNESSTRIM_MINLENGTH", "HARNESSTRIM_TELEMETRY")
        }
        os.environ.update({
            "HARNESSTRIM_MODE": "active",
            "HARNESSTRIM_MINLENGTH": "150",
            "HARNESSTRIM_TELEMETRY": "false",
        })
        self.original_reducer = plugin._call_reducer
        self.original_metric = plugin._write_metric
        plugin._call_reducer = lambda text, _min: (f"[trimmed]{text[:8]}", "fixture")
        plugin._write_metric = lambda *_args: None

    def tearDown(self):
        plugin._call_reducer = self.original_reducer
        plugin._write_metric = self.original_metric
        for key, value in self.previous_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def transform(self, tool, payload):
        result = plugin.on_tool_result(tool, {}, json.dumps(payload))
        self.assertIsNotNone(result)
        return json.loads(result)

    def test_reduces_output(self):
        result = self.transform("terminal", {"output": "x" * 200})
        self.assertTrue(result["output"].startswith("[trimmed]"))

    def test_reduces_content(self):
        result = self.transform("read_file", {"content": "x" * 200})
        self.assertTrue(result["content"].startswith("[trimmed]"))

    def test_reduces_snapshot_and_analysis(self):
        snapshot = self.transform("browser_snapshot", {"snapshot": "x" * 200})
        analysis = self.transform("vision_analyze", {"analysis": "x" * 200})
        self.assertTrue(snapshot["snapshot"].startswith("[trimmed]"))
        self.assertTrue(analysis["analysis"].startswith("[trimmed]"))

    def test_reduces_each_web_extract_result(self):
        result = self.transform(
            "web_extract",
            {"results": [{"content": "x" * 200}, {"content": "y" * 200}]},
        )
        self.assertTrue(result["results"][0]["content"].startswith("[trimmed]"))
        self.assertTrue(result["results"][1]["content"].startswith("[trimmed]"))


if __name__ == "__main__":
    unittest.main()
