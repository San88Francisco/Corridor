import { createSession } from "@/lib/game-store";
import { fail, readBody } from "@/lib/http";

export async function POST(request: Request) {
  const body = await readBody(request);
  if (!body) return fail("bad_request");
  const session = await createSession(body.token);
  return Response.json({ id: session.id }, { status: 201 });
}
