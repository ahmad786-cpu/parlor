import { NextResponse } from 'next/server';

// An error whose message is safe to show. `fatal` tells the chat client the conversation cannot continue.
export class HttpError extends Error {
  constructor(public status: number, message: string, public fatal = false) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

// Wraps a route handler so thrown HttpErrors become JSON responses and anything else a generic 500.
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, fatal: err.fatal }, err.status);
      console.error(err);
      return json({ error: 'Server error.' }, 500);
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new HttpError(400, 'Send a JSON body.');
  }
}

// Vercel sets these headers itself and drops values sent by the client, so they cannot be forged there.
export function clientIp(req: Request): string {
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    'local'
  );
}
