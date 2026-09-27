import { NextRequest, NextResponse } from "next/server";

const CRC_ORIGIN = "https://crc.garden";
const GET_PATHS = new Set(["config", "listings", "stats", "candles"]);
const POST_PATHS = new Set([
  "orders/prepare",
  "orders/finalize",
  "orders/broadcast",
  "orders/status",
  "orders/cancel",
]);

type RouteContext = { params: Promise<{ path: string[] }> };

function targetUrl(request: NextRequest, path: string[]) {
  const route = path.join("/");
  const url = new URL(`/api/marketplace/${route}`, CRC_ORIGIN);
  request.nextUrl.searchParams.forEach((value, key) => url.searchParams.append(key, value));
  return { route, url };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const { route, url } = targetUrl(request, path);
  if (!GET_PATHS.has(route)) return NextResponse.json({ error: "Unsupported CRC endpoint" }, { status: 404 });

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: route === "listings" ? 5 : 30 },
    });
    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": "application/json", "cache-control": route === "listings" ? "s-maxage=5" : "s-maxage=30" },
    });
  } catch {
    return NextResponse.json({ error: "CRC marketplace is unavailable" }, { status: 502 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const { route, url } = targetUrl(request, path);
  if (!POST_PATHS.has(route)) return NextResponse.json({ error: "Unsupported CRC endpoint" }, { status: 404 });

  const body = await request.text();
  if (body.length > 1_000_000) return NextResponse.json({ error: "Request body too large" }, { status: 413 });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.text();
    return new NextResponse(result, { status: response.status, headers: { "content-type": "application/json" } });
  } catch {
    return NextResponse.json({ error: "CRC marketplace is unavailable" }, { status: 502 });
  }
}
