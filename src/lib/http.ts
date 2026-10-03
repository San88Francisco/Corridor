import type { StoreError } from "./game-store";

const STATUS: Partial<Record<StoreError, number>> = {
  bad_request: 400,
  not_player: 403,
  not_found: 404,
};

export function fail(error: StoreError) {
  return Response.json({ error }, { status: STATUS[error] ?? 409 });
}

// Тіло запиту з токеном гравця; null, якщо JSON чи токен некоректні.
export async function readBody(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return null;
  const { token } = body as { token?: unknown };
  if (typeof token !== "string" || token.length < 16 || token.length > 64) return null;
  return body as { token: string; [key: string]: unknown };
}
