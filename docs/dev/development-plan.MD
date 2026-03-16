# Development Plan

## Planning Principles

- Keep the product focused on tactical metadata authoring and review.
- Treat edge-based blocking as the core tactical representation, not a later enhancement.
- Treat the map sidecar as a product-neutral contract that must be consumable by multiple applications, especially a VTT.
- Prefer game-agnostic world semantics in the universal schema and leave rules interpretation to game-specific adapters.
- Stabilize before expanding into additional terrain semantics.
- Prefer testable, documented schema work over fast feature accumulation.
- Treat AI as assistive drafting, not authoritative labeling.
- Treat gold-label creation and training-data quality as first-class outputs of the tool, not just byproducts.
- Avoid investing further in whole-tile blocking beyond what is needed for migration.
- Keep app-specific workflow state separate from the universal sidecar whenever possible.
- Avoid embedding system terms like `half_cover` in the core contract unless they are explicitly namespaced as ruleset-specific extensions.
- Optimize heavily for high-throughput reviewer navigation across large map sets.
- Plan for multiple labelers, reviewer assignment, and conflict resolution from the start if shared or public deployment is a possibility.
- Define compatibility, auditability, accessibility, and restore expectations early enough that they shape the implementation instead of becoming cleanup work.
- Assume the likely production shape is Vercel for the frontend and Render for backend/API services, and make architecture choices that fit that split deployment model.

## Phase 0: Restore Baseline Operability

### Goal

Get the checked-in app back to a reliably runnable state.

### Outcomes

- Frontend loads without syntax/runtime errors.
- Existing sample maps can be opened, edited, saved, and drafted.
- README no longer contradicts the shipped UI.
- The codebase is ready for an edge-model migration without adding more tile-model coupling.
- The project is positioned to separate universal sidecar data from TacticsCanvas-only review metadata.
- Basic case-to-case navigation is reliable enough to support future high-speed review workflows.

### Tasks

- Fix the `makeGrid` redeclaration in [public/app.js](/home/witschey/TacticsCanvas/public/app.js#L101).
- Remove source-control noise such as [public/mapMetadata.js:Zone.Identifier](/home/witschey/TacticsCanvas/public/mapMetadata.js:Zone.Identifier).
- Perform a manual smoke test across:
  - upload
  - load existing case
  - paint/erase
  - ambiguous toggle
  - save
  - AI draft
  - accept/clear AI
  - case navigation
- Identify current navigation friction points:
  - number of clicks to move to next case
  - ability to jump to a named case
  - speed of moving to "next needs review"
  - visibility of unsaved changes during navigation
- Freeze nonessential work on tile-only blocking behavior until the edge schema is defined.
- Update [README.md](/home/witschey/TacticsCanvas/README.md) to reflect the actual workflow.

### Exit Criteria

- `node --check server.js` passes
- `node --check public/app.js` passes
- one human-verified smoke test run completes successfully

## Phase 1A: Schema Decisions And Label-State Model

### Goal

Define the edge-based shared contract, decide label-state ownership, and remove ambiguity before implementation work begins.

### Outcomes

- One documented persisted sidecar schema
- Edge blocking is the primary representation
- The persisted sidecar can be used by TacticsCanvas, a VTT, and other tooling without embedding TacticsCanvas-specific workflow assumptions
- The universal schema is prepared for richer tactical metadata without becoming D&D-specific
- The universal schema has a clear place for grid alignment and suggested grid-size metadata as map facts or setup hints
- The system has an explicit lifecycle for `ai_draft`, `working`, `reviewed`, and `gold` labels
- Ownership of label states is defined clearly enough to support overlay/diff views without schema churn
- The model supports multiple independent label sessions on the same map before adjudication

### Tasks

- Decide whether [public/mapMetadata.js](/home/witschey/TacticsCanvas/public/mapMetadata.js) becomes the canonical contract.
- Separate universal tactical-map fields from application-specific fields.
- Define extension rules so app-specific metadata can exist without polluting the core shared contract.
- Define the distinction between:
  - world-state metadata in the universal core
  - game-system interpretation in ruleset adapters or namespaced extensions
- Design and document an edge-based schema with explicit ownership of north/east/south/west boundaries or an equivalent canonical edge encoding.
- Decide how perimeter edges are stored and validated.
- Define the minimum interoperable core that every consumer must understand:
  - schema version
  - map/image identity
  - grid definition
  - suggested tile size and grid alignment hints
  - edge blocking representation
  - optional extension container
- Define a minimal reference consumer profile for downstream integrations:
  - required fields
  - optional fields
  - ignored fields
  - compatibility expectations for a first VTT consumer
- Identify future tactical metadata categories that should remain generic in the core, such as:
  - movement cost or traversability modifiers
  - line-of-effect or line-of-sight interference
  - elevation or height bands
  - interactable boundaries such as doors, gates, or windows
  - occupancy or footprint hints for large static objects
- Decide which concepts should not be part of the universal core:
  - D&D 5e half cover
  - system-specific action costs
  - ruleset-specific hazard mechanics
- Define migration rules from existing whole-tile blocking into edge-based data:
  - which tile patterns map cleanly to edges
  - which cases are lossy or ambiguous
  - how ambiguity is surfaced for review
- Decide where each label state lives:
  - AI draft
  - current working label
  - reviewed label
  - gold label
- Decide what is canonical for downstream consumers:
  - only gold
  - latest reviewed
  - configurable release channel
- Define the label lifecycle and promotion rules:
  - AI draft -> working
  - working -> reviewed
  - reviewed -> gold
  - gold supersession/versioning
- Decide whether multi-labeler disagreement is represented:
  - in app-local workflow storage
  - in namespaced extensions
  - in separate adjudication artifacts
- Decide how multiple labelers on one map are modeled:
  - parallel label sessions per map
  - branch-from-gold or branch-from-reviewed workflows
  - immutable snapshots versus mutable per-labeler drafts
- Define whether adjudication produces:
  - a new reviewed label
  - a new gold label
  - or both
- Define the persistence model for annotation work:
  - sidecar-only persistence
  - sidecar plus workflow store
  - database-backed label sessions
  - append-only revision history versus mutable records
- Define the publish/release model for downstream consumers:
  - draft versus published outputs
  - map-level release version
  - rollback/version history policy
- Create and maintain a standalone schema specification that is not framed as a TacticsCanvas-only document.

### Exit Criteria

- the shared schema is documented and versioned
- the ownership of gold, working, and AI label states is explicitly defined
- the ownership of multiple simultaneous label sessions on one map is explicitly defined
- the team has chosen what downstream consumers should treat as canonical
- the team has chosen how label sessions are persisted and how canonical outputs are published
- the universal schema can express generic tactical facts without requiring a specific game system
- a minimal downstream compatibility profile is documented for consumer implementations

## Phase 1B: Schema Implementation And Migration

### Goal

Implement the chosen schema decisions, migrate legacy data safely, and reduce codepath drift.

### Outcomes

- One canonical in-memory metadata model
- Legacy tile-blocking sidecars still import safely during migration
- schema handling is centralized enough to support later UI work
- the chosen persistence and release model is implemented well enough to support multi-labeler workflows

### Tasks

- Refactor [public/app.js](/home/witschey/TacticsCanvas/public/app.js) to operate on normalized objects instead of ad hoc legacy mutations.
- Move server-side metadata handling into a shared module.
- Add validation before save and clear user-facing errors for invalid sidecars.
- Implement migration/import behavior for legacy tile-based files.
- Add round-trip handling for the chosen label-state model.
- Implement the chosen persistence strategy for same-map label sessions.
- Implement a canonical publish/release path for downstream-consumable outputs.

### Exit Criteria

- round-trip load/normalize/edit/serialize/save is deterministic
- legacy sample sidecars load with documented migration behavior
- edge arrays or edge objects validate consistently for all grid sizes
- TacticsCanvas-specific review fields no longer need to live in the universal core schema unless intentionally namespaced
- the publish path produces deterministic consumer-facing outputs
- no duplicated schema logic remains in more than one place without a clear owner

## Phase 2: Semantic Model And Automated Verification

### Goal

Add enough test coverage to refactor confidently.

### Outcomes

- fixture-based tests for metadata normalization and migration
- endpoint tests for save/load/draft summary flows
- lightweight CI entrypoint via `npm test`
- interoperability fixtures that prove the sidecar can be consumed outside TacticsCanvas
- semantic fixtures that prove multiple game systems can interpret the same sidecar differently without schema changes
- fixture coverage for grid alignment and suggested tile-size metadata
- fixture coverage for gold-label, AI-label, and diff-view comparison states
- fixture coverage for multi-labeler review and adjudication states
- fixture coverage for multiple concurrent label sessions on the same map
- fixture coverage for publish/release behavior and revision history
- fixture coverage for reference-consumer compatibility expectations

### Tasks

- Add a test runner and a `test` script to [package.json](/home/witschey/TacticsCanvas/package.json).
- Create fixtures from current sample maps and sidecars.
- Test:
  - normalized validation
  - serialization
  - tile-to-edge migration behavior
  - edge validation on perimeter and interior boundaries
  - grid resizing behavior for edge data
  - grid alignment and suggested tile-size persistence
  - generic semantic layers independent of any one ruleset
  - diff generation between gold, AI, and working labels
  - label lifecycle transitions
  - conflict/adjudication state handling for multiple labelers
  - multiple same-map label sessions and pairwise comparisons
  - publish/release transitions and rollback behavior
  - case summary metrics
  - API route success/failure paths
- Add cross-consumer fixtures and contract tests for at least:
  - TacticsCanvas
  - a VTT-oriented consumer shape or adapter
- Validate the reference consumer profile against fixtures that intentionally omit optional fields.
- Add ruleset-interpretation fixtures for at least two distinct systems, where the same geometry/terrain data yields different gameplay meanings.
- Add a mockable seam around OpenAI requests.
- Add golden fixtures for edge-based sidecars once the schema is finalized.

### Exit Criteria

- schema migration behavior is covered by tests
- lossy tile-to-edge conversions are explicitly detectable
- game-specific meaning is shown to live outside the universal core contract
- endpoint regressions are caught without manual browser testing

## Phase 3: Annotation Workflow And Fast Navigation

### Goal

Make annotation practical, high-throughput, and reliable for day-to-day review work.

### Outcomes

- clearer review states
- better operator ergonomics
- safer save and navigation flows
- an operator can edit and inspect walls by edge rather than painting whole blocked tiles
- TacticsCanvas review workflow remains layered on top of, not baked into, the shared sidecar contract
- future non-blocking tactical metadata can be edited in a way that still preserves game neutrality
- map-to-map movement is fast enough for sustained labeling sessions across large datasets
- grid alignment and suggested tile-size labeling are first-class annotation tasks
- gold labels, AI labels, and their differences can be overlaid clearly in the UI
- scope is intentionally limited to blocking plus grid/alignment workflows until the post-stabilization expansion phase
- reviewers can compare multiple labelers’ work on the same map without leaving the map context
- overlay rendering remains responsive even on large maps with multiple comparison layers enabled
- overlay/diff UI remains usable under accessibility and target-hardware constraints

### Tasks

- Replace tile paint/erase interaction with edge-aware editing tools.
- Add clear visual rendering for blocked edges versus open boundaries.
- Add overlay and comparison modes for:
  - gold labels
  - current working labels
  - AI draft labels
  - gold vs AI diff
  - gold vs current diff
  - labeler A vs labeler B diff on the same map
- Add dedicated labeling controls for:
  - suggested tile size
  - grid anchor/alignment
  - grid rotation when needed
- Decide how ambiguous review works for edges:
  - ambiguous edge
  - ambiguous tile region
  - both
- Move reviewer-specific state into either app-local storage or explicitly namespaced sidecar extensions.
- Add unsaved-change protection.
- Improve keyboard shortcuts and affordances.
- Add visual diff affordances that make disagreements obvious at a glance:
  - color-coded overlays
  - counts and summary metrics
  - jump-to-next-difference
  - optional filter to show only disagreement regions
- Add same-map multi-labeler review tools:
  - switch active label session
  - compare two labelers side-by-side or overlaid
  - jump to next inter-annotator disagreement
  - adjudicate disagreement into reviewed/gold output
- Make navigation "super easy and fast" by adding:
  - single-keystroke next/previous case navigation
  - save-and-next as a primary action
  - jump-to-case search
  - persistent filtered work queues
  - instant next-needs-review routing
  - optional preloading of adjacent cases
  - visible unsaved-state handling during navigation
- Set concrete navigation performance targets:
  - move to next already-loaded case in under 100 ms
  - move to next queued case with preload in under 300 ms on target hardware
  - reach next-difference in one interaction
  - save-and-next in one primary action
- Set concrete rendering performance targets:
  - overlay redraw under 100 ms for target map sizes on target hardware
  - diff recomputation under 150 ms for target map sizes
  - no visible UI stall when toggling between gold/AI/current overlays on target hardware
- Define the benchmark environment for performance claims:
  - supported browser baseline
  - target hardware class
  - representative map dimensions
  - representative overlay complexity
- Add accessibility requirements for annotation UI:
  - keyboard-only navigation for core workflows
  - non-color-only diff cues
  - colorblind-safe comparison palettes
  - readable contrast for overlay modes
- Make case filtering/sorting persist across sessions.
- Add richer per-case status metadata:
  - assigned reviewer
  - review timestamps
  - confidence or rationale fields
- Add explicit "mark ready for review" and "approve" workflow actions.

### Exit Criteria

- a reviewer can process a batch of maps without JSON editing
- the reviewer can identify and edit an individual wall segment without tile hacks
- a reviewer can move through a labeling queue in one primary action per case transition
- next/previous case navigation meets the documented latency target on target hardware
- grid alignment and suggested tile-size labels can be edited without raw JSON
- reviewers can visually compare gold, AI, and working labels without exporting data or reading raw JSON
- reviewers can compare multiple labelers on the same map and adjudicate disagreements in-map
- overlay and diff views meet the documented rendering target on target hardware
- core workflows meet the documented accessibility expectations
- common mistakes are recoverable without data loss

## Phase 4: Annotation Program, Dictionaries, And Dataset Operations

### Goal

Support repeatable dataset preparation and gold-label production beyond one-off map uploads.

### Outcomes

- documented ingestion conventions
- batch-friendly dataset structure
- preflight checks before maps enter review
- a clear distinction between shared sidecar data and optional app-specific extensions
- imported datasets can carry generic tactical semantics without assuming one target game
- a documented annotation dictionary/taxonomy exists for each supported semantic layer
- the tool can produce training-ready labeled outputs for AI-assisted annotation workflows
- label governance is strong enough to support multiple labelers and adjudicated gold data
- per-map multi-labeler workflows are documented well enough to support agreement studies
- training/export outputs have explicit quality gates before they are considered usable
- exported datasets carry enough history and provenance to be audited later

### Tasks

- Define accepted filename conventions and sidecar expectations.
- Define annotation dictionaries for core labeling tasks, including:
  - blocking boundaries
  - visibility/obscuration
  - traversal cost
  - elevation
  - grid alignment
  - suggested tile size
- Define what counts as:
  - gold label
  - reviewed label
  - AI draft
  - ambiguous label
- Define labeling-governance rules:
  - who can create working labels
  - who can review
  - who can promote to gold
  - how conflicting labels are adjudicated
  - when a gold label must be re-opened
- Define how multiple labelers are assigned to the same map:
  - intentional overlap sampling
  - blind duplicate labeling
  - adjudication-trigger thresholds
- Define data-quality gates for training/export eligibility:
  - minimum review status
  - minimum agreement thresholds where duplicate labels exist
  - mandatory adjudication cases
  - excluded-case handling
- Version labeling guidelines and dictionary definitions so training data provenance is reproducible.
- Add a dataset scan/preflight utility.
- Detect missing sidecars, duplicate names, dimension mismatches, invalid grids, and invalid edge structures.
- Validate that exported sidecars remain usable even when TacticsCanvas-only metadata is absent.
- Validate that generic semantic layers remain namespaced and ruleset-neutral in the universal schema.
- Consider a small CLI for:
  - import
  - validate
  - summarize
  - migrate schema versions
- Add export tooling for training-oriented datasets:
  - sidecar export
  - reviewer status export
  - gold-label subset export
  - optional prompt/response audit export for AI-assisted labeling analysis
- Define audit/history requirements for labeling data:
  - who changed what
  - when it changed
  - before/after state or revision reference
  - how adjudication history is retained
- Define dataset splits and provenance tracking for future model training or evaluation.
- Add migration reporting for tile-blocked legacy assets that need manual edge review.

### Exit Criteria

- a new dataset can be ingested with repeatable steps and validation output
- the team can produce a curated, training-ready subset of labeled maps with known provenance
- gold labels have documented reviewer and adjudication provenance
- same-map duplicate labels can be exported for inter-annotator agreement analysis
- exported training subsets meet documented quality gates

## Phase 5: AI-Assisted Annotation And Label Quality

### Goal

Make AI-assisted annotation useful for throughput while preserving gold-label quality.

### Outcomes

- AI assistance supports multiple annotation targets, not just blocking
- AI outputs can be compared against human gold labels
- the system can improve future annotation performance through curated data
- reviewers have first-class UI support for understanding where AI and gold labels diverge
- quality evaluation supports comparison across AI, single-labeler, and multi-labeler outputs

### Tasks

- Expand AI-assisted annotation planning beyond blocking to include:
  - grid alignment suggestions
  - suggested tile-size suggestions
  - candidate semantic layer drafts where appropriate
- Define which tasks are suitable for AI drafting versus human-only labeling.
- Record enough provenance to evaluate AI quality:
  - model used
  - prompt version
  - draft timestamp
  - reviewer outcome
- Record enough provenance to evaluate human agreement quality:
  - labeler identity
  - reviewer identity
  - adjudicator identity where applicable
- Add disagreement metrics between AI suggestions and final labels.
- Add disagreement metrics between multiple human labelers where applicable.
- Add inter-annotator agreement metrics for the same map:
  - boundary-level agreement
  - semantic-layer agreement
  - pre-adjudication versus post-adjudication comparisons
- Add UI workflows for AI-vs-gold review:
  - overlay toggles
  - disagreement summaries
  - next-difference navigation
  - reviewer accept/reject flows where appropriate
- Add export paths for training/evaluation datasets based on reviewed labels.
- Add support for annotation dictionaries or class maps that future training pipelines can consume.

### Exit Criteria

- AI assistance improves operator throughput without obscuring final gold-label ownership
- reviewed labels can be exported for future training/evaluation work
- grid alignment and suggested tile-size suggestions are supported as assistive tasks if they prove reliable
- quality metrics support comparison across AI, single-labeler, and multi-labeler outputs
- same-map multi-labeler output can be analyzed without custom manual data extraction

## Phase 6: Deployment and Operationalization

### Goal

Make the tool easy to run repeatedly by others in a controlled environment.

### Outcomes

- reproducible deployment path
- basic operational safeguards
- supportable runtime configuration
- schema/version discipline that supports multiple downstream consumers
- deployment model can support a shared or public-facing multi-labeler workflow if needed
- public-facing deployment requirements are documented beyond basic authentication
- deployment is aligned with the intended Vercel + Render split
- backup, restore, and audit retention expectations are documented
- provenance/privacy expectations are documented for shared deployments

### Tasks

- Add environment-variable documentation and startup checks.
- Add production-friendly logging and error handling.
- Add version visibility for the active metadata schema so operators know whether they are handling tile-legacy or edge-native cases.
- Publish schema version compatibility guidance for downstream consumers such as the VTT.
- Define authentication and authorization roles for shared deployment:
  - labeler
  - reviewer
  - adjudicator/admin
- Define the split-deployment responsibilities:
  - Vercel hosts frontend/UI
  - Render hosts backend/API and any persistent workflow services
- Define which state cannot live in a Vercel-only environment:
  - label sessions
  - adjudication state
  - publish/release history
  - audit logs
- Decide on deployment target:
  - local workstation only
  - Render + Vercel shared deployment
  - protected internal deployment if needed
- Add process management guidance and backup strategy for `data/maps` and `data/logs`.
- Define storage strategy compatible with Render + Vercel:
  - object/file storage for map assets and sidecars
  - durable store for workflow/session data
  - separation of immutable published artifacts from mutable annotation state
- Define backup and restore expectations:
  - backup scope
  - retention windows
  - restore testing cadence
  - recovery priority for sidecars, label sessions, and adjudication history
- Define privacy/security expectations for stored provenance data:
  - user identifiers collected
  - retention policy
  - access restrictions
  - export/redaction policy where needed
- If exposure broadens, add:
  - auth
  - per-user auditing
  - concurrency-safe saves / optimistic locking
  - file-type validation and upload scanning
  - storage quotas and retention policy
  - abuse monitoring / moderation workflow
  - upload restrictions
  - path sanitization
  - rate limiting

### Exit Criteria

- a new operator can deploy from the runbook without guesswork

## Phase 7: Deliberate Feature Expansion

### Goal

Expand the metadata model only after the core system is stable.

### Candidate features

- movement cost / traversability metadata
- visibility / obscuration metadata
- interactable boundary metadata
- elevation metadata
- hazard metadata
- calibration controls
- ruleset-specific adapter packs such as D&D 5e interpretation layers

### Preconditions

- edge blocking is fully canonical
- legacy tile cases have a migration path
- reviewers no longer need to rely on whole-tile blocking for wall definition
- the shared sidecar contract is stable enough for multiple applications to implement against
- the team has decided which future semantics belong in the universal core versus in ruleset-specific interpretation layers

### Rule

Do not expand the tactical schema until Phases 0 through 3 are substantially complete. Otherwise the project risks compounding instability on top of an unresolved schema foundation.

## Recommended Near-Term Sequence

1. Finish Phase 0 immediately.
2. Complete Phase 1A before committing to overlay/diff UI or training-data exports.
3. Run Phase 2 alongside Phase 1B, because edge conversion without tests will be brittle.
4. Move to Phase 3 once save/load/schema behavior and label-state ownership are trustworthy.
5. Use Phases 4 and 5 to formalize the annotation program, training data, and AI-assist quality loop.
6. Treat Phase 6 as operational readiness work.
7. Revisit Phase 7 only after the tool is stable for repeated reviewer use.

## Success Definition

This project is succeeding when:

- the app loads cleanly every time
- sidecars are consistent and documented
- edge-based wall data is the default representation
- the sidecar is a universal tactical metadata contract rather than a TacticsCanvas-specific file format
- the same sidecar can support multiple game systems through interpretation rather than duplicated schemas
- reviewers can navigate large map queues extremely quickly
- the tool can produce gold-label datasets and annotation dictionaries for future AI-assisted labeling improvements
- shared deployments can support multiple labelers with clear review and adjudication flows
- a single map can safely support multiple concurrent label sessions with clear adjudication flows
- public-facing deployments have documented safety, storage, and abuse controls
- compatibility expectations for downstream consumers are documented and testable
- audit, restore, accessibility, and privacy requirements are treated as part of the product, not post-launch cleanup
- reviewers can process cases without touching raw JSON
- regressions are caught by tests
- new sessions can continue work from docs instead of rediscovery
