import { NextRequest } from "next/server";

export function actionAuthorized(request: NextRequest): boolean {
  const expected = process.env.GPT_ACTION_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}
