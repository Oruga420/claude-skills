# Media routing: Higgsfield and Replicate

## Decide whether generation is requested

A request for a prompt ends with the complete prompt, including all constraints. Do not submit a job. A website request alone is not permission to generate imagery: prefer supplied assets, the real product, or an intentional composition that works without invented pictures. For an actual image request, preserve subject, composition, aspect ratio, typography, reference identities and negative constraints. Return the full final prompt when asked, even after revisions.

`node <skill-dir>/scripts/media-plan.mjs <brief.json>` produces an offline handoff. It accepts `kind` (`prompt`, `image`, `video`), `prompt`, optional `provider` (`higgsfield`, `replicate`, `auto`), `constraints`, `references`, `aspect_ratio`, `count`, `budget_usd` and `generation_authorized`. It never reads credentials, uploads, creates a project or calls a provider. The authorization field is a planning note, not independent proof of approval. The executing agent must check the current request.

Choose the user's named provider; otherwise use an available authorized connection that meets the requirement. Prefer connected MCP tools. Discover current tools, models, schemas, media roles, prices and account limits; do not invent or pin a model ID from this document. If a provider is unavailable, explain that and offer an available authorized alternative without submitting elsewhere. A new provider or subscription needs approval. Do not install a new MCP or write persistent keys or `.env` files as part of this skill.

## Higgsfield through the agent

Use the connected Higgsfield skill and current tool schemas. Current capabilities include model discovery (`models_search`, `models_recommend`, `models_get`), image cost estimation, image submission and job polling. The current image tool uses `generate_image({params:{model,prompt,aspect_ratio,count,medias:[{role,value}]}})`; check the runtime schema rather than treating this example as timeless. Use only model-supported input roles and parameters. Pass references only when the user authorized their use with that provider.

Estimation with HTTPS references can fetch and upload those files; it is not always a read-only operation. First establish that sending those references is in scope. Confirm any required workspace/project choice using the provider's normal flow without creating unrequested public assets.

Submit only the authorized job/count after cost and scope are known. Record returned job IDs, then poll using the provider's wait guidance (`poll_after_seconds` where present; current `jobs_wait` accepts at most 8 IDs and a 15-second wait). A timeout is not evidence of failure: check the known job before another submission. Never retry a possibly accepted paid generation blindly. A Node script cannot call the agent's MCP directly; the plan is handed back to the agent.

## Replicate

Prefer an available authorized Replicate MCP. If none is connected, a direct API route can use **only an already available** `REPLICATE_API_TOKEN` for an authorized request. Do not print the token, put it in a URL, save it in the repo, copy another application's credentials or create persistence. If no authorized credential exists, prepare the full prompt and report the missing connection.

Read the current official [HTTP reference](https://replicate.com/docs/reference/http). Discover the selected model and `latest_version.openapi_schema` before forming inputs. Official models support `POST /v1/models/{owner}/{name}/predictions`; other predictions use `POST /v1/predictions` with a verified version. Runtime schema and current docs determine which endpoint and input fields apply. Do not hardcode a model, version, price or input key beyond what discovery confirms.

Read the prediction ID and returned status URLs. `Prefer: wait` is a wait window, not a total execution deadline; consult `Cancel-After` when a bounded run is needed. Poll the existing prediction after uncertain outcomes, with a bounded wait and no duplicate paid resubmission. Preserve the requested provider and budget; do not auto-switch to a different paid route.

Outputs can expire (typically around an hour), so retrieve confirmed results promptly. Follow [output-file guidance](https://replicate.com/docs/topics/predictions/output-files): validate HTTPS source, response MIME and actual image/video data, retain safe filenames, and never forward API authorization headers to a CDN or arbitrary output URL. Save provenance (provider, discovered model/version, prompt, job ID, result and actual known cost) without secrets. State when cost is an estimate rather than measured.

## Evaluate the result

Inspect generated images for the requested content, legible text, reference fidelity, artifacts, crop and real usefulness in the design. A technically successful job can still be the wrong image. Ask before adding unapproved paid retries. Generated imagery must not masquerade as a factual product screenshot, testimonial or photograph of an actual event.
