import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.FIREBASE_API_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!apiKey || !projectId) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
  return NextResponse.json({
    apiKey,
    projectId,
  });
}
