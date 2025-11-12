import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';

export const prerender = false;

interface VisitorData {
  count: number;
  ips: string[];
  month: string;
}

// Get current month key (YYYY-MM format)
function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Get client IP from request headers
function getClientIP(request: Request): string {
  // Try various headers Netlify might use
  const headers = request.headers;
  return (
    headers.get('x-nf-client-connection-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const store = getStore('visitors');
    const monthKey = getCurrentMonthKey();
    const clientIP = getClientIP(request);

    // Get existing visitor data for this month
    const existingData = await store.get(monthKey, { type: 'json' }) as VisitorData | null;

    let visitorData: VisitorData;

    if (!existingData) {
      // First visitor this month
      visitorData = {
        count: 1,
        ips: [clientIP],
        month: monthKey,
      };
      await store.setJSON(monthKey, visitorData);
    } else {
      // Check if this IP has visited this month
      if (!existingData.ips.includes(clientIP)) {
        // New unique visitor
        visitorData = {
          count: existingData.count + 1,
          ips: [...existingData.ips, clientIP],
          month: monthKey,
        };
        await store.setJSON(monthKey, visitorData);
      } else {
        // Returning visitor (already counted)
        visitorData = existingData;
      }
    }

    return new Response(
      JSON.stringify({
        count: visitorData.count,
        month: monthKey,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Error tracking visitor:', error);

    // Check if this is a MissingBlobsEnvironmentError (local development)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('MissingBlobsEnvironmentError') || errorMessage.includes('not been configured to use Netlify Blobs')) {
      console.log('Local development mode: Returning mock visitor count');
      // Return mock data for local development
      return new Response(
        JSON.stringify({
          count: 42,
          month: getCurrentMonthKey(),
          note: 'Mock data - visitor tracking will work when deployed to Netlify'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Failed to track visitor', count: 0 }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
