#!/usr/bin/env python3
"""Deterministic grader for research-memory evals.

Reads a plan JSON, walks assertions from evals.json, and emits a grading.json
with {expectations: [{text, passed, evidence}]}.

Usage:
  python3 grader.py <plan.json> <eval_id> <out_grading.json>
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

EVALS_PATH = Path(__file__).parent / "evals.json"


def load_plan(path: Path) -> tuple[dict | None, str, str]:
    """Returns (plan_dict, raw_text, error_reason)."""
    try:
        raw = path.read_text()
    except FileNotFoundError:
        return None, "", f"plan file not found: {path}"
    stripped = raw.strip()
    fence = re.search(r"```json\s*(.*?)```", stripped, re.DOTALL)
    candidate = fence.group(1).strip() if fence else stripped
    try:
        return json.loads(candidate), raw, ""
    except json.JSONDecodeError as e:
        return None, raw, f"invalid JSON: {e}"


def walk_matches(obj, path: str):
    """Tiny jsonpath subset. Supports $.a.b, $.arr[*], $.arr[*].field, $.arr[*].field[]."""
    if path.startswith("$"):
        path = path[1:]
    if path.startswith("."):
        path = path[1:]
    tokens = re.findall(r"[^.\[\]]+|\[\*\]|\[\]", path)
    cur = [obj]
    for tok in tokens:
        nxt = []
        if tok == "[*]" or tok == "[]":
            for c in cur:
                if isinstance(c, list):
                    nxt.extend(c)
        else:
            for c in cur:
                if isinstance(c, dict) and tok in c:
                    nxt.append(c[tok])
        cur = nxt
    return cur


def collect_parents(obj, path: str):
    """Return parent objects for a `[*]`-terminated path (so we can inspect siblings)."""
    if path.startswith("$"):
        path = path[1:]
    if path.startswith("."):
        path = path[1:]
    tokens = re.findall(r"[^.\[\]]+|\[\*\]|\[\]", path)
    if not tokens or tokens[-1] not in ("[*]", "[]"):
        return []
    cur = [obj]
    for tok in tokens[:-1]:
        nxt = []
        if tok == "[*]" or tok == "[]":
            for c in cur:
                if isinstance(c, list):
                    nxt.extend(c)
        else:
            for c in cur:
                if isinstance(c, dict) and tok in c:
                    nxt.append(c[tok])
        cur = nxt
    results = []
    for c in cur:
        if isinstance(c, list):
            results.extend([x for x in c if isinstance(x, dict)])
    return results


def find_wikilinks(text: str) -> list[str]:
    return re.findall(r"\[\[([^\[\]|#]+?)(?:\|[^\]]+)?\]\]", text)


def check_assertion(plan: dict, raw_text: str, a: dict) -> tuple[bool, str]:
    c = a["check"]
    try:
        if c == "fenced_json_parseable":
            return (plan is not None), "plan parsed" if plan else "plan did not parse"

        if c == "not_contains":
            sub = a["substring"]
            return (sub not in raw_text), f"found '{sub}'" if sub in raw_text else f"'{sub}' absent"

        if c == "jsonpath_equals":
            vals = walk_matches(plan, a["path"])
            ok = any(v == a["value"] for v in vals)
            return ok, f"found {vals!r}, expected {a['value']!r}"

        if c == "jsonpath_contains":
            vals = walk_matches(plan, a["path"])
            sub = a["substring"]
            ok = any(isinstance(v, str) and sub in v for v in vals)
            return ok, f"values={vals!r}, substring={sub!r}"

        if c == "jsonpath_length_gte":
            vals = walk_matches(plan, a["path"])
            total = sum(len(v) if isinstance(v, list) else 1 for v in vals)
            if not vals:
                return False, "no values found"
            lens = [len(v) for v in vals if isinstance(v, list)]
            if lens:
                ok = max(lens) >= a["min"]
                return ok, f"max length={max(lens)}, min required={a['min']}"
            ok = total >= a["min"]
            return ok, f"count={total}, min={a['min']}"

        if c == "jsonpath_any_contains":
            vals = walk_matches(plan, a["path"])
            sub = a["substring"]
            def any_contains(v):
                if isinstance(v, str):
                    return sub in v
                if isinstance(v, dict):
                    return any(any_contains(x) for x in v.values())
                if isinstance(v, list):
                    return any(any_contains(x) for x in v)
                return False
            ok = any(any_contains(v) for v in vals)
            sample = [v for v in vals][:3]
            return ok, f"substring={sub!r}, sample={sample!r}"

        if c == "jsonpath_any_matches":
            vals = walk_matches(plan, a["path"])
            rgx = re.compile(a["regex"])
            ok = any(isinstance(v, str) and rgx.search(v) for v in vals)
            return ok, f"regex={a['regex']}, matches in {vals[:5]!r}"

        if c == "jsonpath_any_equals":
            vals = walk_matches(plan, a["path"])
            ok = any(v == a["value"] for v in vals)
            return ok, f"values={vals!r}, expected {a['value']!r}"

        if c == "jsonpath_any_equals_where":
            parents = collect_parents(plan, a["path"])
            where = a["where"]
            exists = any(all(p.get(k) == v for k, v in where.items()) for p in parents)
            if a.get("exists") is True:
                return exists, f"where={where}, found={exists}"
            if "field" in a and "value" in a:
                ok = any(
                    all(p.get(k) == v for k, v in where.items()) and p.get(a["field"]) == a["value"]
                    for p in parents
                )
                return ok, f"where={where}, field={a['field']}={a['value']!r}"
            return exists, f"where={where}, found={exists}"

        if c == "jsonpath_any_matches_where":
            parents = collect_parents(plan, a["path"])
            where = a["where"]
            pregex = where.get("path_regex")
            def matches(p):
                if pregex and isinstance(p.get("path"), str):
                    return bool(re.search(pregex, p["path"]))
                return all(p.get(k) == v for k, v in where.items())
            cands = [p for p in parents if matches(p)]
            if "field" in a and "value" in a:
                ok = any(p.get(a["field"]) == a["value"] for p in cands)
                return ok, f"found {len(cands)} matches; field {a['field']}={a['value']!r} in any? {ok}"
            return bool(cands), f"matches={len(cands)}"

        if c == "jsonpath_any_contains_where":
            parents = collect_parents(plan, a["path"])
            where = a["where"]
            pregex = where.get("path_regex")
            def matches(p):
                if pregex and isinstance(p.get("path"), str):
                    return bool(re.search(pregex, p["path"]))
                return all(p.get(k) == v for k, v in where.items())
            cands = [p for p in parents if matches(p)]
            field = a["field"]
            subs = a.get("substring_any", [a.get("substring", "")])
            ok = any(
                isinstance(p.get(field), str) and any(s.lower() in p[field].lower() for s in subs)
                for p in cands
            )
            return ok, f"field {field!r} contains any of {subs!r} in {len(cands)} candidates"

        if c == "jsonpath_all_match_where":
            parents = collect_parents(plan, a["path"])
            where = a["where"]
            target = [p for p in parents if all(p.get(k) == v for k, v in where.items())]
            sub = a["args_contains"]
            if not target:
                return False, f"no parents match {where}"
            ok = all(isinstance(p.get("args"), str) and sub in p["args"] for p in target)
            return ok, f"{len(target)} matching, substring={sub!r}, all? {ok}"

        if c == "jsonpath_none_equals":
            vals = walk_matches(plan, a["path"])
            ok = not any(v == a["value"] for v in vals)
            return ok, f"values={vals!r}, forbidden={a['value']!r}"

        if c == "jsonpath_is_array":
            vals = walk_matches(plan, a["path"])
            ok = bool(vals) and all(isinstance(v, list) for v in vals)
            return ok, f"types={[type(v).__name__ for v in vals]}"

        if c == "jsonpath_count_where":
            parents = collect_parents(plan, a["path"])
            where = a["where"]
            n = sum(1 for p in parents if all(p.get(k) == v for k, v in where.items()))
            ok = n >= a["min"]
            return ok, f"count={n}, min={a['min']}"

        if c == "jsonpath_all_have_frontmatter_key":
            parents = collect_parents(plan, a["path"])
            types = set(a["types"])
            key = a["key"]
            targets = [p for p in parents if p.get("type") in types]
            missing = [p.get("path", "?") for p in targets if key not in (p.get("frontmatter") or {})]
            ok = len(missing) == 0 and len(targets) > 0
            return ok, f"targets={len(targets)}, missing key {key!r} in: {missing}"

        if c == "jsonpath_any_has_frontmatter_key_where":
            parents = collect_parents(plan, a["path"])
            where = a["where"]
            key = a["key"]
            ok = any(
                all(p.get(k) == v for k, v in where.items())
                and key in (p.get("frontmatter") or {})
                for p in parents
            )
            return ok, f"where={where}, key={key!r}"

        if c == "jsonpath_any_contains_in_list":
            # Path like "$.writes[*].preserves[]" — find writes matching where_parent,
            # then check their `preserves` list contains a string containing substring.
            m = re.match(r"(.+)\.([^.]+)\[\]$", a["path"])
            if not m:
                return False, f"unparseable path for check: {a['path']}"
            parent_path, list_field = m.group(1), m.group(2)
            parents = walk_matches(plan, parent_path)
            flat = []
            for p in parents:
                if isinstance(p, list):
                    flat.extend(x for x in p if isinstance(x, dict))
                elif isinstance(p, dict):
                    flat.append(p)
            wp = a.get("where_parent", {})
            matched = [p for p in flat if all(p.get(k) == v for k, v in wp.items())]
            sub = a["substring"]
            ok = any(
                isinstance(p.get(list_field), list)
                and any(isinstance(x, str) and sub in x for x in p[list_field])
                for p in matched
            )
            sample = [p.get(list_field) for p in matched[:2]]
            return ok, f"{len(matched)} parents match {wp}; list_field={list_field!r}; substring={sub!r}; sample={sample!r}"

        if c == "jsonpath_none_match":
            vals = walk_matches(plan, a["path"])
            rgx = re.compile(a["regex"])
            bad = [v for v in vals if isinstance(v, str) and rgx.search(v)]
            ok = len(bad) == 0
            return ok, f"forbidden matches: {bad}"

        if c == "jsonpath_none_contains":
            vals = walk_matches(plan, a["path"])
            subs = a.get("substring_any", [a.get("substring", "")])
            bad = [v for v in vals if isinstance(v, str) and any(s in v for s in subs)]
            ok = len(bad) == 0
            return ok, f"forbidden substrings found in: {bad}"

        if c == "link_integrity_wikilinks_in_links":
            writes = plan.get("writes") or []
            links = plan.get("links") or []
            link_wikilinks = {l.get("wikilink") for l in links if isinstance(l, dict)}
            missing = []
            for w in writes:
                bs = w.get("body_sections") or {}
                if not isinstance(bs, dict):
                    continue
                for section, body in bs.items():
                    if not isinstance(body, str):
                        continue
                    for target in find_wikilinks(body):
                        wl = f"[[{target}]]"
                        if wl not in link_wikilinks:
                            missing.append(f"{w.get('path','?')} §{section}: {wl}")
            ok = len(missing) == 0
            return ok, f"{len(missing)} wikilinks not in plan.links[]: {missing[:5]}"

        return False, f"unknown check type: {c}"
    except Exception as e:
        return False, f"grader error: {e}"


def main():
    if len(sys.argv) != 4:
        print("usage: grader.py <plan.json> <eval_id> <out_grading.json>", file=sys.stderr)
        sys.exit(2)
    plan_path = Path(sys.argv[1])
    eval_id = int(sys.argv[2])
    out_path = Path(sys.argv[3])
    evals = json.loads(EVALS_PATH.read_text())
    eval_def = next(e for e in evals["evals"] if e["id"] == eval_id)
    plan, raw, err = load_plan(plan_path)
    results = []
    if plan is None:
        for a in eval_def["assertions"]:
            results.append({"text": a["text"], "passed": False, "evidence": f"(plan load failed) {err}"})
    else:
        for a in eval_def["assertions"]:
            ok, ev = check_assertion(plan, raw, a)
            results.append({"text": a["text"], "passed": bool(ok), "evidence": ev})
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    out = {
        "eval_id": eval_id,
        "eval_name": eval_def["name"],
        "plan_path": str(plan_path),
        "passed": passed,
        "total": total,
        "score": passed / total if total else 0.0,
        "expectations": results,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))
    print(f"{eval_def['name']}: {passed}/{total} passed")
    for r in results:
        mark = "✓" if r["passed"] else "✗"
        print(f"  {mark} {r['text']}")
        if not r["passed"]:
            print(f"     └─ {r['evidence']}")


if __name__ == "__main__":
    main()
