import { createClient } from "npm:@supabase/supabase-js@2.119.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_ORIGINS = new Set(["https://mazbayid.github.io"]);
const DEFAULT_GPIO: Record<string, number> = {
  oled_sda: 21, oled_scl: 20, speaker_bclk: 1, speaker_lrc: 2,
  speaker_din: 5, button_prev: 4, button_next: 6, button_mode: 7,
};
const ALLOWED_GPIO = new Set([0, 1, 2, 3, 4, 5, 6, 7, 10, 20, 21]);
const VARIANTS: Record<string, string> = {
  via_wifi: "build-firmware-via-wifi.yml",
  via_chronos: "build-firmware-via-chronos.yml",
  mochi_chronos: "build-firmware-mochi-chronos.yml",
};

const json = (body: unknown, status = 200, origin = "") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });

function preflight(origin: string) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function validateGPIO(input: unknown) {
  if (input === undefined || input === null) input = {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("gpio_config_must_be_object");
  }
  const supplied = input as Record<string, unknown>;
  const unknown = Object.keys(supplied).filter((key) => !Object.hasOwn(DEFAULT_GPIO, key));
  if (unknown.length) throw new Error("unsupported_gpio_signal:" + unknown.join(","));

  const config = { ...DEFAULT_GPIO };
  for (const [signal, pin] of Object.entries(supplied)) {
    if (typeof pin !== "number" || !Number.isInteger(pin)) {
      throw new Error("gpio_must_be_integer:" + signal);
    }
    if (!ALLOWED_GPIO.has(pin)) throw new Error("gpio_not_allowed:" + signal + ":" + pin);
    config[signal] = pin;
  }

  const seen = new Map<number, string>();
  for (const [signal, pin] of Object.entries(config)) {
    const previous = seen.get(pin);
    if (previous) throw new Error("gpio_conflict:" + previous + ":" + signal + ":" + pin);
    seen.set(pin, signal);
  }

  const warnings: string[] = [];
  if (Object.keys(supplied).length && Object.values(config).includes(2)) {
    warnings.push("GPIO2 is an ESP32-C3 strapping pin; attached circuitry may affect boot.");
  }
  return { config, warnings };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isValidClientIp(value: string) {
  const octets = value.split(".");
  if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part)
      && Number(part) >= 0 && Number(part) <= 255)) return true;
  if (!value.includes(":") || value.length > 45 || !/^[0-9a-f:.]+$/i.test(value)) return false;
  try {
    return new URL("http://[" + value + "]/").hostname.length > 2;
  } catch {
    return false;
  }
}

async function fingerprintHash(req: Request) {
  // Only use the managed Cloudflare client-IP header. Forwarding chains can
  // contain caller-controlled values and must not define the rate-limit key.
  const clientIp = req.headers.get("cf-connecting-ip")?.trim();
  if (!clientIp || clientIp.length > 64 || /[\s,]/.test(clientIp) || !isValidClientIp(clientIp)) {
    throw new Error("trusted_client_ip_unavailable");
  }
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(clientIp));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newStatusToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return ALLOWED_ORIGINS.has(origin) ? preflight(origin) : new Response(null, { status: 403 });
  if (!ALLOWED_ORIGINS.has(origin)) return json({ error: "origin_not_allowed" }, 403, "");
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json_object");
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  if (body.action === "status") {
    const token = body.status_token;
    if (typeof token !== "string" || token.length < 40 || token.length > 100) {
      return json({ error: "invalid_status_token" }, 400, origin);
    }
    const tokenHash = await sha256Hex(token);
    const { data: build, error } = await supabase
      .from("firmware_builds")
      .select("id,status,variant,created_at,updated_at,started_at,finished_at,expires_at,error_code,error_message_safe")
      .eq("status_token_hash", tokenHash)
      .maybeSingle();
    if (error) return json({ error: "status_lookup_failed" }, 500, origin);
    if (!build) return json({ error: "build_not_found" }, 404, origin);
    if (new Date(build.expires_at).getTime() < Date.now()) {
      return json({ error: "build_expired" }, 410, origin);
    }

    const response: Record<string, unknown> = { build };
    if (build.status === "succeeded") {
      const { data: artifacts, error: artifactError } = await supabase
        .from("firmware_build_artifacts")
        .select("artifact_type,object_path,size_bytes,sha256")
        .eq("build_id", build.id);
      if (artifactError) return json({ error: "artifact_lookup_failed" }, 500, origin);

      const downloads = [];
      for (const artifact of artifacts ?? []) {
        const { data: signed, error: signedError } = await supabase.storage
          .from("firmware-artifacts")
          .createSignedUrl(artifact.object_path, 300);
        if (signedError || !signed?.signedUrl) continue;
        downloads.push({
          type: artifact.artifact_type, url: signed.signedUrl,
          size_bytes: artifact.size_bytes, sha256: artifact.sha256, expires_in: 300,
        });
      }
      response.downloads = downloads;
    }
    return json(response, 200, origin);
  }

  if (body.action !== "create") return json({ error: "unsupported_action" }, 400, origin);
  const variant = body.variant;
  if (typeof variant !== "string" || !Object.hasOwn(VARIANTS, variant)) {
    return json({ error: "unsupported_firmware_variant" }, 400, origin);
  }

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const callbackSecret = Deno.env.get("BUILDER_CALLBACK_SECRET");
  if (!githubToken || !callbackSecret) return json({ error: "builder_backend_not_configured" }, 503, origin);

  let gpio;
  try {
    gpio = validateGPIO(body.gpio_config);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "invalid_gpio_config" }, 400, origin);
  }

  let fingerprint: string;
  try {
    fingerprint = await fingerprintHash(req);
  } catch {
    return json({ error: "rate_limit_identity_unavailable" }, 503, origin);
  }
  const statusToken = newStatusToken();
  const statusTokenHash = await sha256Hex(statusToken);
  const { data: reservationData, error: reservationError } = await supabase.rpc(
    "reserve_firmware_build_request",
    {
      p_variant: variant,
      p_gpio_config: gpio.config,
      p_status_token_hash: statusTokenHash,
      p_request_fingerprint_hash: fingerprint,
      p_max_active: 5,
    },
  );
  if (reservationError) return json({ error: "build_queue_reservation_failed" }, 503, origin);
  const reservation = Array.isArray(reservationData) ? reservationData[0] : reservationData;
  if (!reservation || reservation.result === "invalid_request") {
    return json({ error: "build_request_invalid" }, 400, origin);
  }
  if (reservation.result === "rate_limited") {
    return json({ error: "build_rate_limit_exceeded", retry_after_seconds: 3600 }, 429, origin);
  }
  if (reservation.result === "capacity_full") {
    return json({ error: "build_queue_full", retry_after_seconds: 60 }, 503, origin);
  }
  const buildId = reservation.build_id;
  if (typeof buildId !== "string") return json({ error: "build_request_failed" }, 500, origin);

  const repo = "MazBayID/esp_clock";
  const ref = Deno.env.get("FIRMWARE_REF") ?? "main";
  const dispatchUrl = "https://api.github.com/repos/" + repo + "/actions/workflows/" + VARIANTS[variant] + "/dispatches";
  const dispatch = await fetch(dispatchUrl, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + githubToken,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "NEO-CLOCK-Firmware-Builder",
    },
    body: JSON.stringify({
      ref,
      inputs: { gpio_config: JSON.stringify(gpio.config), build_id: buildId },
    }),
  });

  if (!dispatch.ok) {
    await supabase.from("firmware_builds").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_code: "workflow_dispatch_failed",
      error_message_safe: "The firmware build could not be queued. Please try again later.",
    }).eq("id", buildId);
    return json({ error: "workflow_dispatch_failed", build_id: buildId }, 502, origin);
  }

  return json({
    build_id: buildId, status_token: statusToken, status: "queued",
    variant, gpio_config: gpio.config, warnings: gpio.warnings,
  }, 202, origin);
});
