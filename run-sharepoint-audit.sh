#!/usr/bin/env bash
set -euo pipefail
COURSE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$COURSE_ROOT/scripts/sharepoint-audit"
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 18 or newer is required.' >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0])>=18?0:1)' ; then
  echo 'Node.js 18 or newer is required.' >&2
  exit 1
fi
if ! node -e 'process.exit(require("./node_modules/playwright-core/package.json").version==="1.56.1"?0:1)' 2>/dev/null; then
  npm ci --ignore-scripts --no-audit --no-fund
fi
# Use the existing browser when available; install the pinned browser only if needed.
if ! node --input-type=module -e '
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const base=path.join(os.homedir(),".cache/ms-playwright");
const cached=fs.existsSync(base)&&fs.readdirSync(base).some(n=>/^chromium-\d+$/.test(n)&&["chrome-linux64/chrome","chrome-linux/chrome"].some(p=>fs.existsSync(path.join(base,n,p))));
const system=["/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"].some(p=>fs.existsSync(p));
process.exit(cached||system?0:1);'; then
  node node_modules/playwright-core/cli.js install chromium
fi
exec node audit.mjs --discover --screenshots "$@"
