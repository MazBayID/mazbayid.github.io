import { createClient } from "npm:@supabase/supabase-js@2.119.1";
import { unzipSync, zipSync } from "npm:fflate@0.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
if (!SUPABASE_URL || !KEY) throw new Error("Supabase server credentials are unavailable");
const db = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const ORIGIN = "https://mazbayid.github.io";
const PREVIEWS = "skin-previews";
const FREE = "skin-packages-free";
const PREMIUM = "skin-packages-premium";
const MAX_ZIP = 32 * 1024 * 1024;
const MAX_THUMB = 3 * 1024 * 1024;
const MAX_FILES = 400;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 32 * 1024 * 1024;
const ALLOWED_EXT = new Set([".webp", ".png", ".json", ".md", ".txt"]);

function response(data: unknown, status = 200, origin = ORIGIN) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  }});
}
function fail(code: string, status: number, details?: unknown) {
  return response({ error: code, ...(details ? { details } : {}) }, status);
}
function safePath(name: string) {
  if (!name || name.startsWith("/") || name.includes("\\") || /^[A-Za-z]:/.test(name)) return false;
  const parts = name.split("/");
  return parts.every((p) => p && p !== "." && p !== "..");
}
function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
}
function readZipDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("ZIP end record not found");
  const entries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries > MAX_FILES || offset + cdSize > bytes.length) throw new Error("ZIP directory is invalid or too large");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const seen = new Set<string>();
  let total = 0;
  const files: string[] = [];
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error("ZIP directory entry is invalid");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const external = view.getUint32(offset + 38, true);
    const end = offset + 46 + nameLen + extraLen + commentLen;
    if (end > bytes.length || (flags & 1) !== 0 || ![0, 8].includes(method)) throw new Error("Encrypted or unsupported ZIP entry");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    offset = end;
    if (name.endsWith("/")) continue;
    if (!safePath(name)) throw new Error("Unsafe ZIP path: " + name);
    const lower = name.toLowerCase();
    if (seen.has(lower)) throw new Error("Duplicate ZIP path: " + name);
    seen.add(lower);
    const mode = external >>> 16;
    if ((mode & 0o170000) === 0o120000) throw new Error("Symbolic links are not allowed");
    if (!ALLOWED_EXT.has(ext(name))) throw new Error("Unsupported file type: " + name);
    // Nested Markdown index files are part of the official NekOS skin template.
    // The later path allowlist still rejects all unrecognized locations.
    if (uncompressed > MAX_FILE) throw new Error("File exceeds 8 MB: " + name);
    if (uncompressed > 1_000_000 && (compressed === 0 || uncompressed / compressed > 100)) throw new Error("Suspicious compression ratio: " + name);
    total += uncompressed;
    if (total > MAX_TOTAL) throw new Error("Uncompressed ZIP exceeds 32 MB");
    files.push(name);
  }
  if (!files.includes("skin.json")) throw new Error("skin.json must be at the ZIP root");
  return files;
}
function imageInfo(bytes: Uint8Array, filename: string) {
  if (bytes.length < 16) throw new Error("Invalid image: " + filename);
  let width = 0, height = 0, type = "";
  if (ext(filename) === ".png" && bytes[0] === 137 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG") {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    width = v.getUint32(16, false); height = v.getUint32(20, false); type = "image/png";
  } else if (ext(filename) === ".webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
      height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
    } else if (chunk === "VP8 " && bytes.length >= 30) {
      width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    }
    type = "image/webp";
  }
  if (!type || width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error("Invalid image or dimensions: " + filename);
  return { width, height, type };
}
function isAllowedSkinPath(path: string) {
  if (path === "skin.json") return true;
  if (!path.includes("/") && !path.startsWith(".") && /\.(md|txt)$/i.test(path)) return true;
  if (new Set([
    "icons/tag/icons_index.json", "icons/tag/icons_index.md",
    "icons/ui/ui_index.json", "icons/ui/ui_index.md",
    "components/tag_badge/badge.json",
    "components/tag_frame/frame_spritesheet.json",
    "components/top_frame/topframe_atlas.json",
    "components/top_frame/topframe_formula.json",
  ]).has(path)) return true;
  if (/^icons\/(tag|ui)\/icon_[a-z0-9]+(?:_[a-z0-9]+)*\.webp$/.test(path)) return true;
  if (path === "components/tag_badge/badge_cat.webp") return true;
  if (path === "components/tag_frame/frame_spritesheet.webp") return true;
  if (/^components\/top_frame\/topframe_spritesheet(?:@2x|@4x)?\.png$/.test(path)) return true;
  return /^motifs\/motif_[a-z0-9]+(?:_[a-z0-9]+)*(?:@512)?\.png$/.test(path);
}
function expectedImageSize(path: string): [number, number] | null {
  if (/^icons\/(tag|ui)\/icon_[a-z0-9]+(?:_[a-z0-9]+)*\.webp$/.test(path)) return [96, 96];
  if (path === "components/tag_badge/badge_cat.webp") return [128, 128];
  if (path === "components/tag_frame/frame_spritesheet.webp") return [512, 240];
  if (path === "components/top_frame/topframe_spritesheet.png") return [134, 64];
  if (path === "components/top_frame/topframe_spritesheet@2x.png") return [268, 128];
  if (path === "components/top_frame/topframe_spritesheet@4x.png") return [536, 256];
  if (/^motifs\/.*@512\.png$/.test(path)) return [512, 512];
  if (/^motifs\/.*\.png$/.test(path)) return [1024, 1024];
  return null;
}
function validateStructure(files: string[], archive: Record<string, Uint8Array>) {
  for (const name of files) {
    if (!isAllowedSkinPath(name)) throw new Error("Unsupported or unexpected skin path: " + name);
  }
  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(new TextDecoder().decode(archive["skin.json"])); }
  catch { throw new Error("skin.json is not valid JSON"); }
  if (!manifest || typeof manifest !== "object" || manifest.schema_version !== 1) {
    throw new Error("Unsupported skin schema_version (expected 1)");
  }
  const skin = manifest.skin as Record<string, unknown> | undefined;
  if (!skin || typeof skin.id !== "string" || !skin.id.trim() || skin.id.length > 255 || skin.id === "default") {
    throw new Error("skin.id must be a non-empty unique string (maximum 255 characters)");
  }
  if (typeof skin.name !== "string" || !skin.name.trim() || skin.name.length > 80) {
    throw new Error("skin.name is required (maximum 80 characters)");
  }
  if (typeof skin.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(skin.version)) {
    throw new Error("skin.version must use semantic version format, e.g. 1.0.0");
  }
  const compatibility = (manifest.compatibility ?? {}) as Record<string, unknown>;
  if (compatibility.contains_executable_code === true || compatibility.requires_network === true) {
    throw new Error("Executable code and network-required skins are not allowed");
  }
  const allowedKinds = new Set(["branding", "tag_icon", "ui_icon", "wallpaper", "background", "frame", "badge", "texture", "illustration", "font", "other"]);
  if (Array.isArray(manifest.assets)) {
    const ids = new Set<string>();
    for (const asset of manifest.assets as Record<string, unknown>[]) {
      if (!asset || typeof asset !== "object" || typeof asset.id !== "string" ||
          typeof asset.kind !== "string" || !allowedKinds.has(asset.kind) || typeof asset.file !== "string") {
        throw new Error("Invalid manifest asset entry");
      }
      if (ids.has(asset.id)) throw new Error("Duplicate asset ID: " + asset.id);
      ids.add(asset.id);
      if (!safePath(asset.file) || !isAllowedSkinPath(asset.file) || !archive[asset.file]) {
        throw new Error("Manifest asset is missing or unsafe: " + asset.file);
      }
    }
  } else if (manifest.assets !== undefined) throw new Error("assets must be an array");
  if (Array.isArray(manifest.motifs)) {
    if (manifest.motifs.length > 1) throw new Error("Only one motif is supported");
    for (const motif of manifest.motifs as Record<string, unknown>[]) {
      if (!motif || typeof motif.file !== "string" || !safePath(motif.file) ||
          !isAllowedSkinPath(motif.file) || !archive[motif.file] || !motif.file.startsWith("motifs/")) {
        throw new Error("Motif file is missing or unsafe");
      }
      if (motif.file_small !== undefined &&
          (typeof motif.file_small !== "string" || !safePath(motif.file_small) ||
           !isAllowedSkinPath(motif.file_small) || !archive[motif.file_small])) {
        throw new Error("Small motif file is missing or unsafe");
      }
      if (!["solid", "line"].includes(String(motif.type))) throw new Error("Motif type must be solid or line");
    }
  } else if (manifest.motifs !== undefined) throw new Error("motifs must be an array");

  for (const name of files) {
    if (ext(name) === ".png" || ext(name) === ".webp") {
      const image = imageInfo(archive[name], name);
      const expected = expectedImageSize(name);
      if (expected && (image.width !== expected[0] || image.height !== expected[1])) {
        throw new Error(name + " must be " + expected[0] + "x" + expected[1] + " pixels");
      }
    }
    if (name.endsWith(".json")) {
      let parsed: any;
      try { parsed = JSON.parse(new TextDecoder().decode(archive[name])); }
      catch { throw new Error("Invalid JSON file: " + name); }
      if (name.endsWith("icons_index.json") || name.endsWith("ui_index.json")) {
        if (!parsed || !Array.isArray(parsed.items) || parsed.total !== parsed.items.length) {
          throw new Error("Invalid icon index: " + name);
        }
        for (const item of parsed.items) {
          if (!item || !Number.isInteger(item.id) || typeof item.name !== "string" ||
              typeof item.file !== "string" || !archive[name.replace(/[^/]+$/, "") + item.file]) {
            throw new Error("Icon index references an invalid or missing file: " + name);
          }
        }
      }
    }
  }
  return {
    skin,
    schemaVersion: Number(manifest.schema_version),
    minVersion: String(skin.min_nekos_version ?? compatibility.min_nekos_version ?? ""),
  };
}
function normalizeDefaultTemplate(archive: Record<string, Uint8Array>) {
  let manifest: Record<string, any>;
  try { manifest = JSON.parse(new TextDecoder().decode(archive["skin.json"])); }
  catch { throw new Error("skin.json is not valid JSON"); }
  const skin = manifest?.skin;
  if (!skin || typeof skin.id !== "string" || skin.id.trim().toLowerCase() !== "default") {
    return { changed: false, bytes: null as Uint8Array | null };
  }
  const uniqueId = "nekos_default_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  skin.id = uniqueId;
  archive["skin.json"] = new TextEncoder().encode(JSON.stringify(manifest));
  return { changed: true, bytes: zipSync(archive, { level: 6 }) };
}

async function ensureBuckets() {
  const { data, error } = await db.storage.listBuckets();
  if (error) throw new Error("Unable to inspect Storage buckets");
  const existing = new Set((data ?? []).map((b: { name: string }) => b.name));
  const specs = [
    { name: PREVIEWS, public: true, fileSizeLimit: MAX_THUMB, allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"] },
    { name: FREE, public: false, fileSizeLimit: MAX_ZIP, allowedMimeTypes: ["application/zip", "application/octet-stream"] },
    { name: PREMIUM, public: false, fileSizeLimit: MAX_ZIP, allowedMimeTypes: ["application/zip", "application/octet-stream"] },
  ];
  for (const spec of specs) {
    if (!existing.has(spec.name)) {
      const { error: createError } = await db.storage.createBucket(spec.name, spec);
      if (createError && !String(createError.message).toLowerCase().includes("already")) throw new Error("Unable to create Storage bucket: " + spec.name);
    }
  }
}
async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function requireAdmin(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false as const, status: 401, error: "authentication_required" };
  const { data: userData, error: userError } = await db.auth.getUser(match[1]);
  const user = userData?.user;
  if (userError || !user || !user.email || !user.email_confirmed_at) {
    return { ok: false as const, status: 401, error: "invalid_or_unverified_session" };
  }
  const { data: admin, error } = await db.from("skin_manager_admins")
    .select("email")
    .eq("email", user.email.toLowerCase())
    .eq("enabled", true)
    .maybeSingle();
  if (error) return { ok: false as const, status: 503, error: "admin_check_unavailable" };
  if (!admin) return { ok: false as const, status: 403, error: "admin_access_denied" };
  return { ok: true as const, user };
}

async function catalog() {
  const { data, error } = await db.from("skins")
    .select("id,skin_key,name,author,description,schema_version,min_nekos_version,preview_path,package_sha256,package_size_bytes,price_amount,currency,category,created_at")
    .eq("status", "published").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Catalog query failed");
  return (data ?? []).map((skin: Record<string, unknown>) => ({
    ...skin,
    preview_url: db.storage.from(PREVIEWS).getPublicUrl(String(skin.preview_path)).data.publicUrl,
  }));
}
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (origin !== ORIGIN) return fail("origin_not_allowed", 403, origin || "missing origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Vary": "Origin",
  }});
  if (req.method === "GET") {
    if (new URL(req.url).searchParams.get("admin") === "1") {
      const auth = await requireAdmin(req);
      if (!auth.ok) return fail(auth.error, auth.status);
      return response({ authorized: true, email: auth.user.email });
    }
    try { return response({ skins: await catalog() }); }
    catch { return fail("catalog_unavailable", 503); }
  }


  if (req.method === "PUT") {
    const auth = await requireAdmin(req);
    if (!auth.ok) return fail(auth.error, auth.status);
    const skinId = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skinId)) return fail("invalid_skin_id", 400);
    const { data: current, error: findError } = await db.from("skins")
      .select("id,status,preview_path").eq("id", skinId).maybeSingle();
    if (findError) return fail("skin_lookup_failed", 503);
    if (!current || current.status !== "published") return fail("skin_not_found", 404);
    let form: FormData;
    try { form = await req.formData(); } catch { return fail("invalid_form_data", 400); }
    const thumbnail = form.get("thumbnail");
    if (!(thumbnail instanceof File)) return fail("thumbnail_required", 400);
    if (thumbnail.size < 16 || thumbnail.size > MAX_THUMB) return fail("invalid_thumbnail_size", 400);
    const fileName = thumbnail.name.toLowerCase();
    const imageType = fileName.endsWith(".png") ? "preview.png" : fileName.endsWith(".webp") ? "preview.webp" : "preview.png";
    const bytes = new Uint8Array(await thumbnail.arrayBuffer());
    let info: {width:number;height:number;type:string};
    try { info = imageInfo(bytes, imageType); } catch { return fail("invalid_thumbnail", 400); }
    if (info.width < 64 || info.height < 64 || !["image/png","image/webp"].includes(info.type)) return fail("invalid_thumbnail", 400);
    const extension = info.type === "image/webp" ? "webp" : "png";
    const nextPath = crypto.randomUUID() + "." + extension;
    const { error: uploadError } = await db.storage.from(PREVIEWS).upload(nextPath, bytes, {contentType:info.type,upsert:false});
    if (uploadError) return fail("preview_upload_failed", 503);
    const { data: updated, error: updateError } = await db.from("skins")
      .update({preview_path:nextPath}).eq("id",skinId).eq("status","published")
      .select("id,preview_path").maybeSingle();
    if (updateError || !updated) {
      await db.storage.from(PREVIEWS).remove([nextPath]);
      return fail("preview_update_failed", 500);
    }
    const { error: cleanupError } = await db.storage.from(PREVIEWS).remove([String(current.preview_path)]);
    if (cleanupError) {
      const { error: rollbackError } = await db.from("skins").update({preview_path:current.preview_path}).eq("id",skinId).eq("preview_path",nextPath);
      const { error: newFileCleanupError } = await db.storage.from(PREVIEWS).remove([nextPath]);
      console.error("skin_manager_old_preview_cleanup_failed",cleanupError.message);
      if (rollbackError || newFileCleanupError) return fail("preview_cleanup_and_rollback_failed",500,{old_preview_cleanup:cleanupError.message,rollback:rollbackError?.message ?? null,new_preview_cleanup:newFileCleanupError?.message ?? null});
      return fail("old_preview_delete_failed",503,"Preview lama gagal dihapus. Perubahan dibatalkan dan preview sebelumnya dipulihkan.");
    }
    return response({success:true,skin:updated,preview_url:db.storage.from(PREVIEWS).getPublicUrl(nextPath).data.publicUrl,message:"Preview berhasil diganti dan file lama telah dihapus."});
  }
  if (req.method === "PATCH" || req.method === "DELETE") {
    const auth = await requireAdmin(req);
    if (!auth.ok) return fail(auth.error, auth.status);
    const skinId = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(skinId)) return fail("invalid_skin_id", 400);
    const { data: current, error: findError } = await db.from("skins")
      .select("id,status,price_amount,currency,package_bucket,package_path,preview_path")
      .eq("id", skinId).maybeSingle();
    if (findError) return fail("skin_lookup_failed", 503);
    if (!current || !["published","archived"].includes(String(current.status))) return fail("skin_not_found", 404);

    if (req.method === "DELETE") {
      const packageBucket = String(current.package_bucket);
      if (![FREE, PREMIUM].includes(packageBucket)) return fail("invalid_package_bucket",500);
      const storageTargets = [
        { bucket: PREVIEWS, path: String(current.preview_path) },
        { bucket: packageBucket, path: String(current.package_path) },
      ];
      for (const target of storageTargets) {
        if (!target.path || target.path === "undefined") return fail("invalid_storage_path",500);
        const { error: removeError } = await db.storage.from(target.bucket).remove([target.path]);
        if (removeError) return fail("skin_storage_cleanup_failed",503,{bucket:target.bucket,path:target.path,message:removeError.message});
      }

      const { data: orders, error: orderLookupError } = await db.schema("private").from("skin_orders")
        .select("id").eq("skin_id",skinId);
      if (orderLookupError) return fail("skin_order_lookup_failed",503,orderLookupError.message);
      const orderIds = (orders ?? []).map((order: {id:string}) => order.id);

      const { error: entitlementError } = await db.schema("private").from("skin_entitlements").delete().eq("skin_id",skinId);
      if (entitlementError) return fail("skin_entitlement_cleanup_failed",500,entitlementError.message);
      if (orderIds.length) {
        const { error: paymentError } = await db.schema("private").from("skin_payments").delete().in("order_id",orderIds);
        if (paymentError) return fail("skin_payment_cleanup_failed",500,paymentError.message);
        const { error: orderDeleteError } = await db.schema("private").from("skin_orders").delete().in("id",orderIds);
        if (orderDeleteError) return fail("skin_order_cleanup_failed",500,orderDeleteError.message);
      }
      const { data: deleted, error: skinDeleteError } = await db.from("skins").delete().eq("id",skinId).select("id").maybeSingle();
      if (skinDeleteError || !deleted) return fail("skin_record_delete_failed",500,skinDeleteError?.message ?? "Skin record was not deleted");
      return response({success:true,deleted_skin_id:skinId,deleted_storage_objects:storageTargets.length,deleted_orders:orderIds.length,message:"Skin, preview, package ZIP, dan seluruh data transaksi/pembelian pengujian terkait berhasil dihapus permanen."});
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return fail("invalid_json", 400); }
    const price = Number(body.price_amount);
    if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000) return fail("invalid_price", 400);
    const destinationBucket = price === 0 ? FREE : PREMIUM;
    let copied = false;
    if (destinationBucket !== current.package_bucket) {
      const { error: copyError } = await db.storage.from(String(current.package_bucket))
        .copy(String(current.package_path), String(current.package_path), { destinationBucket });
      if (copyError) return fail("package_move_failed", 503, copyError.message);
      copied = true;
    }
    const update: Record<string, unknown> = { price_amount: price, currency: "IDR" };
    if (copied) update.package_bucket = destinationBucket;
    const { data: updated, error: updateError } = await db.from("skins")
      .update(update).eq("id", skinId).eq("status", "published")
      .select("id,price_amount,currency,package_bucket").maybeSingle();
    if (updateError || !updated) {
      if (copied) await db.storage.from(destinationBucket).remove([String(current.package_path)]);
      return fail("price_update_failed", 500);
    }
    if (copied) {
      const { error: cleanupError } = await db.storage.from(String(current.package_bucket)).remove([String(current.package_path)]);
      if (cleanupError) console.error("skin_manager_old_package_cleanup_failed", cleanupError.message);
    }
    return response({ success: true, skin: updated, message: "Harga skin berhasil diperbarui." });
  }
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const auth = await requireAdmin(req);
  if (!auth.ok) return fail(auth.error, auth.status);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_ZIP + MAX_THUMB + 256_000) return fail("upload_too_large", 413);
  try {
    const form = await req.formData();
    const zip = form.get("package");
    const thumbnail = form.get("thumbnail");
    const priceRaw = String(form.get("price") ?? "");
    const currency = String(form.get("currency") ?? "IDR").toUpperCase();
    const category = String(form.get("category") ?? "Basic");
    if (!["Free", "Basic", "Premium", "Exclusive"].includes(category)) return fail("invalid_category", 400);
    if (!(zip instanceof File) || !(thumbnail instanceof File)) return fail("package_and_thumbnail_required", 400);
    if (!zip.name.toLowerCase().endsWith(".zip") || zip.size < 22 || zip.size > MAX_ZIP) return fail("invalid_zip_size_or_name", 400);
    if (thumbnail.size < 16 || thumbnail.size > MAX_THUMB) return fail("invalid_thumbnail_size", 400);
    const price = Number(priceRaw);
    if (!Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000 || currency !== "IDR") return fail("invalid_price_or_currency", 400);

    let zipBytes = new Uint8Array(await zip.arrayBuffer());
    let names = readZipDirectory(zipBytes);
    let archive = unzipSync(zipBytes);
    const normalized = normalizeDefaultTemplate(archive);
    if (normalized.changed && normalized.bytes) {
      zipBytes = normalized.bytes;
      if (zipBytes.length > MAX_ZIP) return fail("upload_too_large_after_normalization", 413);
      names = readZipDirectory(zipBytes);
      archive = unzipSync(zipBytes);
    }
    const info = validateStructure(names, archive);
    const thumbBytes = new Uint8Array(await thumbnail.arrayBuffer());
    const thumbType = imageInfo(thumbBytes, thumbnail.name.toLowerCase().endsWith(".png") ? "preview.png" : thumbnail.name.toLowerCase().endsWith(".webp") ? "preview.webp" : "preview.png");
    if (thumbType.width < 64 || thumbType.height < 64) return fail("thumbnail_too_small", 400);
    if (!["image/png", "image/webp"].includes(thumbType.type)) return fail("invalid_thumbnail", 400);

    const skin = info.skin;
    const skinId = String(skin.id);
    const packageBucket = price === 0 ? FREE : PREMIUM;
    const objectId = crypto.randomUUID();
    const packagePath = objectId + ".zip";
    const previewExt = thumbType.type === "image/webp" ? "webp" : "png";
    const previewPath = objectId + "." + previewExt;
    await ensureBuckets();
    const [packageUpload, previewUpload] = await Promise.all([
      db.storage.from(packageBucket).upload(packagePath, zipBytes, { contentType: "application/zip", upsert: false }),
      db.storage.from(PREVIEWS).upload(previewPath, thumbBytes, { contentType: thumbType.type, upsert: false }),
    ]);
    if (packageUpload.error || previewUpload.error) {
      await db.storage.from(packageBucket).remove([packagePath]);
      await db.storage.from(PREVIEWS).remove([previewPath]);
      return fail("storage_upload_failed", 503);
    }
    const { data: inserted, error: insertError } = await db.from("skins").insert({
      skin_key: skinId,
      name: String(skin.name),
      author: typeof skin.author === "string" && skin.author.trim() ? skin.author.slice(0, 100) : "Community",
      description: typeof skin.description === "string" ? skin.description.slice(0, 2000) : null,
      schema_version: info.schemaVersion,
      min_nekos_version: info.minVersion || null,
      preview_path: previewPath,
      package_bucket: packageBucket,
      package_path: packagePath,
      package_sha256: await sha256(zipBytes),
      package_size_bytes: zipBytes.length,
      price_amount: price,
      currency,
      category,
      status: "published",
      published_at: new Date().toISOString(),
    }).select("id,skin_key,name,author,description,price_amount,currency,category").single();
    if (insertError) {
      await db.storage.from(packageBucket).remove([packagePath]);
      await db.storage.from(PREVIEWS).remove([previewPath]);
      if (insertError.code === "23505") return fail("skin_id_already_exists", 409);
      return fail("skin_publish_failed", 500);
    }
    return response({ success: true, skin: inserted, message: skinId.startsWith("nekos_default_") ? "Template default berhasil dipublikasikan dengan Skin ID komunitas unik: " + skinId : "Skin berhasil dipublikasikan." }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid skin package";
    return fail("skin_validation_failed", 400, message.slice(0, 500));
  }
});