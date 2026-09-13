#!/bin/sh
# Reproduce this checkpoint only; this does NOT authorize another correction or round.
set -eu
cd "$(dirname "$0")/../../../../.."
node --import ./viewer/node_modules/tsx/dist/loader.mjs viewer/scripts/export_legacy_pipeline.ts viewer/models/female-tactical/spec.json .img2babylon/female-tactical/pipeline/c6-base-export.json
python3.11 pipeline/forge/stage2_spec/import_babylon_sculpt.py viewer/models/female-tactical/spec.json --native-export .img2babylon/female-tactical/pipeline/c6-base-export.json --out viewer/models/female-tactical/canonical-spec.json
python3.11 viewer/models/female-tactical/round4/prepare.py canonical
python3.11 viewer/models/female-tactical/round4/compile_surfaces.py c6
python3.11 pipeline/forge/stage2_spec/validate_sculpt_spec.py viewer/models/female-tactical/canonical-spec.json --strict-quality --json
python3.11 pipeline/forge/stage3_build/generate_babylon_factory.py viewer/models/female-tactical/canonical-spec.json --out viewer/models/female-tactical/createNativeFemaleTactical.ts --pass-id blockout --force
