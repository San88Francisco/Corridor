import { getSnapshot } from "@/lib/game-store";
import { fail } from "@/lib/http";

// Клієнти опитують цей маршрут, щоб побачити хід суперника.
export async function GET(_request: Request, ctx: RouteContext<"/api/games/[id]">) {
  const { id } = await ctx.params;
  const session = await getSnapshot(id);
  if (!session) return fail("not_found");
  return Response.json(session, { headers: { "Cache-Control": "no-store" } });
}
