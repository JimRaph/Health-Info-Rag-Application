import { NextResponse } from "next/server";

export async function GET() {
  console.log(process.env.RAG_SERVICE_URL)
  return NextResponse.json({
    ragUrl: process.env.RAG_SERVICE_URL,
  });
}
