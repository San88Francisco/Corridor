import { rematch } from "@/lib/game-store";
import { fail, readBody } from "@/lib/http";

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/rematch">) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  if (!body || typeof body.round !== "number") return fail("bad_request");
  const result = await rematch(id, body.token, body.round);
  return result.ok ? Response.json({ session: result.session }) : fail(result.error);
}
