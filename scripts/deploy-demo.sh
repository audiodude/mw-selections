#!/usr/bin/env bash
# Deploy the selection-picker demo (examples/plain.html + built bundle) to
# Cloudflare Pages at https://selection-picker.audiodude.xyz.
#
# Stages ONLY the two public files into a temp dir and deploys that — never the
# package or repo root (wrangler pages deploy uploads every file on disk,
# ignoring .gitignore).
#
# Requires CLOUDFLARE_API_TOKEN (or CF_API_TOKEN) and, on first run, the Pages
# project `selection-picker` to exist (created with `wrangler pages project create`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/packages/selection-picker"
PROJECT=selection-picker
ACCOUNT_ID=059181f68081f9c0fb55c5c77a969c11

export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_API_TOKEN:?set CLOUDFLARE_API_TOKEN or CF_API_TOKEN}}"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

(cd "$ROOT" && npm run build -w @audiodude/selection-picker)

STAGE="$(mktemp -d)/site"
mkdir -p "$STAGE"
trap 'rm -rf "$(dirname "$STAGE")"' EXIT

cp "$PKG/dist/selection-picker.min.js" "$STAGE/"
sed 's#\.\./dist/selection-picker\.min\.js#./selection-picker.min.js#' "$PKG/examples/plain.html" > "$STAGE/index.html"

cd "$ROOT"
npx --yes wrangler@3 pages deploy "$STAGE" --project-name "$PROJECT" --branch main --commit-dirty=true
