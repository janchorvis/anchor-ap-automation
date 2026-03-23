import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { getRunHistory } from "@/lib/settings";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const history = await getRunHistory();
  return NextResponse.json(history);
}
