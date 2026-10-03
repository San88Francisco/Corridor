import { joinSession } from "@/lib/game-store";
import { fail, readBody } from "@/lib/http";

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/join">) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  if (!body) return fail("bad_request");
  const joined = await joinSession(id, body.token);
  return joined ? Response.json(joined) : fail("not_found");
}
