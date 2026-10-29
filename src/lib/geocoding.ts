const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const MIN_REQUEST_INTERVAL_MS = 1_000;
const cache = new Map<string, string | null>();
let lastRequestAt = 0;
let queuedRequest: Promise<void> = Promise.resolve();

function cacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function parseReverseGeocodeAddress(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const response = body as { display_name?: unknown; address?: Record<string, unknown> };
  if (typeof response.display_name === "string" && response.display_name.trim()) return response.display_name.trim();
  if (!response.address) return null;

  const preferredFields = [
    "road",
    "house_number",
    "neighbourhood",
    "suburb",
    "city_district",
    "city",
    "town",
    "village",
    "municipality",
    "state",
    "postcode",
    "country",
  ];
  const parts = preferredFields
    .map((field) => response.address?.[field])
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()));
  return parts.length ? [...new Set(parts)].join(", ") : null;
}

async function waitForRateLimit() {
  const delay = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequestAt = Date.now();
}

export async function reverseGeocodeCoordinates(latitude: number, longitude: number, signal?: AbortSignal) {
  const key = cacheKey(latitude, longitude);
  if (cache.has(key)) return cache.get(key) ?? null;

  const endpoint = import.meta.env.VITE_GEOCODING_URL || NOMINATIM_ENDPOINT;
  const url = new URL(endpoint);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  if (endpoint === NOMINATIM_ENDPOINT) {
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "18");
  }

  const request = queuedRequest.then(async () => {
    await waitForRateLimit();
    const response = await fetch(url, {
      headers: { Accept: "application/json", "Accept-Language": navigator.language || "en" },
      signal,
    });
    if (!response.ok) throw new Error(`Reverse geocoding failed with status ${response.status}.`);
    const address = parseReverseGeocodeAddress(await response.json());
    cache.set(key, address);
    return address;
  });
  queuedRequest = request.then(() => undefined, () => undefined);
  return request;
}
