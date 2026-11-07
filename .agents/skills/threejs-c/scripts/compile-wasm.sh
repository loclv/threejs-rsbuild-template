#!/usr/bin/env bash
# Portable Clang to WebAssembly compilation script for Three.js C kernels.
set -euo pipefail

INPUT_FILE="${1:-wasm/terrain.c}"
OUTPUT_FILE="${2:-public/terrain.wasm}"
ENABLE_SIMD="${3:-false}"

# Detect available clang compiler
CLANG_BIN=""
WASM_LD_BIN=""

if [[ -x "/opt/nanobrew/prefix/opt/llvm@22/bin/clang" ]]; then
  CLANG_BIN="/opt/nanobrew/prefix/opt/llvm@22/bin/clang"
  WASM_LD_BIN="/opt/nanobrew/prefix/opt/lld@22/bin/wasm-ld"
elif [[ -x "/opt/homebrew/opt/llvm/bin/clang" ]]; then
  CLANG_BIN="/opt/homebrew/opt/llvm/bin/clang"
  WASM_LD_BIN="/opt/homebrew/opt/llvm/bin/wasm-ld"
elif [[ -x "/usr/local/opt/llvm/bin/clang" ]]; then
  CLANG_BIN="/usr/local/opt/llvm/bin/clang"
  WASM_LD_BIN="/usr/local/opt/llvm/bin/wasm-ld"
elif command -v clang >/dev/null 2>&1; then
  CLANG_BIN="$(command -v clang)"
fi

if [[ -z "$CLANG_BIN" ]]; then
  echo "Error: Clang compiler with wasm32 support not found." >&2
  exit 1
fi

echo "Using compiler: $CLANG_BIN"

# Build flags
FLAGS=(
  "--target=wasm32"
  "-O3"
  "-flto"
  "-nostdlib"
  "-Wl,--no-entry"
  "-Wl,--export-memory"
  "-Wl,--export-all"
  "-Wl,--initial-memory=4194304"
)

if [[ -n "$WASM_LD_BIN" && -x "$WASM_LD_BIN" ]]; then
  FLAGS+=("-fuse-ld=$WASM_LD_BIN")
fi

if [[ "$ENABLE_SIMD" == "true" ]]; then
  FLAGS+=("-msimd128")
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"

"$CLANG_BIN" "${FLAGS[@]}" -o "$OUTPUT_FILE" "$INPUT_FILE"

FILE_SIZE=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
echo "Successfully compiled: $INPUT_FILE -> $OUTPUT_FILE ($FILE_SIZE bytes)"
