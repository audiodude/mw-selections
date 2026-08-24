#!/usr/bin/env python3
"""Structural linter for the conformance fixture tree.

Not a spec implementation: checks internal consistency only —
file layout, meta/expected contracts, error-code registry,
canonical item form in expected outputs, and that every case
named in the README coverage matrix exists (and vice versa).

Usage: python3 scripts/lint_fixtures.py  (from the repo root)
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "fixtures"

OPERATIONS = {
    "tsv-parse", "tsv-serialize", "json-parse", "simple",
    "petscan", "sparql", "quarry", "validate",
}

ERROR_CODES = {
    "ENCODING_INVALID", "EMPTY_TITLE", "FIELD_FORBIDDEN_CHAR",
    "DUPLICATE_ITEM", "TSV_INVALID_ID", "TSV_INVALID_NAMESPACE",
    "TSV_TOO_MANY_COLUMNS", "SIDECAR_DBNAME_MISSING", "JSON_MALFORMED",
    "JSON_SHAPE", "ITEM_SHAPE", "DBNAME_MISSING", "DBNAME_INVALID",
    "SPARQL_NO_VARIABLE", "SPARQL_NO_MATCHING_ROWS",
    "QUARRY_NO_TITLE_COLUMN",
}

INPUT_NAMES = {"input.swiki", "input.json", "input.txt"}
EXPECTED_INPUT = {
    "tsv-parse": "input.swiki", "tsv-serialize": "input.json",
    "json-parse": "input.json", "simple": "input.txt",
    "petscan": "input.json", "sparql": "input.json",
    "quarry": "input.json", "validate": "input.json",
}
# Cases whose input is intentionally not valid JSON / UTF-8.
RAW_INPUT_OK = {("json-parse", "malformed"), ("validate",)}

errors = []


def err(case, msg):
    errors.append(f"{case}: {msg}")


def is_canonical_item(item):
    if isinstance(item, str):
        return item != ""
    if not isinstance(item, list) or not (2 <= len(item) <= 3):
        return False
    title, id_ = item[0], item[1]
    if not isinstance(title, str) or title == "":
        return False
    if not (id_ is None or (isinstance(id_, int) and id_ >= 0)):
        return False
    if len(item) == 2:
        return id_ is not None  # [t, null] and [t] must be a bare string
    ns = item[2]
    return isinstance(ns, int) and ns > 0  # trailing 0 must be dropped


def item_key(item):
    if isinstance(item, str):
        return (item, 0)
    ns = item[2] if len(item) == 3 else 0
    return (item[0], ns)


def check_pages(case, pages):
    keys = set()
    for it in pages:
        if not is_canonical_item(it):
            err(case, f"expected page not in canonical form: {it!r}")
            continue
        title = it if isinstance(it, str) else it[0]
        if "\t" in title or "\n" in title:
            err(case, f"expected page contains forbidden char: {title!r}")
        k = item_key(it)
        if k in keys:
            err(case, f"expected pages contain duplicate key {k!r}")
        keys.add(k)


def main():
    sitematrix = json.loads((FIX / "sitematrix.json").read_text())["sitematrix"]
    dbnames = set()
    for k, v in sitematrix.items():
        if k == "count":
            continue
        sites = v if isinstance(v, list) else v["site"]
        dbnames.update(s["dbname"] for s in sites)

    cases = []
    for meta_path in sorted(FIX.glob("*/*/meta.json")):
        case_dir = meta_path.parent
        op, name = case_dir.parent.name, case_dir.name
        case = f"{op}/{name}"
        cases.append(case)

        if op not in OPERATIONS:
            err(case, f"unknown operation directory {op!r}")
            continue

        meta = json.loads(meta_path.read_text())
        if not isinstance(meta.get("description"), str) or not meta["description"]:
            err(case, "meta.description missing or empty")
        spec = meta.get("spec")
        if not isinstance(spec, list) or not spec or not all(
            isinstance(s, str) and re.fullmatch(r"§\d+(\.\d+)?", s) for s in spec
        ):
            err(case, f"meta.spec malformed: {spec!r}")
        for key in meta:
            if key not in {"description", "spec", "params", "provenance"}:
                err(case, f"unknown meta key {key!r}")

        files = {p.name for p in case_dir.iterdir()}
        inputs = files & INPUT_NAMES
        if inputs != {EXPECTED_INPUT[op]}:
            err(case, f"expected exactly {{{EXPECTED_INPUT[op]}}}, found {inputs or '{}'}")
        if "sidecar.json" in files and op != "tsv-parse":
            err(case, "sidecar.json only allowed under tsv-parse")
        extra = files - INPUT_NAMES - {"meta.json", "expected.json", "expected.swiki", "sidecar.json"}
        if extra:
            err(case, f"unexpected files: {sorted(extra)}")

        has_json = "expected.json" in files
        has_swiki = "expected.swiki" in files
        if has_json == has_swiki:
            err(case, "need exactly one of expected.json / expected.swiki")
            continue
        if has_swiki and op != "tsv-serialize":
            err(case, "expected.swiki only allowed under tsv-serialize")

        # Inputs named input.json must parse, except the intentionally malformed one.
        if EXPECTED_INPUT[op] == "input.json" and (op, name) != ("json-parse", "malformed"):
            try:
                json.loads((case_dir / "input.json").read_text())
            except FileNotFoundError:
                pass  # already reported above
            except (json.JSONDecodeError, UnicodeDecodeError):
                err(case, "input.json does not parse as JSON")

        if has_swiki:
            continue

        expected = json.loads((case_dir / "expected.json").read_text())
        status = expected.get("status")
        if status == "error":
            code = expected.get("code")
            if code not in ERROR_CODES:
                err(case, f"unknown error code {code!r}")
            if set(expected) != {"status", "code"}:
                err(case, f"error expectation has extra keys: {sorted(set(expected) - {'status', 'code'})}")
        elif status == "ok":
            allowed = {"status", "selection", "report"}
            if set(expected) - allowed:
                err(case, f"ok expectation has extra keys: {sorted(set(expected) - allowed)}")
            sel = expected.get("selection")
            if sel is None:
                if op != "validate":
                    err(case, "ok expectation missing selection")
            else:
                check_pages(case, sel.get("pages", []))
                db = sel.get("dbname")
                if db is not None and db not in dbnames:
                    err(case, f"expected dbname {db!r} not in sitematrix fixture")
            report = expected.get("report")
            if op == "sparql" and (
                not isinstance(report, dict) or set(report) != {"ingested", "dropped"}
            ):
                err(case, "sparql ok expectation must report {ingested, dropped}")
            if report is not None and op != "sparql":
                err(case, "report only allowed for sparql")
        else:
            err(case, f"expected.status must be ok|error, got {status!r}")

    # Cross-check the README coverage matrix against the tree.
    readme = (FIX / "README.md").read_text()
    referenced = set(re.findall(r"\b((?:%s)/[a-z0-9-]+)\b" % "|".join(sorted(OPERATIONS)), readme))
    existing = set(cases)
    for ref in sorted(referenced - existing):
        err("README", f"references nonexistent case {ref}")
    unmentioned = {c for c in existing if c not in referenced}
    for c in sorted(unmentioned):
        err("README", f"case {c} not referenced in coverage matrix")
    for code in ERROR_CODES:
        if code not in readme:
            err("README", f"error code {code} missing from registry")

    if errors:
        print(f"FAIL: {len(errors)} problem(s)")
        for e in errors:
            print(f"  {e}")
        return 1
    print(f"OK: {len(cases)} cases across {len({c.split('/')[0] for c in cases})} operations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
