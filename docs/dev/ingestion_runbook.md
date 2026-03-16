# Ingestion Runbook

## Purpose

This runbook describes how to bring new map assets into TacticsCanvas in a controlled, review-friendly way.

## Current Ingestion Model

Today, ingestion is UI-driven:

1. upload an image in the web app
2. server writes the image into `data/maps`
3. server loads an existing sidecar if present, otherwise creates a blank one

This works for small batches, but it is manual and lightly validated.

## Recommended Source Asset Rules

- Use stable, descriptive filenames.
- Prefer lowercase filenames with hyphens.
- Keep one image per sidecar.
- Do not rename files after review has started unless you migrate the sidecar intentionally.

Recommended pattern:

- `map-name.png`
- `map-name.tactical-map.json`

## Pre-Ingestion Checklist

Before uploading or copying a dataset:

- confirm image format is supported:
  - `.png`
  - `.jpg`
  - `.jpeg`
  - `.webp`
  - `.gif`
- confirm filenames are unique
- confirm images are final enough for labeling
- confirm the dataset owner agrees on the blocking-labeling rules

## Manual Ingestion Workflow

1. Start the app.
2. Upload one source image.
3. Confirm the generated grid dimensions look reasonable.
4. Save once to create a stable sidecar if needed.
5. Repeat for the remaining maps.
6. Refresh the dashboard and confirm all expected cases appear.

## Dataset Review Preparation

For each newly ingested map:

- verify image dimensions in metadata
- verify rows/cols are plausible
- verify the map can be opened from the dashboard
- set the initial review status to `in_progress`

## Known Weaknesses in Current Ingestion

- server trusts image dimensions sent by the client
- no duplicate detection beyond filename collisions
- no preflight validation report
- no batch import summary
- no schema migration tool for existing sidecars

## Recommended Near-Term Improvements

- add a dataset preflight command
- validate all sidecars before reviewers begin work
- emit warnings for:
  - missing sidecars
  - malformed sidecars
  - dimension mismatches
  - unusual grid sizes
  - duplicate or suspicious filenames

## Human Review Guidance

AI drafts should be treated as optional acceleration, not ground truth.

Operators should:

- review all AI blocking proposals visually
- use ambiguous tiles when the image is unclear
- leave notes when the labeling rule is hard to apply
- avoid over-labeling decorative or uncertain obstacles as blocked

## Desired Future Ingestion Flow

1. copy a batch of maps into a staging directory
2. run preflight validation
3. auto-generate or migrate sidecars
4. assign cases to operators
5. track completion and approval through the dashboard
