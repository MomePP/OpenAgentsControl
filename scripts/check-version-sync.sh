#!/usr/bin/env bash
#
# check-version-sync.sh
#
# Verifies the plugin version is consistent across:
#   - plugins/claude-code/.claude-plugin/plugin.json   (top-level "version")
#   - .claude-plugin/marketplace.json                  (plugins[].version where name == "oac")
#
# Exits non-zero on mismatch so a pre-commit hook can block the commit.
#
# Usage:
#   bash scripts/check-version-sync.sh

set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PLUGIN_JSON="$REPO_ROOT/plugins/claude-code/.claude-plugin/plugin.json"
MARKETPLACE_JSON="$REPO_ROOT/.claude-plugin/marketplace.json"

if [ ! -f "$PLUGIN_JSON" ]; then
    echo "version-sync: $PLUGIN_JSON not found — skipping"
    exit 0
fi

if [ ! -f "$MARKETPLACE_JSON" ]; then
    echo "version-sync: $MARKETPLACE_JSON not found — skipping"
    exit 0
fi

# Prefer node (already a project dependency); fall back to python3 or jq.
read_version() {
    local file="$1"
    local jq_filter="$2"
    local node_filter="$3"

    if command -v node >/dev/null 2>&1; then
        node -e "
            const m = require('$file');
            const v = $node_filter;
            if (!v) process.exit(2);
            console.log(v);
        "
    elif command -v jq >/dev/null 2>&1; then
        jq -er "$jq_filter" "$file"
    elif command -v python3 >/dev/null 2>&1; then
        python3 - <<PY
import json, sys
with open("$file") as f:
    data = json.load(f)
$node_filter
PY
    else
        echo "version-sync: need node, jq, or python3 — none found" >&2
        exit 2
    fi
}

PLUGIN_VERSION=$(node -e "
    const m = require('$PLUGIN_JSON');
    if (!m.version) process.exit(2);
    console.log(m.version);
") || { echo "version-sync: failed to read plugin.json version" >&2; exit 2; }

MARKETPLACE_VERSION=$(node -e "
    const m = require('$MARKETPLACE_JSON');
    const oac = (m.plugins || []).find(p => p.name === 'oac');
    if (!oac || !oac.version) process.exit(2);
    console.log(oac.version);
") || { echo "version-sync: failed to read marketplace.json oac version" >&2; exit 2; }

if [ "$PLUGIN_VERSION" != "$MARKETPLACE_VERSION" ]; then
    echo
    echo "✗ version-sync: plugin version drift" >&2
    echo "  plugins/claude-code/.claude-plugin/plugin.json    → $PLUGIN_VERSION" >&2
    echo "  .claude-plugin/marketplace.json (oac entry)       → $MARKETPLACE_VERSION" >&2
    echo
    echo "Bump both files together. Run with --no-verify only if you know why." >&2
    echo
    exit 1
fi

echo "version-sync: $PLUGIN_VERSION (plugin.json) == $MARKETPLACE_VERSION (marketplace.json) ✓"
