import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supplied = req.headers.get("x-cleanup-token") ?? "";
  const { data: expected, error: secretError } = await supabase.rpc(
    "get_firmware_storage_cleanup_token",
  );
  if (secretError || typeof expected !== "string" || !safeEqual(supplied, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: builds, error: buildError } = await supabase
    .from("firmware_builds")
    .select("id, finished_at")
    .eq("status", "succeeded")
    .not("finished_at", "is", null)
    .lte("finished_at", cutoff)
    .order("finished_at", { ascending: true })
    .limit(100);

  if (buildError) {
    console.error("Could not select expired builds", buildError.message);
    return Response.json({ error: "Could not select expired builds" }, { status: 500 });
  }
  if (!builds?.length) {
    return Response.json({ deleted_objects: 0, deleted_metadata: 0, eligible_builds: 0 });
  }

  const buildIds = builds.map((build) => build.id);
  const { data: artifacts, error: artifactError } = await supabase
    .from("firmware_build_artifacts")
    .select("id, build_id, bucket_id, object_path")
    .in("build_id", buildIds);

  if (artifactError) {
    console.error("Could not select artifact metadata", artifactError.message);
    return Response.json({ error: "Could not select artifact metadata" }, { status: 500 });
  }

  type Artifact = { id: string; build_id: string; bucket_id: string; object_path: string };
  const byBucket = new Map<string, Artifact[]>();
  for (const artifact of (artifacts ?? []) as Artifact[]) {
    const items = byBucket.get(artifact.bucket_id) ?? [];
    items.push(artifact);
    byBucket.set(artifact.bucket_id, items);
  }

  let deletedObjects = 0;
  let deletedMetadata = 0;
  const failures: string[] = [];

  for (const [bucket, items] of byBucket) {
    const { data: removed, error: removeError } = await supabase.storage
      .from(bucket)
      .remove(items.map((item) => item.object_path));

    if (removeError) {
      console.error("Storage removal failed", { bucket, message: removeError.message });
      failures.push(bucket);
      continue;
    }

    // Verify through the Storage API (never write directly to storage.objects).
    const folders = new Set<string>();
    for (const item of items) {
      const slash = item.object_path.lastIndexOf("/");
      folders.add(slash >= 0 ? item.object_path.slice(0, slash) : "");
    }

    const absentIds: string[] = [];
    let verifyFailed = false;
    for (const folder of folders) {
      const { data: listed, error: listError } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: 100 });
      if (listError) {
        console.error("Storage verification failed", { bucket, folder, message: listError.message });
        verifyFailed = true;
        break;
      }
      const present = new Set((listed ?? []).map((entry) => entry.name));
      for (const item of items) {
        const slash = item.object_path.lastIndexOf("/");
        const itemFolder = slash >= 0 ? item.object_path.slice(0, slash) : "";
        const file = slash >= 0 ? item.object_path.slice(slash + 1) : item.object_path;
        if (itemFolder === folder && !present.has(file)) absentIds.push(item.id);
      }
    }
    if (verifyFailed) {
      failures.push(bucket);
      continue;
    }

    if (absentIds.length) {
      const { error: metadataError, count } = await supabase
        .from("firmware_build_artifacts")
        .delete({ count: "exact" })
        .in("id", absentIds);
      if (metadataError) {
        console.error("Metadata cleanup failed", metadataError.message);
        failures.push(bucket);
      } else {
        deletedMetadata += count ?? absentIds.length;
      }
    }
    deletedObjects += removed?.length ?? 0;
  }

  return Response.json({
    eligible_builds: builds.length,
    deleted_objects: deletedObjects,
    deleted_metadata: deletedMetadata,
    failed_buckets: failures,
    cutoff,
  }, { status: failures.length ? 207 : 200 });
});
