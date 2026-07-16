---
name: data-analysis-workflow
description: Use for every task that runs data analysis, transforms data, performs QC or statistics, builds matrices, or creates plots and tables. It resolves the nearest project manifest, routes work into one bounded run directory, preserves reproducible code and records, and lazily reuses project analysis and visualization patterns.
---

# Data Analysis Workflow

Use this skill whenever code or commands transform data into analytical artifacts. The goal is fast, reproducible work without scattering outputs or creating nested analysis projects.

## Core Contract

Every new analysis follows this path:

```text
nearest .project_manifest.md
  -> project_root
  -> analysis_key
  -> routes[analysis_key]
  -> <route>/<run_name>/
  -> script/ process/ result/ docs/
```

Do not invent another project tree when the project manifest already defines where the work belongs.

## 1. Discover the Project

Before running analysis code:

1. Look for `.project_manifest.md` in the current working directory.
2. If absent, walk upward and select the nearest `.project_manifest.md`.
3. Read that file before choosing an output path.
4. Use its explicit `project_root` when defined; otherwise use the manifest's parent directory.
5. Confirm that `project_root` exists.

If no manifest is found, report the searched ancestor chain. Ask where the analysis belongs rather than silently creating a workspace in an arbitrary directory.

The nearest manifest wins. Do not merge manifests from multiple ancestors unless the selected manifest explicitly references another file.

## 2. Resolve the Analysis Route

Determine an `analysis_key`, for example `qc`, `atac`, `atac.pca`, `hic`, or `rna.heatmap`.

Resolution rules:

1. Use a key supplied by the user or current run configuration.
2. Otherwise infer a key only when the request has one unambiguous match in the manifest's `routes` table.
3. Prefer the most specific matching key when the manifest defines hierarchical keys.
4. If multiple routes remain plausible, ask one concise question. Do not guess.
5. Resolve a relative route against `project_root`.
6. Reject a route that escapes `project_root`.

Project manifests may map several related keys to the same route. The key records analytical intent; the route controls filesystem placement.

## 3. Choose One Run Root

For new work, use a sortable descriptive name:

```text
YYYYMMDD_topic
```

Examples:

- `20260716_atac_pca`
- `20260716_rna_heatmap`
- `20260716_cuttag_pu1_qc`

Create only:

```text
<project_root>/<route>/<run_name>/
├── .analysis_manifest.md
├── script/
├── process/
├── result/
└── docs/
```

Rules:

- Never overwrite an existing run directory.
- Reuse an existing run only when continuing the same scientific question, source set, and compatible method.
- Create a new run for a new scientific question, a source-set revision, or an incompatible method change.
- Retries, parameter refinements, and plot variants stay inside the same run when they answer the same question.
- Do not create another date-prefixed analysis root inside a run.
- Role subdirectories are allowed inside `script/`, `process/`, `result/`, and `docs/` when they clarify artifacts.

For a complex workflow, `workflow/`, `sources/`, or `metadata/` may be added directly under the run root, but they do not replace the four required directories and must not become nested projects.

## 4. Load Run Context Lazily

At analysis start, read only:

1. the selected `.project_manifest.md`
2. `<run_root>/.analysis_manifest.md`, if it already exists

Do not recursively inject every script, note, pattern, result, or intermediate file. Use `read`, `glob`, and `grep` to retrieve only the context needed for the current decision.

The run `.analysis_manifest.md` should record at least:

- `analysis_key`
- goal or scientific question
- source-set identity and input manifests
- selected project pattern, if any
- scripts or workflows used
- important parameters and random seeds
- artifact and documentation paths
- run status: `active`, `final`, `superseded`, or `archived`
- references to legacy inputs or earlier runs

## 5. Reuse Project Patterns on Demand

A project may define:

```text
<project_root>/.analysis_manifest.md
<project_root>/.analysis_patterns/
```

The project `.analysis_manifest.md` is a compact registry. It may contain project defaults, pattern IDs, tags, and paths to pattern, style, or reusable script files. It must not embed every pattern body.

When a task needs plotting or a reusable analysis method:

1. Read the project `.analysis_manifest.md` referenced by `.project_manifest.md`.
2. Match the requested modality, analysis type, and output to registry tags.
3. Read only the best matching pattern file.
4. Read its referenced style or reusable script only when required.
5. Apply current-run parameters as the final override.
6. Record the resolved pattern, script, style, and relevant revision or hash in the run manifest or experiment record.

Lookup precedence:

```text
global data-analysis-workflow rules
  -> project .analysis_manifest.md defaults
  -> selected project pattern
  -> current run parameters
```

Project biological semantics, stage/tissue order, palettes, and project-specific scripts belong in the project registry, not in this global skill. Do not create one skill per plot.

If a reference cannot be resolved, report the unresolved identifier and the locations searched. Do not silently substitute a loosely related pattern.

## 6. Artifact Placement

### `script/`

Store executable analysis logic, parameterized wrappers, notebooks converted to scripts, and run-specific glue code.

If logic is demonstrably reusable across independent finalized runs, reference a canonical project-level script rather than copying it into every run. Keep one-off logic run-local until reuse is proven.

### `process/`

Store reproducibility-critical intermediates:

- filtered sample or feature manifests
- source-set definitions
- transformed matrices
- metadata mappings and manual overrides
- logs and success/failure manifests
- exact tables used to generate figures

### `result/`

Store final user-facing figures, tables, matrices, reports, and exports. Keep superseded artifacts for provenance when necessary, but identify the current final artifact explicitly rather than creating ambiguous `final_v2` directory chains.

### `docs/`

Store methods, run notes, assumptions, interpretation, limitations, and artifact indexes. For non-trivial work, prefer:

```text
docs/
├── EXPERIMENT_RECORD.md
├── CODE_AND_ARTIFACTS.md
└── RESULTS_SUMMARY.md
```

## 7. Traceability Requirements

For every major result, be able to answer:

1. Which input files and source-set revision were used?
2. Which samples or features were included and excluded?
3. Which script, workflow, or exact command produced it?
4. Which parameters and random seeds were used?
5. Which intermediate artifacts fed into it?
6. Which project pattern or style was applied?
7. Where is the final output stored?

Save manifests rather than relying on directory names or memory. Preserve manual curation as explicit metadata input. Record partial or failed batches when they affect interpretation.

If an analysis uses multiple region sets, cohorts, or source sets, give each a stable identity and role such as `foreground`, `background`, `reference`, `primary`, or `comparison`.

## 8. Visualization Contract

Every substantive user-facing conclusion should have an appropriate figure, table, or structured summary. Choose the simplest visualization that communicates the result accurately.

Figures should normally include:

- descriptive title
- labeled axes and units
- readable legend
- sample size or aggregation level when relevant
- statistical method or transformation when relevant
- accessible colors and sufficient contrast

Save the exact plotted table or matrix in `process/` when it is not directly recoverable from a canonical input.

## 9. Fast Feedback and Verification

Prefer the smallest meaningful check before a full run:

1. inspect headers, dimensions, schemas, and a small representative slice
2. validate selected samples and source paths
3. run a smoke-scale analysis or plot
4. inspect numerical sanity and generated artifacts
5. expand only after the small path is correct

Do not impose test-driven development on routine analysis. Use reproducible commands, syntax checks, data-shape assertions, lightweight smoke runs, and artifact inspection. Add formal tests when reusable library logic or a stable workflow interface justifies them.

## 10. Project Preference Rules

Before selecting a language, package, or environment, inspect relevant project guidance and existing files such as `AGENTS.md`, README files, environment definitions, lockfiles, and nearby scripts.

Priority:

1. explicit user choice
2. established project convention
3. existing reproducible environment
4. simplest suitable method

Do not modify global environments or install dependencies without approval. Record the environment and versions used.

## 11. Legacy and Migration Rules

Existing analysis directories are evidence, not disposable clutter.

- Do not move, rename, delete, or reorganize legacy runs automatically.
- New work follows the routed single-run-root contract.
- When a historical analysis must be rerun, create a new routed run and reference the legacy path explicitly.
- Before any migration, inventory current paths, statuses, source sets, scripts, results, records, and external dependencies.
- Preserve a path-mapping and provenance manifest.
- Regenerate or wrap outputs in the new structure before deprecating an old path.
- Treat uncertain finality as `unknown`; do not infer `final` from filenames.

Registry updates are user-controlled. When the user asks to preserve a pattern, palette, script, or plotting convention, propose the exact `.analysis_manifest.md` or `.analysis_patterns/` diff first and apply it only after confirmation.

## Anti-Patterns

Do not:

- create a new analysis root without resolving the project route
- create date-prefixed sub-analyses inside a run
- recursively load every project pattern at startup
- copy the same reusable script into many runs
- hide source-set or manual-curation identity in filenames alone
- mix intermediates and final deliverables without a manifest
- overwrite results without documenting what changed
- add a custom CLI, service, plugin, or database merely to manage filesystem routing
- create one skill per visualization
- destructively reorganize historical analyses before a validated inventory and migration plan

## Done Criteria

An analysis is complete only when:

1. it lives at the manifest-resolved `<route>/<run_name>/`
2. it has the required `script/`, `process/`, `result/`, and `docs/` structure
3. inputs, source sets, parameters, code, intermediates, and outputs are traceable
4. final conclusions have clear visual or tabular evidence
5. experiment documentation matches actual artifact paths
6. reusable project patterns were resolved lazily and recorded when used
7. no unrelated or legacy path was modified

## Practical Placement Rule

- Executable logic -> `script/`
- Intermediate derivation, manifest, or log -> `process/`
- Final answer artifact -> `result/`
- Method, record, interpretation, or limitation -> `docs/`
