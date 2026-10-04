#!/usr/bin/env python3
"""Prepare, isolate, and run the frontend-craft comparative pilot (standard library)."""

import argparse
import concurrent.futures
import errno
import hashlib
import json
import os
from pathlib import Path
import random
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import urllib.request
import uuid


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
CANDIDATE_PATH = "plugins/frontend/skills/frontend-craft"
VARIANTS = ("native", "anthropic-vercel", "impeccable", "candidate")
PINS = {
    "anthropic": "34040c9c568585f6929bedeaad110ad08f079624",
    "vercel": "e3d624baaf29dc1fc645aff3e38f03e564d2d6b1",
    "impeccable": "0a4e72a254f3b175c95b36b82e5f2e60fa63f116",
}
COMMON_CONTEXT = """

Local tooling: Python 3 and Python Playwright are available for operating Chromium,
capturing screenshots, and examining rendered pages. Use the installed browser;
do not install a different browser or framework. The fixture README describes its
setup and development commands. Store any screenshots or other review artifacts
under evidence/ in this workspace. Work autonomously within the supplied brief.
"""
DISABLE_FEATURES = (
    "plugins", "apps", "hooks", "memories", "multi_agent", "image_generation",
)


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def temporary_root(path):
    path = path.resolve()
    if Path(tempfile.gettempdir()).resolve() not in path.parents:
        raise ValueError("Use a dedicated child directory of the system temporary directory.")
    return path


def local_port_available(port):
    """Probe bindability without connecting to or stopping an existing service."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError as error:
            if error.errno == errno.EADDRINUSE:
                return False
            raise RuntimeError(f"Cannot check local port {port}: {error}") from error
    return True


def choose_actor_port(reserved):
    for port in range(9001, 65536):
        if port not in reserved and local_port_available(port):
            return port
    raise RuntimeError("No unused actor port is available.")


def trial_actor_port(root, trial):
    """Read old frozen prompts without rewriting them; prefer explicit new metadata."""
    prompt = root / "artifacts" / trial["id"] / "prompt.md"
    match = re.search(r"assigned server port is (\d+)", prompt.read_text()) if prompt.exists() else None
    if "actor_port" in trial:
        port = trial["actor_port"]
        if port is None:
            return None
        if match and int(match[1]) != port:
            raise ValueError(f"Trial {trial['id']} actor_port differs from its frozen prompt.")
    elif match:
        port = int(match[1])
    else:
        base = 9200 if trial["id"].startswith("activation-") else 9000
        port = base + int(trial["id"].rsplit("-", 1)[1])
    if not isinstance(port, int) or not 1 <= port <= 65535:
        raise ValueError(f"Invalid actor port for {trial['id']}: {port}")
    return port


def check_actor_port(root, trial):
    port = trial_actor_port(root, trial)
    if port is not None and not local_port_available(port):
        raise RuntimeError(f"Trial {trial['id']} actor port {port} is occupied; preserve the trial and choose a new comparison. Do not stop the occupying service.")
    return port


def digest_tree(path):
    """Hash file paths and contents; ignore generated dependencies and Git internals."""
    result = {}
    for file in sorted(path.rglob("*")):
        if any(p in {".git", "node_modules", "__pycache__", "dist"} for p in file.relative_to(path).parts):
            continue
        if file.is_file():
            result[str(file.relative_to(path))] = hashlib.sha256(file.read_bytes()).hexdigest()
    return result


def skill_name(path):
    text = (path / "SKILL.md").read_text()
    match = re.search(r"^name:\s*['\"]?([^\n'\"]+)", text, re.M)
    if not match:
        raise ValueError(f"Missing skill name: {path}")
    name = match[1].strip()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
        raise ValueError(f"Invalid skill name: {name}")
    return name


def skill_catalog(raw):
    """Resolve Codex's actual prompt catalog, including its aliased file paths."""
    messages = json.loads(raw)
    text = "\n".join(
        item.get("text", "") for msg in messages for item in msg.get("content", [])
    )
    roots = dict(re.findall(r"^- `(r\d+)` = `([^`]+)`$", text, re.M))
    entries = []
    for name, source in re.findall(r"^- ([^\n]+?):[ \t][^\n]*\(file: ([^\n)]+)\)$", text, re.M):
        alias, _, suffix = source.partition("/")
        path = Path(roots[alias]) / suffix if alias in roots else Path(source)
        if not path.is_absolute():
            raise ValueError(f"Unresolved skill catalog path: {source}")
        entries.append({"name": name, "path": str(path)})
    if "### Available skills" in text and not entries:
        raise ValueError("Skill catalog format changed; refusing an unverified isolation claim.")
    return entries


def config_args(settings, disabled=()):
    values = {
        "model": settings["model"],
        "model_reasoning_effort": settings["reasoning"],
        "approval_policy": "never",
        # Exclude file-discovered project documents; host-injected context can remain.
        "project_doc_max_bytes": 0,
        "developer_instructions": "",
        "sandbox_workspace_write.network_access": True,
    }
    args = []
    for key, value in values.items():
        args += ["-c", key + "=" + json.dumps(value)]
    overrides = ",".join(
        "{path=" + json.dumps(path) + ",enabled=false}" for path in sorted(set(disabled))
    )
    args += ["-c", "skills.config=[" + overrides + "]"]
    for feature in DISABLE_FEATURES:
        args += ["--disable", feature]
    return args


def capture(cmd, cwd, output, timeout=60, prompt=None):
    """Retain exact output and kill the whole child process group on timeout."""
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "command.json", cmd)
    started = time.monotonic()
    timed_out = False
    with (output / "stdout.txt").open("w") as stdout, (output / "stderr.txt").open("w") as stderr:
        process = subprocess.Popen(
            cmd, cwd=cwd, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr,
            text=True, start_new_session=True,
        )
        try:
            process.communicate(input=prompt or "", timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
    result = {"exit_code": process.returncode, "timed_out": timed_out,
              "wall_seconds": round(time.monotonic() - started, 3)}
    write_json(output / "process.json", result)
    return result


def host_skill_paths():
    result = set()
    runtime_root = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    for skill_root in (runtime_root / "skills", Path.home() / ".agents/skills", Path("/etc/codex/skills")):
        if skill_root.is_dir():
            for child in skill_root.iterdir():
                if child.is_dir():
                    result.update(str(path) for path in child.rglob("SKILL.md"))
    return result


def check_isolation(workspace, settings, output):
    """Disable host skills and compare debug and actual-exec reported catalogs."""
    write_json(output / "isolation.json", {"passed": False, "status": "checking"})
    expected = {str(path) for path in (workspace / ".agents/skills").glob("*/SKILL.md")}
    base = ["codex", *config_args(settings), "debug", "prompt-input", "Inspect available skills."]
    first = capture(base, workspace, output / "discovery", 45)
    if first["exit_code"]:
        raise RuntimeError(f"Codex prompt inspection failed; see {output / 'discovery/stderr.txt'}")
    found = skill_catalog((output / "discovery/stdout.txt").read_text())
    disabled = {entry["path"] for entry in found if entry["path"] not in expected}
    # debug honors home config, whereas exec --ignore-user-config does not. Include
    # globally disabled files too: otherwise a skill absent from debug can return
    # during exec. Explicit root iteration also follows symlinked skill folders.
    disabled.update(host_skill_paths() - expected)
    disabled = sorted(disabled)
    verified = capture(
        ["codex", *config_args(settings, disabled), "debug", "prompt-input", "Inspect available skills."],
        workspace, output / "verified", 45,
    )
    if verified["exit_code"]:
        raise RuntimeError(f"Codex isolated prompt inspection failed; see {output / 'verified/stderr.txt'}")
    actual = skill_catalog((output / "verified/stdout.txt").read_text())
    if {entry["path"] for entry in actual} != expected:
        raise RuntimeError(f"Skill isolation mismatch: expected {sorted(expected)}, got {actual}")
    # Debug and exec load user configuration differently. Probe the real execution
    # path too; the expected answer is deliberately absent from the model prompt.
    final = output / "exec-catalog/final.json"
    process = capture(exec_command(settings, workspace, disabled, final), workspace,
                      output / "exec-catalog", 120,
                      "Return only a JSON array of the absolute SKILL.md paths listed in "
                      "your Available skills context. Expand skill-root aliases. Include every "
                      "listed skill, or [] if none are listed. Use only the provided context; "
                      "do not run tools, inspect the filesystem, or modify files.")
    if process["exit_code"] or process.get("timed_out") or not final.is_file():
        raise RuntimeError("Execution-path skill catalog probe failed; inspect exec-catalog evidence.")
    executed = read_json(final)
    if not isinstance(executed, list) or any(not isinstance(p, str) for p in executed):
        raise ValueError("Execution-path skill catalog probe did not return an array of paths.")
    if set(executed) != expected or len(executed) != len(expected):
        raise RuntimeError(f"Execution-path skill isolation mismatch: expected {sorted(expected)}, got {executed}")
    record = {"passed": True, "disabled": disabled, "visible": actual,
              "exec_reported_paths": executed, "exec_probe": process,
              "scope": "Debug catalog plus model-reported catalog under actual exec flags; not filesystem confinement."}
    write_json(output / "isolation.json", record)
    return disabled


def initialize_repo(workspace):
    for args in (["init", "-q"], ["add", "."],
                 ["-c", "user.name=Frontend fixture", "-c", "user.email=fixture@example.invalid",
                  "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
                  "commit", "-qm", "Fixed starting fixture"]):
        subprocess.run(["git", *args], cwd=workspace, check=True, capture_output=True)


def prepare_trial(root, manifest, case, variant, stage, index):
    trial_id = f"trial-{index:03d}"
    reserved = {trial_actor_port(root, trial) for trial in manifest["trials"]}
    port = choose_actor_port(reserved)
    workspace = root / "workspaces" / trial_id
    # The private manifest, rubrics, other variants and traces are never copied.
    fixture = root / "fixture-snapshots" / case["id"]
    shutil.copytree(fixture / "starter", workspace,
                    ignore=shutil.ignore_patterns("node_modules", "dist", "__pycache__", ".git"))
    skills = workspace / ".agents/skills"
    skills.mkdir(parents=True)
    for source in manifest["variants"][variant]:
        shutil.copytree(root / source, skills / skill_name(root / source))
    ignore = workspace / ".gitignore"
    with ignore.open("a") as out:
        out.write("\nnode_modules/\ndist/\nevidence/\n__pycache__/\n")
    initialize_repo(workspace)
    serve = [arg.replace("{port}", str(port)) for arg in case["serve"]]
    prompt = ((fixture / "prompt.md").read_text() + COMMON_CONTEXT
              + f"\nThis run's assigned server port is {port}; use only this port to avoid other sessions.\n"
              + "Start the development server with this argv: " + json.dumps(serve) + "\n")
    artifact_dir = root / "artifacts" / trial_id
    artifact_dir.mkdir(parents=True)
    (artifact_dir / "prompt.md").write_text(prompt)
    trial = {"id": trial_id, "case": case["id"], "variant": variant, "stage": stage,
             "actor_port": port,
             "workspace": str(workspace.relative_to(root)),
             "starter_sha256": digest_tree(fixture / "starter"),
             "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
             "setup": case.get("setup", []), "serve": case["serve"],
             "validate": case.get("validate", []), "path": case.get("path", "/"),
             "viewports": case["viewports"]}
    manifest["trials"].append(trial)


def prepare(args):
    root = temporary_root(args.root)
    if root.exists():
        raise ValueError("The trial root already exists; use a new root to preserve evidence.")
    cases = read_json(HERE / "cases.json")["cases"]
    sources = {"candidate": REPO / CANDIDATE_PATH, "anthropic": args.anthropic,
               "vercel": args.vercel, "impeccable": args.impeccable}
    for name, source in sources.items():
        if source is None or not (source / "SKILL.md").is_file():
            raise ValueError(f"Provide a complete {name} skill directory with SKILL.md.")
    root.mkdir(parents=True)
    for case in cases:
        fixture = root / "fixture-snapshots" / case["id"]
        fixture.mkdir(parents=True)
        shutil.copytree(HERE / case["starter"], fixture / "starter",
                        ignore=shutil.ignore_patterns("node_modules", "dist", "__pycache__", ".git"))
        shutil.copy2(HERE / case["prompt"], fixture / "prompt.md")
    manifest = {"schema_version": 1, "settings": {
        "model": args.model, "reasoning": args.reasoning,
        "timeout_seconds": args.timeout, "seed": args.seed,
        "tool_policy": "Python Playwright; plugins/apps/hooks/memories/multi-agent/image generation disabled",
        "sandbox": "workspace-write", "network_access": True,
    }, "cases": cases, "fixtures_sha256": digest_tree(root / "fixture-snapshots"),
        "sources": {}, "variants": {"native": [], "candidate": ["sources/candidate"],
        "anthropic-vercel": ["sources/anthropic", "sources/vercel"],
        "impeccable": ["sources/impeccable"]}, "trials": []}
    for name, source in sources.items():
        shutil.copytree(source, root / "sources" / name)
        manifest["sources"][name] = {"sha256": digest_tree(root / "sources" / name),
                                      "expected_upstream_revision": PINS.get(name)}
    matrix = [(case, variant) for case in cases for variant in VARIANTS]
    random.Random(args.seed).shuffle(matrix)
    for index, (case, variant) in enumerate(matrix, 1):
        prepare_trial(root, manifest, case, variant, "initial", index)
    write_json(root / "manifest.json", manifest)
    print(json.dumps({"root": str(root), "trials": len(matrix), "next": "preflight --probe"}))


def load_manifest(root):
    root = temporary_root(root)
    manifest = read_json(root / "manifest.json")
    if digest_tree(root / "fixture-snapshots") != manifest["fixtures_sha256"]:
        raise ValueError("Frozen fixtures changed; start a new comparison.")
    for name, source in manifest["sources"].items():
        if digest_tree(root / "sources" / name) != source["sha256"]:
            raise ValueError(f"Frozen source changed: {name}. Start a new comparison.")
    return root, manifest


def exec_command(settings, workspace, disabled, final):
    return ["codex", *config_args(settings, disabled), "exec", "--ignore-user-config",
            "--ignore-rules", "--ephemeral", "--sandbox", "workspace-write", "--json",
            "-C", str(workspace), "-o", str(final), "-"]


def preflight(args):
    root, manifest = load_manifest(args.root)
    settings = manifest["settings"]
    version = subprocess.run(["codex", "--version"], capture_output=True, text=True, check=True).stdout.strip()
    report = {"codex_version": version, "variants": {}, "model_probe": "not run", "actor_ports": {}}
    for trial in manifest["trials"]:
        if not (root / "artifacts" / trial["id"] / "result.json").exists():
            report["actor_ports"][trial["id"]] = check_actor_port(root, trial)
    for variant in VARIANTS:
        trial = next(t for t in manifest["trials"] if t["variant"] == variant)
        disabled = check_isolation(root / trial["workspace"], settings, root / "preflight" / variant)
        report["variants"][variant] = {"isolated": True, "external_skills_disabled": len(disabled)}
    # Direct browser check is useful, but does not replace the in-Codex sandbox probe.
    browser_script = "from playwright.sync_api import sync_playwright\nwith sync_playwright() as p:\n b=p.chromium.launch(headless=True)\n page=b.new_page()\n page.set_content('<h1>Browser probe</h1>')\n assert page.locator('h1').inner_text()=='Browser probe'\n b.close()\nprint('BROWSER_OK')\n"
    browser = capture(["python3", "-c", browser_script], root, root / "preflight/browser", 30)
    report["browser"] = browser
    if browser["exit_code"]:
        write_json(root / "preflight.json", report)
        raise RuntimeError("Browser preflight failed; do not compare rendered design without working browser tooling.")
    if args.probe:
        workspace = root / "probe-workspace"
        workspace.mkdir(exist_ok=True)
        if not (workspace / ".git").exists():
            subprocess.run(["git", "init", "-q", str(workspace)], check=True, capture_output=True)
        disabled = check_isolation(workspace, settings, root / "preflight/model-isolation")
        prompt = "Run exactly this Python script using the shell, then respond PROBE_OK only if it passed:\n```python\n" + browser_script + "```\n"
        process = capture(exec_command(settings, workspace, disabled, root / "preflight/model/final.md"),
                          workspace, root / "preflight/model", args.probe_timeout, prompt)
        final = root / "preflight/model/final.md"
        okay = process["exit_code"] == 0 and final.exists() and final.read_text().strip() == "PROBE_OK"
        report["model_probe"] = {**process, "passed": okay}
        write_json(root / "preflight.json", report)
        if not okay:
            raise RuntimeError("Authenticated model/browser sandbox probe failed; inspect retained raw trace.")
    else:
        write_json(root / "preflight.json", report)
    print(json.dumps(report))


def event_summary(path):
    usage = {}
    completed = 0
    errors = []
    for line in path.read_text().splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "turn.completed":
            completed += 1
            for key, value in event.get("usage", {}).items():
                if isinstance(value, (int, float)):
                    usage[key] = usage.get(key, 0) + value
        if event.get("type") in {"error", "turn.failed"}:
            errors.append(event)
    return {"completed_turns": completed, "usage": usage, "errors": errors}


def run_trial(root, manifest, trial):
    workspace = root / trial["workspace"]
    output = root / "artifacts" / trial["id"]
    if (output / "result.json").exists():
        return read_json(output / "result.json")
    if (output / "agent/command.json").exists():
        return {"id": trial["id"], "status": "blocked",
                "reason": "Interrupted or active trial already has an agent trace; preserve it and start a new comparison."}
    try:
        with (output / "started.json").open("x") as claim:
            json.dump({"started_at_unix": time.time(), "runner_pid": os.getpid()}, claim)
    except FileExistsError:
        return {"id": trial["id"], "status": "blocked",
                "reason": "Trial already claimed; refusing concurrent execution or overwriting an interrupted attempt."}
    settings = manifest["settings"]
    try:
        check_actor_port(root, trial)
        status_before = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"],
                                       cwd=workspace, capture_output=True, text=True, check=True)
        if status_before.stdout:
            raise RuntimeError("Prepared workspace changed before its first run; start a new comparison.")
        disabled = check_isolation(workspace, settings, output / "isolation")
        for index, command in enumerate(trial["setup"]):
            setup = capture(command, workspace, output / f"setup-{index}", 180)
            if setup["exit_code"]:
                raise RuntimeError("Fixture setup failed; inspect setup trace.")
        prompt = (output / "prompt.md").read_text()
        check_actor_port(root, trial)
        process = capture(exec_command(settings, workspace, disabled, output / "final.md"),
                          workspace, output / "agent", settings["timeout_seconds"], prompt)
        events = event_summary(output / "agent/stdout.txt")
        status = "completed" if process["exit_code"] == 0 and events["completed_turns"] else "failed"
        if process["timed_out"]:
            status = "timed_out"
        validations = []
        for index, command in enumerate(trial["validate"]):
            validations.append(capture(command, workspace, output / f"validation-{index}", 120))
        diff = subprocess.run(["git", "diff", "--binary", "HEAD"], cwd=workspace, capture_output=True, text=True)
        (output / "changes.patch").write_text(diff.stdout)
        untracked = subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=workspace, capture_output=True, text=True)
        (output / "untracked.txt").write_text(untracked.stdout)
        result = {"id": trial["id"], "status": status, **process, **events,
                  "validations": validations, "final_files_sha256": digest_tree(workspace),
                  "quality_assessment": "unrated; process completion is not design acceptance"}
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        result = {"id": trial["id"], "status": "blocked", "reason": str(error)}
    write_json(output / "result.json", result)
    print(json.dumps({"id": trial["id"], "status": result["status"]}), flush=True)
    return result


def run(args):
    root, manifest = load_manifest(args.root)
    if args.dry_run:
        selected = select_trials(manifest, args)
        print(json.dumps({"settings": manifest["settings"], "trials": selected}, indent=2))
        return
    preflight_record = read_json(root / "preflight.json")
    if not isinstance(preflight_record.get("model_probe"), dict) or not preflight_record["model_probe"].get("passed"):
        raise ValueError("Run preflight --probe successfully before execution.")
    current = subprocess.run(["codex", "--version"], capture_output=True, text=True, check=True).stdout.strip()
    if current != preflight_record["codex_version"]:
        raise ValueError("Codex version changed after preflight; restart with consistent tooling.")
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(run_trial, root, manifest, trial) for trial in select_trials(manifest, args)]
        results = [future.result() for future in futures]
    if any(result["status"] in {"blocked", "failed", "timed_out"} for result in results):
        raise RuntimeError("Some trials did not complete; retained failures must remain visible in the comparison.")


def select_trials(manifest, args):
    selected = [trial for trial in manifest["trials"] if trial["stage"] == args.stage
                and (not args.variant or trial["variant"] == args.variant)
                and (not args.case or trial["case"] == args.case)]
    if not selected:
        raise ValueError("No trials match the selected stage, variant and case.")
    return selected


def finalists(args):
    root, manifest = load_manifest(args.root)
    if any(trial["stage"] == "repeat" for trial in manifest["trials"]):
        raise ValueError("Finalist repetitions are already fixed for this comparison.")
    if len(set(args.variants)) != 2:
        raise ValueError("Choose two distinct finalists.")
    if not args.rationale.is_file() or not args.rationale.read_text().strip():
        raise ValueError("Supply a written selection rationale from initial blind review.")
    for trial in manifest["trials"]:
        if not (root / "artifacts" / trial["id"] / "result.json").exists():
            raise ValueError("Finish or record every initial trial before selecting finalists.")
    cases = manifest["cases"]
    matrix = [(case, variant) for case in cases for variant in args.variants]
    random.Random(manifest["settings"]["seed"] + 1).shuffle(matrix)
    for case, variant in matrix:
        prepare_trial(root, manifest, case, variant, "repeat", len(manifest["trials"]) + 1)
    (root / "finalist-rationale.md").write_text(args.rationale.read_text())
    manifest["finalists"] = args.variants
    write_json(root / "manifest.json", manifest)
    print(json.dumps({"repeat_trials": 8, "finalists": args.variants}))


def render(args):
    """Export identity-free renders for a reviewer; behavior assessment stays separate."""
    from playwright.sync_api import sync_playwright

    root, manifest = load_manifest(args.root)
    if args.axe_script and not args.axe_script.is_file():
        raise ValueError(f"Axe script does not exist: {args.axe_script}")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for trial in select_trials(manifest, args):
                result_path = root / "artifacts" / trial["id"] / "result.json"
                if not result_path.exists():
                    raise ValueError(f"Trial {trial['id']} has no terminal result; do not render active or queued work.")
                if read_json(result_path)["status"] not in {"completed", "failed", "timed_out"}:
                    raise ValueError(f"Trial {trial['id']} never reached agent execution; inspect its blocker first.")
                output = root / "blind" / trial["case"] / trial["id"]
                if output.exists():
                    raise ValueError(f"Render output already exists; preserve it: {output}")
                port = args.port_start + int(trial["id"].rsplit("-", 1)[1])
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                    probe.settimeout(1)
                    if probe.connect_ex(("127.0.0.1", port)) == 0:
                        raise RuntimeError(f"Render port {port} already has a listener; choose another --port-start.")
                output.mkdir(parents=True)
                command = [arg.replace("{port}", str(port)) for arg in trial["serve"]]
                log_path = root / "artifacts" / trial["id"] / "render-server.txt"
                marker_name = f"frontend-craft-probe-{uuid.uuid4().hex}.txt"
                marker = root / trial["workspace"] / marker_name
                marker_payload = uuid.uuid4().hex
                marker.write_text(marker_payload)
                with log_path.open("w") as log:
                    server = None
                    try:
                        server = subprocess.Popen(command, cwd=root / trial["workspace"],
                                                  stdout=log, stderr=log, start_new_session=True)
                        url = f"http://127.0.0.1:{port}" + trial["path"]
                        ready = False
                        for _ in range(60):
                            if server.poll() is not None:
                                break
                            try:
                                with urllib.request.urlopen(f"http://127.0.0.1:{port}/{marker_name}", timeout=1) as response:
                                    ready = response.status == 200 and response.read().decode() == marker_payload
                                ready = ready and server.poll() is None
                                if ready:
                                    break
                            except OSError:
                                time.sleep(0.2)
                        if not ready:
                            raise RuntimeError("Development server did not become ready.")
                        observations = []
                        for viewport in trial["viewports"]:
                            page = browser.new_page(viewport=viewport, reduced_motion="reduce")
                            errors = []
                            page.on("pageerror", lambda error: errors.append(str(error)))
                            page.goto(url, wait_until="networkidle", timeout=30000)
                            page.screenshot(path=str(output / f"{viewport['width']}.png"), full_page=True)
                            page.evaluate("window.scrollTo(0, 0)")
                            page.screenshot(path=str(output / f"{viewport['width']}-viewport.png"), full_page=False)
                            observations.append({"viewport": viewport, "title": page.title(),
                                "images": {"full_page": f"{viewport['width']}.png",
                                           "viewport": f"{viewport['width']}-viewport.png"},
                                "page_errors": errors, "metrics": page.evaluate("""() => ({
                                  viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
                                  h1Count: document.querySelectorAll('h1').length,
                                  mainCount: document.querySelectorAll('main').length,
                                  brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length
                                })""")})
                            page.close()
                        write_json(output / "observations.json", observations)
                        if args.verify_behavior:
                            verification = root / "artifacts" / trial["id"] / "behavior.json"
                            verification_command = ["python3", str(HERE / "verify_browser.py"), "--url", url,
                                                    "--case", trial["case"], "--output", str(verification)]
                            if args.axe_script:
                                verification_command += ["--axe-script", str(args.axe_script.resolve())]
                            behavior = capture(verification_command, root,
                                               root / "artifacts" / trial["id"] / "behavior-probe", 120)
                            if behavior["exit_code"] or behavior.get("timed_out") or not verification.is_file():
                                raise RuntimeError("Behavior verification did not complete; inspect behavior-probe evidence.")
                    except Exception as error:
                        write_json(output / "render-error.json", {"error": str(error)})
                        raise
                    finally:
                        marker.unlink(missing_ok=True)
                        if server is not None and server.poll() is None:
                            os.killpg(server.pid, signal.SIGTERM)
                            try:
                                server.wait(timeout=5)
                            except subprocess.TimeoutExpired:
                                os.killpg(server.pid, signal.SIGKILL)
                                server.wait()
        finally:
            browser.close()
    print(root / "blind")


def seed_activation_defect(workspace, activation_case):
    """Create a real narrow repair task in an activation copy, before its Git baseline."""
    if activation_case == "copy-typo":
        page = workspace / "index.html"
        page.write_text(page.read_text().replace("</form>", "<p>The reciever will receive an email confirmation.</p>\n</form>"))
    elif activation_case == "build-failure":
        app = workspace / "src/App.vue"
        app.write_text(app.read_text().replace('<script setup lang="ts">',
            '<script setup lang="ts">\nimport { unusedValue } from "./missing-helper";'))
    elif activation_case == "functional-vue-fix":
        app = workspace / "src/App.vue"
        original = app.read_text()
        working = ".includes(query.value.trim().toLowerCase())"
        if original.count(working) != 1:
            raise ValueError("Search fixture changed; cannot seed a verified case-sensitivity defect.")
        app.write_text(original.replace(working, ".includes(query.value.trim())", 1))


def activation(args):
    root, manifest = load_manifest(args.root)
    preflight_record = read_json(root / "preflight.json")
    if not isinstance(preflight_record.get("model_probe"), dict) or not preflight_record["model_probe"].get("passed"):
        raise ValueError("Run preflight --probe before activation calls.")
    mapping = {
        "new-public-page": "field-notes-landing", "product-redesign": "harbor-vue-operations",
        "form-experience": "accessible-booking-form", "visual-critique": "river-guide-article",
        "backend-index": None, "functional-vue-fix": "harbor-vue-operations",
        "copy-typo": "accessible-booking-form", "build-failure": "harbor-vue-operations",
    }
    activation_root = root / "activation-workspaces"
    if activation_root.exists():
        raise ValueError("Activation trials already exist; preserve the recorded run.")
    requests = read_json(HERE / "cases.json")["activation"]
    trials = []
    reserved_ports = {trial_actor_port(root, trial) for trial in manifest["trials"]}
    for index, item in enumerate(requests, 1):
        trial_id = f"activation-{index:03d}"
        workspace = activation_root / trial_id
        case_id = mapping[item["id"]]
        actor_port = choose_actor_port(reserved_ports) if case_id else None
        reserved_ports.add(actor_port)
        if case_id:
            shutil.copytree(root / "fixture-snapshots" / case_id / "starter", workspace)
            case = next(case for case in manifest["cases"] if case["id"] == case_id)
            setup = case.get("setup", [])
        else:
            workspace.mkdir(parents=True)
            (workspace / "README.md").write_text(
                "PostgreSQL delivery lookup. A live PostgreSQL server is unavailable in this fixture; "
                "make the migration reviewable and report which verification is unavailable.\n")
            (workspace / "schema.sql").write_text(
                "CREATE TABLE deliveries (id bigint PRIMARY KEY, tracking_code text NOT NULL, status text NOT NULL);\n")
            (workspace / "lookup.sql").write_text(
                "SELECT id, status FROM deliveries WHERE tracking_code = $1;\n")
            setup = []
        seed_activation_defect(workspace, item["id"])
        skill_dir = workspace / ".agents/skills/frontend-craft"
        shutil.copytree(root / "sources/candidate", skill_dir)
        (workspace / ".gitignore").write_text("node_modules/\ndist/\nevidence/\n")
        initialize_repo(workspace)
        output = root / "artifacts" / trial_id
        output.mkdir(parents=True)
        prompt = item["request"]
        if case_id:
            serve = [arg.replace("{port}", str(actor_port)) for arg in case["serve"]]
            prompt += COMMON_CONTEXT + "\nIf a server is needed, use exactly this argv: " + json.dumps(serve) + "\n"
        (output / "prompt.md").write_text(prompt)
        trials.append({"id": trial_id, "activation_case": item["id"],
                       "expected_activation": item["expected_activation"],
                       "actor_port": actor_port,
                       "workspace": str(workspace.relative_to(root)), "setup": setup, "validate": []})
    write_json(root / "activation-manifest.json", {"cases": trials, "timeout_seconds": args.timeout})
    activation_manifest = {**manifest, "settings": {**manifest["settings"], "timeout_seconds": args.timeout}}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda trial: run_trial(root, activation_manifest, trial), trials))
    observations = []
    for trial, result in zip(trials, results):
        trace = root / "artifacts" / trial["id"] / "agent/stdout.txt"
        read_evidence = []
        if trace.exists():
            for line in trace.read_text().splitlines():
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                command = event.get("item", {}).get("command", "")
                if "frontend-craft/SKILL.md" in command and event.get("item", {}).get("exit_code") == 0:
                    read_evidence.append(command)
        observations.append({"id": trial["id"], "case": trial["activation_case"],
                             "expected_activation": trial["expected_activation"],
                             "process_status": result["status"], "skill_read_commands": read_evidence,
                             "assessment": "Review actual reads and changes; absence in an incomplete run is unverified."})
    write_json(root / "activation-observations.json", observations)
    print(root / "activation-observations.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--root", required=True, type=Path)
    prep.add_argument("--anthropic", required=True, type=Path)
    prep.add_argument("--vercel", required=True, type=Path)
    prep.add_argument("--impeccable", required=True, type=Path)
    prep.add_argument("--model", required=True)
    prep.add_argument("--reasoning", default="ultra")
    prep.add_argument("--timeout", type=int, default=720)
    prep.add_argument("--seed", type=int, default=4109)
    pre = sub.add_parser("preflight")
    pre.add_argument("--root", required=True, type=Path)
    pre.add_argument("--probe", action="store_true", help="Make one billable Codex/browser probe.")
    pre.add_argument("--probe-timeout", type=int, default=120)
    runner = sub.add_parser("run")
    runner.add_argument("--root", required=True, type=Path)
    runner.add_argument("--stage", choices=["initial", "repeat"], default="initial")
    runner.add_argument("--variant", choices=VARIANTS)
    runner.add_argument("--case")
    runner.add_argument("--workers", type=int, choices=range(1, 5), default=1)
    runner.add_argument("--dry-run", action="store_true")
    final = sub.add_parser("finalists")
    final.add_argument("--root", required=True, type=Path)
    final.add_argument("--variants", nargs=2, choices=VARIANTS, required=True)
    final.add_argument("--rationale", type=Path, required=True)
    rendering = sub.add_parser("render")
    rendering.add_argument("--root", required=True, type=Path)
    rendering.add_argument("--stage", choices=["initial", "repeat"], default="initial")
    rendering.add_argument("--variant", choices=VARIANTS)
    rendering.add_argument("--case")
    rendering.add_argument("--port-start", type=int, default=8400)
    rendering.add_argument("--verify-behavior", action="store_true")
    rendering.add_argument("--axe-script", type=Path,
                           help="Pinned local axe-core script passed to the independent behavior verifier.")
    activation_parser = sub.add_parser("activation")
    activation_parser.add_argument("--root", required=True, type=Path)
    activation_parser.add_argument("--timeout", type=int, default=180)
    activation_parser.add_argument("--workers", type=int, choices=range(1, 5), default=1)
    args = parser.parse_args()
    if getattr(args, "timeout", 1) <= 0 or getattr(args, "probe_timeout", 1) <= 0:
        parser.error("Timeouts must be positive.")
    if getattr(args, "axe_script", None) and not args.verify_behavior:
        parser.error("--axe-script requires --verify-behavior.")
    try:
        {"prepare": prepare, "preflight": preflight, "run": run, "finalists": finalists,
         "render": render, "activation": activation}[args.operation](args)
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
