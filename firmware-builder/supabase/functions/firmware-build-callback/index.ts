import { createClient } from "npm:@supabase/supabase-js@2.119.1";
import { unzipSync } from "npm:fflate@0.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const CALLBACK_SECRET = Deno.env.get("BUILDER_CALLBACK_SECRET") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function failBuild(buildId: string, code: string) {
  await supabase.from("firmware_builds").update({
    status: "failed",
    finished_at: new Date().toISOString(),
    callback_claimed_at: null,
    error_code: code,
    error_message_safe: "The build artifact could not be verified or stored. Please retry the build.",
  }).eq("id", buildId).in("status", ["queued", "building"]);
}

async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function readBodyBounded(req: Request, maxBytes: number) {
  if (Number(req.headers.get("content-length")) > maxBytes) throw new Error("body_too_large");
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readResponseBounded(response: Response, maxBytes: number) {
  if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("response_too_large");
  if (!response.body) throw new Error("response_body_missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("response_too_large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

const EXPECTED_REPOSITORY_ID = 1458391655;
const EXPECTED_WORKFLOW_IDS: Record<string, number> = {
  via_wifi: 421296915,
  via_chronos: 423651921,
  mochi_chronos: 423852508,
};
const MAX_ARTIFACT_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_EXPANDED_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_ADVANCED_ZIP_BYTES = 10 * 1024 * 1024;
const MAX_BUILD_INFO_BYTES = 128 * 1024;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!CALLBACK_SECRET || !GITHUB_TOKEN) {
    return json({ error: "callback_backend_not_configured" }, 503);
  }

  const auth = req.headers.get("authorization") ?? "";
  if (!constantTimeEqual(auth, "Bearer " + CALLBACK_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await readBodyBounded(req, 16 * 1024);
    body = JSON.parse(new TextDecoder().decode(raw));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid");
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "body_too_large" ? "request_too_large" : "invalid_json" }, 400);
  }

  const buildId = body.build_id;
  const event = body.event;
  const runId = Number(body.run_id);
  const runAttempt = Number(body.run_attempt || 1);
  const sourceSha = typeof body.source_commit_sha === "string" ? body.source_commit_sha : null;

  if (typeof buildId !== "string" || !/^[0-9a-f-]{36}$/i.test(buildId)) {
    return json({ error: "invalid_build_id" }, 400);
  }
  const { data: build, error: lookupError } = await supabase
    .from("firmware_builds")
    .select("id,variant,status,github_run_id,started_at")
    .eq("id", buildId)
    .maybeSingle();
  if (lookupError) return json({ error: "build_lookup_failed" }, 500);
  if (!build) return json({ error: "build_not_found" }, 404);

  if (event === "started") {
    if (build.status !== "queued" && build.status !== "building") {
      return json({ error: "build_state_conflict" }, 409);
    }
    if (!Number.isSafeInteger(runId) || runId <= 0
        || !Number.isSafeInteger(runAttempt) || runAttempt < 1
        || !sourceSha || !/^[a-f0-9]{40,64}$/i.test(sourceSha)) {
      return json({ error: "invalid_workflow_identity" }, 400);
    }
    if (build.github_run_id && Number(build.github_run_id) !== runId) {
      return json({ error: "github_run_identity_mismatch" }, 403);
    }
    const { data: updated, error } = await supabase.from("firmware_builds").update({
      status: "building",
      github_run_id: runId,
      github_run_attempt: runAttempt,
      source_commit_sha: sourceSha,
      started_at: build.started_at ?? new Date().toISOString(),
      error_code: null,
      error_message_safe: null,
    }).eq("id", buildId).in("status", ["queued", "building"])
      .or("github_run_id.is.null,github_run_id.eq." + runId)
      .select("id").maybeSingle();
    if (error) return json({ error: "build_update_failed" }, 500);
    if (!updated) return json({ error: "build_state_conflict" }, 409);
    return json({ ok: true, status: "building" });
  }

  if (event !== "completed") return json({ error: "unsupported_event" }, 400);
  if (build.status !== "queued" && build.status !== "building") {
    return json({ error: "build_state_conflict" }, 409);
  }
  if (!Number.isSafeInteger(runId) || runId <= 0
      || !Number.isSafeInteger(runAttempt) || runAttempt < 1
      || !sourceSha || !/^[a-f0-9]{40,64}$/i.test(sourceSha)) {
    return json({ error: "invalid_workflow_identity" }, 400);
  }
  if (build.github_run_id && Number(build.github_run_id) !== runId) {
    return json({ error: "github_run_identity_mismatch" }, 403);
  }

  const jobStatus = body.job_status;
  const artifactId = Number(body.artifact_id);
  if (jobStatus !== "success" || !Number.isSafeInteger(artifactId) || artifactId <= 0) {
    const finalStatus = jobStatus === "cancelled" ? "cancelled" : "failed";
    const { data: updated, error } = await supabase.from("firmware_builds").update({
      status: finalStatus,
      github_run_id: runId,
      github_run_attempt: runAttempt,
      source_commit_sha: sourceSha,
      finished_at: new Date().toISOString(),
      error_code: jobStatus === "cancelled" ? "build_cancelled" : "build_failed",
      error_message_safe: "The firmware build did not complete successfully.",
    }).eq("id", buildId).in("status", ["queued", "building"])
      .select("id").maybeSingle();
    if (error) return json({ error: "build_update_failed" }, 500);
    if (!updated) return json({ error: "build_state_conflict" }, 409);
    return json({ ok: true, status: finalStatus });
  }

  if (!Number.isSafeInteger(runId) || runId <= 0
      || (build.github_run_id && Number(build.github_run_id) !== runId)) {
    return json({ error: "github_run_identity_mismatch" }, 403);
  }

  const { data: claimResult, error: claimError } = await supabase.rpc(
    "claim_firmware_build_callback",
    { p_build_id: buildId, p_run_id: runId, p_lease_seconds: 1800 },
  );
  if (claimError) return json({ error: "callback_claim_failed" }, 503);
  if (claimResult !== true) return json({ error: "callback_already_processing" }, 409);

  const artifactMetaResponse = await fetch(
    "https://api.github.com/repos/MazBayID/esp_clock/actions/artifacts/" + artifactId,
    {
      headers: {
        "Authorization": "Bearer " + GITHUB_TOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "NEO-CLOCK-Firmware-Builder",
      },
    },
  );
  if (!artifactMetaResponse.ok) {
    await failBuild(buildId, "github_artifact_metadata_failed");
    return json({ error: "github_artifact_metadata_failed" }, 502);
  }
  const artifactMeta = await artifactMetaResponse.json();
  const workflowRun = artifactMeta.workflow_run ?? {};
  if (artifactMeta.expired
      || Number(workflowRun.id) !== runId
      || Number(workflowRun.repository_id) !== EXPECTED_REPOSITORY_ID
      || workflowRun.head_sha !== sourceSha
      || !Number.isSafeInteger(Number(artifactMeta.size_in_bytes))
      || Number(artifactMeta.size_in_bytes) < 1
      || Number(artifactMeta.size_in_bytes) > MAX_ARTIFACT_ARCHIVE_BYTES) {
    await failBuild(buildId, "github_artifact_metadata_mismatch");
    return json({ error: "github_artifact_metadata_mismatch" }, 403);
  }

  const workflowRunResponse = await fetch(
    "https://api.github.com/repos/MazBayID/esp_clock/actions/runs/" + runId,
    {
      headers: {
        "Authorization": "Bearer " + GITHUB_TOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "NEO-CLOCK-Firmware-Builder",
      },
    },
  );
  if (!workflowRunResponse.ok) {
    await failBuild(buildId, "github_workflow_metadata_failed");
    return json({ error: "github_workflow_metadata_failed" }, 502);
  }
  const runMeta = await workflowRunResponse.json();
  if (Number(runMeta.id) !== runId
      || Number(runMeta.repository?.id) !== EXPECTED_REPOSITORY_ID
      || Number(runMeta.workflow_id) !== EXPECTED_WORKFLOW_IDS[build.variant]
      || runMeta.head_sha !== sourceSha
      || Number(runMeta.run_attempt) !== runAttempt) {
    await failBuild(buildId, "github_workflow_identity_mismatch");
    return json({ error: "github_workflow_identity_mismatch" }, 403);
  }

  const artifactResponse = await fetch(
    "https://api.github.com/repos/MazBayID/esp_clock/actions/artifacts/" + artifactId + "/zip",
    {
      headers: {
        "Authorization": "Bearer " + GITHUB_TOKEN,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "NEO-CLOCK-Firmware-Builder",
      },
    },
  );
  if (!artifactResponse.ok) {
    await failBuild(buildId, "github_artifact_download_failed");
    return json({ error: "github_artifact_download_failed" }, 502);
  }

  let archiveBytes: Uint8Array;
  try {
    archiveBytes = await readResponseBounded(artifactResponse, MAX_ARTIFACT_ARCHIVE_BYTES);
  } catch {
    await failBuild(buildId, "artifact_archive_too_large");
    return json({ error: "artifact_archive_too_large" }, 413);
  }
  if (archiveBytes.byteLength !== Number(artifactMeta.size_in_bytes)) {
    await failBuild(buildId, "artifact_archive_size_mismatch");
    return json({ error: "artifact_archive_size_mismatch" }, 422);
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(archiveBytes);
  } catch {
    await failBuild(buildId, "artifact_archive_invalid");
    return json({ error: "artifact_archive_invalid" }, 422);
  }

  const expectedFiles = ["advanced-bin.zip", "build-info.json", "merged.bin"];
  const actualFiles = Object.keys(files).sort();
  if (actualFiles.length !== expectedFiles.length
      || actualFiles.some((name, index) => name !== expectedFiles[index])) {
    await failBuild(buildId, "artifact_file_set_invalid");
    return json({ error: "artifact_file_set_invalid" }, 422);
  }
  const merged = files["merged.bin"];
  const advanced = files["advanced-bin.zip"];
  const buildInfoBytes = files["build-info.json"];
  if (!merged || !advanced || !buildInfoBytes) {
    await failBuild(buildId, "artifact_missing_required_files");
    return json({ error: "artifact_missing_required_files" }, 422);
  }
  const expandedTotal = merged.byteLength + advanced.byteLength + buildInfoBytes.byteLength;
  if (expandedTotal > MAX_EXPANDED_ARTIFACT_BYTES
      || advanced.byteLength > MAX_ADVANCED_ZIP_BYTES
      || buildInfoBytes.byteLength > MAX_BUILD_INFO_BYTES) {
    await failBuild(buildId, "artifact_expanded_size_invalid");
    return json({ error: "artifact_expanded_size_invalid" }, 413);
  }
  if (merged.byteLength !== 4 * 1024 * 1024) {
    await failBuild(buildId, "merged_image_size_invalid");
    return json({ error: "merged_image_size_invalid" }, 422);
  }

  let buildInfo: Record<string, unknown>;
  try {
    buildInfo = JSON.parse(new TextDecoder().decode(buildInfoBytes));
  } catch {
    await failBuild(buildId, "build_metadata_invalid");
    return json({ error: "build_metadata_invalid" }, 422);
  }
  if (buildInfo.build_id !== buildId || buildInfo.variant !== build.variant) {
    await failBuild(buildId, "artifact_build_identity_mismatch");
    return json({ error: "artifact_build_identity_mismatch" }, 422);
  }

  const images = buildInfo.images as Record<string, Record<string, unknown>> | undefined;
  const expectedHash = images?.merged?.sha256;
  const actualHash = await sha256Hex(merged);
  if (expectedHash !== actualHash) {
    await failBuild(buildId, "merged_image_hash_mismatch");
    return json({ error: "merged_image_hash_mismatch" }, 422);
  }

  const bucket = supabase.storage.from("firmware-artifacts");
  const prefix = buildId + "/";
  const items = [
    { type: "merged_bin", name: "merged.bin", bytes: merged, contentType: "application/octet-stream" },
    { type: "advanced_zip", name: "advanced-bin.zip", bytes: advanced, contentType: "application/zip" },
    { type: "build_info", name: "build-info.json", bytes: buildInfoBytes, contentType: "application/json" },
  ];

  const rows = [];
  for (const item of items) {
    const objectPath = prefix + item.name;
    const { error: uploadError } = await bucket.upload(objectPath, item.bytes, {
      contentType: item.contentType,
      upsert: true,
    });
    if (uploadError) {
      await bucket.remove(rows.map((row) => row.object_path));
      await failBuild(buildId, "artifact_storage_upload_failed");
      return json({ error: "artifact_storage_upload_failed", file: item.name }, 502);
    }
    rows.push({
      build_id: buildId,
      artifact_type: item.type,
      bucket_id: "firmware-artifacts",
      object_path: objectPath,
      size_bytes: item.bytes.byteLength,
      sha256: await sha256Hex(item.bytes),
    });
  }

  const { error: rowsError } = await supabase
    .from("firmware_build_artifacts")
    .upsert(rows, { onConflict: "build_id,artifact_type" });
  if (rowsError) {
    await bucket.remove(rows.map((row) => row.object_path));
    await failBuild(buildId, "artifact_metadata_save_failed");
    return json({ error: "artifact_metadata_save_failed" }, 500);
  }

  const { data: completed, error: updateError } = await supabase.from("firmware_builds").update({
    status: "succeeded",
    callback_claimed_at: null,
    github_run_id: runId,
    github_run_attempt: runAttempt,
    source_commit_sha: sourceSha,
    finished_at: new Date().toISOString(),
    error_code: null,
    error_message_safe: null,
  }).eq("id", buildId).in("status", ["queued", "building"])
    .eq("github_run_id", runId).select("id").maybeSingle();
  if (updateError || !completed) {
    await supabase.from("firmware_build_artifacts").delete().eq("build_id", buildId);
    await bucket.remove(rows.map((row) => row.object_path));
    await supabase.from("firmware_builds").update({ callback_claimed_at: null })
      .eq("id", buildId).in("status", ["queued", "building"]);
    return json({ error: updateError ? "build_completion_update_failed" : "build_state_conflict" }, updateError ? 500 : 409);
  }

  return json({ ok: true, status: "succeeded", artifact_count: rows.length });
});
