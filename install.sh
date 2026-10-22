#!/usr/bin/env bash
set -euo pipefail

source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install_dir="${INSTALL_DIR:-${HOME}/.local/bin}"
for dependency in bash node claude; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'Install %s before running this installer.\n' "$dependency" >&2
    exit 1
  fi
done
mkdir -p "$install_dir"
if [[ -e "$install_dir/claude-deepseek" ]]; then
  backup="$install_dir/claude-deepseek.backup.$(date +%Y%m%d%H%M%S).$$"
  cp -p "$install_dir/claude-deepseek" "$backup"
  printf 'Previous launcher backed up to %s\n' "$backup"
fi
install -m 755 "$source_dir/bin/claude-deepseek" "$install_dir/claude-deepseek"
printf 'Installed %s/claude-deepseek\n' "$install_dir"
case ":$PATH:" in
  *:"$install_dir":*) ;;
  *) printf 'Add this directory to PATH: %s\n' "$install_dir" ;;
esac
printf 'Run claude-deepseek to start.\n'
