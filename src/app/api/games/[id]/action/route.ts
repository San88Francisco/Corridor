import { act } from "@/lib/game-store";
import { fail, readBody } from "@/lib/http";
import { parseAction } from "@/lib/quoridor";

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/action">) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  const action = body && parseAction(body.action);
  if (!body || !action) return fail("bad_request");
  const result = await act(id, body.token, action);
  return result.ok ? Response.json({ session: result.session }) : fail(result.error);
}
