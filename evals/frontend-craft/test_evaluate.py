"""Regression tests for comparison integrity, not generated design quality."""

import argparse
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location("evaluate", Path(__file__).with_name("evaluate.py"))
evaluate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluate)


class ComparisonIntegrity(unittest.TestCase):
    def test_candidate_is_the_repository_frontend_craft_skill(self):
        candidate = evaluate.REPO / evaluate.CANDIDATE_PATH
        self.assertTrue((candidate / "SKILL.md").is_file(), candidate)

    def test_catalog_resolves_aliases_and_catches_plugin_names(self):
        raw = json.dumps([{"content": [{"text": """### Skill roots
- `r0` = `/tmp/fixture/.agents/skills`
### Available skills
- candidate: Description. (file: r0/candidate/SKILL.md)
- unwanted:plugin: Description. (file: /external/plugin/SKILL.md)
"""}]}])
        self.assertEqual(evaluate.skill_catalog(raw), [
            {"name": "candidate", "path": "/tmp/fixture/.agents/skills/candidate/SKILL.md"},
            {"name": "unwanted:plugin", "path": "/external/plugin/SKILL.md"},
        ])

    def test_unrecognized_catalog_fails_closed(self):
        with self.assertRaises(ValueError):
            evaluate.skill_catalog(json.dumps([{"content": [{"text": "### Available skills\nunknown format"}]}]))

    def test_globally_disabled_skill_is_still_disabled_for_ignore_config_exec(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory) / "workspace"
            workspace.mkdir()
            output = Path(directory) / "output"
            commands = []

            def fake_capture(command, cwd, destination, timeout, prompt=None):
                commands.append(command)
                destination.mkdir(parents=True)
                # Debug sees no skills because home config already disabled them.
                (destination / "stdout.txt").write_text("[]")
                if "exec" in command:
                    Path(command[command.index("-o") + 1]).write_text("[]")
                return {"exit_code": 0}

            with patch.object(evaluate, "capture", fake_capture), patch.object(
                    evaluate, "host_skill_paths", return_value={"/host/cylinder/SKILL.md"}):
                disabled = evaluate.check_isolation(workspace, {"model": "test", "reasoning": "low"}, output)
            self.assertIn("/host/cylinder/SKILL.md", disabled)
            self.assertIn("/host/cylinder/SKILL.md", " ".join(commands[-1]))
            self.assertIn("--ignore-user-config", commands[-1])
            self.assertIn("--ignore-rules", commands[-1])

    def test_actual_exec_catalog_can_reject_a_debug_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)

            def fake_capture(command, cwd, destination, timeout, prompt=None):
                destination.mkdir(parents=True)
                (destination / "stdout.txt").write_text("[]")
                if "exec" in command:
                    Path(command[command.index("-o") + 1]).write_text('["/hidden/design/SKILL.md"]')
                return {"exit_code": 0}

            with patch.object(evaluate, "capture", fake_capture), patch.object(
                    evaluate, "host_skill_paths", return_value=set()):
                with self.assertRaisesRegex(RuntimeError, "Execution-path skill isolation mismatch"):
                    evaluate.check_isolation(workspace, {"model": "test", "reasoning": "low"}, workspace / "evidence")
            self.assertFalse(evaluate.read_json(workspace / "evidence/isolation.json")["passed"])

    def test_render_failures_propagate_and_preserve_evidence_after_cleanup(self):
        for failure in ("startup", "screenshot", "behavior-exit", "behavior-timeout", "behavior-missing-output"):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                workspace = root / "workspace"
                workspace.mkdir()
                artifact = root / "artifacts/trial-001"
                artifact.mkdir(parents=True)
                evaluate.write_json(artifact / "result.json", {"status": "completed"})
                trial = {"id": "trial-001", "case": "booking", "workspace": "workspace",
                         "serve": ["server", "{port}"], "path": "/", "viewports": [{"width": 390, "height": 844}]}
                args = argparse.Namespace(root=root, axe_script=None, port_start=18000, verify_behavior=True)
                playwright = MagicMock()
                browser = playwright.chromium.launch.return_value
                page = browser.new_page.return_value
                page.title.return_value = "Fixture"
                page.evaluate.return_value = {}
                if failure == "screenshot":
                    page.screenshot.side_effect = RuntimeError("Screenshot failed")
                context = MagicMock()
                context.__enter__.return_value = playwright
                module = types.SimpleNamespace(sync_playwright=lambda: context)
                server = MagicMock()
                server.poll.return_value = None
                response = MagicMock()
                response.status = 200
                response.read.side_effect = lambda: next(workspace.glob('frontend-craft-probe-*.txt')).read_bytes()
                response.__enter__.return_value = response
                behavior = {"exit_code": 2 if failure == "behavior-exit" else 0,
                            "timed_out": failure == "behavior-timeout"}
                with patch.dict("sys.modules", {"playwright.sync_api": module}), patch.object(
                        evaluate, "load_manifest", return_value=(root, {})), patch.object(
                        evaluate, "select_trials", return_value=[trial]), patch.object(
                        evaluate.socket, "socket") as socket_mock, patch.object(
                        evaluate.subprocess, "Popen", return_value=server) as popen, patch.object(
                        evaluate.urllib.request, "urlopen", return_value=response), patch.object(
                        evaluate.os, "killpg") as kill, patch.object(evaluate, "capture", return_value=behavior):
                    socket_mock.return_value.__enter__.return_value.connect_ex.return_value = 111
                    if failure == "startup":
                        popen.side_effect = OSError("Server executable missing")
                    with self.assertRaises((RuntimeError, OSError)):
                        evaluate.render(args)
                    self.assertTrue((root / "blind/booking/trial-001/render-error.json").exists())
                    self.assertEqual(list(workspace.glob('frontend-craft-probe-*.txt')), [])
                    browser.close.assert_called_once()
                    if failure != "startup":
                        kill.assert_called_once()
                        server.wait.assert_called_once()

    def test_matrix_uses_frozen_fixtures_and_keeps_private_rubric_out(self):
        with tempfile.TemporaryDirectory(prefix="frontend-craft-test-") as directory:
            base = Path(directory)
            repo, suite = base / "repo", base / "suite"
            suite.mkdir()
            sources = {}
            for name in ["candidate", "anthropic", "vercel", "impeccable"]:
                path = repo / evaluate.CANDIDATE_PATH if name == "candidate" else base / name
                path.mkdir(parents=True)
                (path / "SKILL.md").write_text(f"---\nname: {name}\ndescription: Test.\n---\nGuidance.")
                sources[name] = path
            cases = []
            for index in range(4):
                fixture = suite / f"fixtures/case-{index}"
                (fixture / "starter").mkdir(parents=True)
                (fixture / "starter/index.html").write_text(f"<h1>Case {index}</h1>")
                (fixture / "prompt.md").write_text(f"Improve case {index}.")
                cases.append({"id": f"case-{index}", "starter": f"fixtures/case-{index}/starter",
                              "prompt": f"fixtures/case-{index}/prompt.md", "setup": [],
                              "serve": ["python3", "-m", "http.server", "{port}"],
                              "viewports": [{"width": 390, "height": 844}],
                              "rubric": {"secret": "PRIVATE_SCORING_MARKER"}})
            (suite / "cases.json").write_text(json.dumps({"cases": cases}))
            args = argparse.Namespace(root=base / "pilot", anthropic=sources["anthropic"],
                vercel=sources["vercel"], impeccable=sources["impeccable"],
                model="fixture-model", reasoning="ultra", timeout=120, seed=4109)
            with patch.object(evaluate, "HERE", suite), patch.object(evaluate, "REPO", repo), patch.object(
                    evaluate, "local_port_available", side_effect=lambda port: port != 9010), contextlib.redirect_stdout(io.StringIO()):
                evaluate.prepare(args)
            root, manifest = evaluate.load_manifest(args.root)
            self.assertEqual(len(manifest["trials"]), 16)
            for case in cases:
                trials = [trial for trial in manifest["trials"] if trial["case"] == case["id"]]
                self.assertEqual({trial["variant"] for trial in trials}, set(evaluate.VARIANTS))
                self.assertTrue(all(trial["starter_sha256"] == trials[0]["starter_sha256"] for trial in trials))
            ports = set()
            for trial in manifest["trials"]:
                workspace = root / trial["workspace"]
                self.assertFalse((workspace / "cases.json").exists())
                prompt = (root / "artifacts" / trial["id"] / "prompt.md").read_text()
                self.assertNotIn("PRIVATE_SCORING_MARKER", prompt)
                ports.add(prompt.split("assigned server port is ")[1].split(";")[0])
                self.assertEqual(evaluate.trial_actor_port(root, trial), trial["actor_port"])
                self.assertNotEqual(trial["actor_port"], 9010)
            self.assertEqual(len(ports), 16)
            # Editing repository fixtures cannot change the frozen comparison.
            (suite / cases[0]["starter"] / "index.html").write_text("Changed after preparation")
            evaluate.load_manifest(root)
            (root / "sources/candidate/SKILL.md").write_text("Changed candidate")
            with self.assertRaisesRegex(ValueError, "Frozen source changed"):
                evaluate.load_manifest(root)

    def test_usage_is_observed_and_process_status_is_not_quality(self):
        with tempfile.TemporaryDirectory() as directory:
            trace = Path(directory) / "events.jsonl"
            trace.write_text('\n'.join(json.dumps(event) for event in [
                {"type": "turn.completed", "usage": {"input_tokens": 100, "output_tokens": 5}},
                {"type": "turn.completed", "usage": {"input_tokens": 50, "output_tokens": 2}},
                {"type": "error", "message": "network interruption"},
            ]))
            result = evaluate.event_summary(trace)
            self.assertEqual(result["usage"], {"input_tokens": 150, "output_tokens": 7})
            self.assertEqual(result["completed_turns"], 2)
            self.assertEqual(len(result["errors"]), 1)

    def test_interrupted_trace_is_never_truncated_or_rerun(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "artifacts/trial-001/agent"
            output.mkdir(parents=True)
            (output / "command.json").write_text('["original command"]')
            (output / "stdout.txt").write_text("original interrupted trace")
            trial = {"id": "trial-001", "workspace": "workspaces/trial-001"}
            result = evaluate.run_trial(root, {}, trial)
            self.assertEqual(result["status"], "blocked")
            self.assertEqual((output / "stdout.txt").read_text(), "original interrupted trace")
            self.assertFalse((output.parent / "result.json").exists())

    def test_active_trial_claim_prevents_second_runner(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "artifacts/trial-001"
            output.mkdir(parents=True)
            (output / "started.json").write_text('{"runner_pid": 123}')
            result = evaluate.run_trial(root, {}, {"id": "trial-001", "workspace": "workspaces/trial-001"})
            self.assertEqual(result["status"], "blocked")
            self.assertFalse((output / "result.json").exists())

    def test_actor_port_selection_skips_occupied_and_reserved_ports(self):
        with patch.object(evaluate, "local_port_available", side_effect=lambda port: port != 9001) as available:
            self.assertEqual(evaluate.choose_actor_port({9002, 9003}), 9004)
            self.assertEqual([call.args[0] for call in available.call_args_list], [9001, 9004])

    def test_legacy_actor_port_uses_frozen_prompt_before_numeric_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            trial = {"id": "trial-010"}
            self.assertEqual(evaluate.trial_actor_port(root, trial), 9010)
            output = root / "artifacts/trial-010"
            output.mkdir(parents=True)
            (output / "prompt.md").write_text("This run's assigned server port is 18425; use only this port.")
            self.assertEqual(evaluate.trial_actor_port(root, trial), 18425)
            with self.assertRaisesRegex(ValueError, "differs from its frozen prompt"):
                evaluate.trial_actor_port(root, {**trial, "actor_port": 18426})

    def test_occupied_actor_port_blocks_before_setup_or_model_spend(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "artifacts/trial-010"
            output.mkdir(parents=True)
            trial = {"id": "trial-010", "workspace": "workspaces/trial-010", "actor_port": 9010}
            with patch.object(evaluate, "local_port_available", return_value=False), patch.object(
                    evaluate, "check_isolation") as isolation, patch.object(evaluate, "capture") as capture:
                with contextlib.redirect_stdout(io.StringIO()):
                    result = evaluate.run_trial(root, {"settings": {}}, trial)
            self.assertEqual(result["status"], "blocked")
            self.assertIn("9010 is occupied", result["reason"])
            isolation.assert_not_called()
            capture.assert_not_called()
            self.assertFalse((output / "agent").exists())

    @unittest.skipUnless(shutil.which("node"), "Node is required to exercise the real JavaScript predicate.")
    def test_functional_activation_starts_broken_without_changing_original_or_markup(self):
        original_path = evaluate.HERE / "fixtures/harbor-vue-operations/starter/src/App.vue"
        original = original_path.read_text()

        def matching_results(source):
            start = source.index("`${job.id} ${job.customer} ${job.destination}`")
            expression = source[start:source.index("\n    )", start)]
            script = """const matches = new Function('job', 'query', 'return ' + process.argv[1]);
const job = {id: 'HB-100', customer: 'Acme', destination: 'Depot'};
console.log(JSON.stringify(['hb-100', 'HB-100'].map(value => matches(job, {value}))));"""
            result = subprocess.run(["node", "-e", script, expression], capture_output=True, text=True, check=True)
            return json.loads(result.stdout)

        self.assertEqual(matching_results(original), [True, True])
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            (workspace / "src").mkdir()
            copied = workspace / "src/App.vue"
            copied.write_text(original)
            evaluate.seed_activation_defect(workspace, "functional-vue-fix")
            seeded = copied.read_text()
            self.assertEqual(matching_results(seeded), [True, False])
            self.assertEqual(original.split("<template>", 1)[1], seeded.split("<template>", 1)[1])
            self.assertEqual(original_path.read_text(), original)


if __name__ == "__main__":
    unittest.main()
