#!/usr/bin/env bash
#
# setup-cli.sh — install `harnesstrim` CLI on PATH from the local repo checkout.
#
# Creates a small launcher script at ~/.local/bin/harnesstrim that uses tsx
# (from the workspace node_modules) to run the TypeScript CLI source.
#
# Usage:
#   cd /path/to/harnesstrim
#   ./scripts/setup-cli.sh          # installs ~/.local/bin/harnesstrim
#   harnesstrim --help              # now available globally
#
# Prerequisites: Node.js >= 18 + pnpm, `pnpm install` already run.
# Works with the monorepo workspace layout (packages/cli/src/cli.ts).

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
BINDIR="${HOME}/.local/bin"
LAUNCHER="${BINDIR}/harnesstrim"
CLI_SRC="${HERE}/packages/cli/src/cli.ts"

# Verify the CLI source exists
if [[ ! -f "${CLI_SRC}" ]]; then
  echo "❌ Cannot find CLI source at ${CLI_SRC}"
  echo "   Run this script from the harnesstrim repo root."
  exit 1
fi

# Create ~/.local/bin if needed
mkdir -p "${BINDIR}"

# Write the launcher script
cat > "${LAUNCHER}" << 'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
PROJECT="$(cd "${DIR}/../.." && pwd)"
exec node --import tsx "${PROJECT}/packages/cli/src/cli.ts" "$@"
LAUNCHER

chmod +x "${LAUNCHER}"

echo "✅ Installed harnesstrim CLI at ${LAUNCHER}"

# Add ~/.local/bin to PATH in shell profile if not already there
for PROFILE_FILE in "${HOME}/.bashrc" "${HOME}/.zshrc" "${HOME}/.profile"; do
  if [[ -f "${PROFILE_FILE}" ]]; then
    if ! grep -q 'export PATH="${HOME}/\.local/bin' "${PROFILE_FILE}" 2>/dev/null; then
      echo "" >> "${PROFILE_FILE}"
      echo '# Added by harnesstrim/setup-cli.sh' >> "${PROFILE_FILE}"
      echo 'export PATH="${HOME}/.local/bin:${PATH}"' >> "${PROFILE_FILE}"
      echo "📝 Added ~/.local/bin to PATH in ${PROFILE_FILE}"
    fi
  fi
done

# Make it available in the current shell too
export PATH="${BINDIR}:${PATH}"

# Quick smoke test
if "${LAUNCHER}" --help >/dev/null 2>&1; then
  echo "🎉 harnesstrim is ready. Run 'harnesstrim --help' to get started."
else
  echo "⚠️  Launcher installed but the smoke test failed."
  echo "   Run 'node --import tsx ${CLI_SRC} --help' manually to debug."
fi
