import { NextRequest, NextResponse } from 'next/server';
import pako from 'pako';

// Helper to decompress if needed
function maybeDecompress(data: unknown): unknown {
  if (typeof data === 'string' && data.charCodeAt(0) === 0x1f && data.charCodeAt(1) === 0x8b) {
    try {
      // Convert string to Uint8Array
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i);
      }
      const decompressed = pako.inflate(bytes, { to: 'string' });
      return JSON.parse(decompressed);
    } catch (e) {
      console.error('Decompression error:', e);
      return data;
    }
  }
  return data;
}

// Add interface for blob source
interface BlobSource {
  source: string;
  blob_key?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { projectId, apiKey } = await request.json();

    if (!projectId || !apiKey) {
      return NextResponse.json(
        { error: 'Project ID and API Key are required' },
        { status: 400 }
      );
    }

    const posthogDomain = 'https://us.posthog.com';

    // STEP 1: Get the list of blob keys
    console.log('Fetching blob keys list...');
    const sourcesResponse = await fetch(
      `${posthogDomain}/api/projects/${projectId}/session_recordings/${id}/snapshots?blob_v2=true`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!sourcesResponse.ok) {
      const errorData = await sourcesResponse.json().catch(() => ({}));
      return NextResponse.json(
        { 
          error: 'Failed to fetch snapshot sources',
          details: errorData 
        },
        { status: sourcesResponse.status }
      );
    }

    const sourcesData = await sourcesResponse.json();

    if (!sourcesData.sources || sourcesData.sources.length === 0) {
      return NextResponse.json({ sources: [] });
    }

    // STEP 2: Extract blob keys and batch them
    const blobKeys = (sourcesData.sources as BlobSource[])
      .filter((source) => source.source === 'blob_v2' && source.blob_key !== undefined)
      .map((source) => source.blob_key as number)
      .sort((a: number, b: number) => a - b);

    console.log(`Found ${blobKeys.length} blobs to fetch`);

    if (blobKeys.length === 0) {
      return NextResponse.json({ sources: [] });
    }

    // STEP 3: Create batches of up to 20 blob keys
    const BATCH_SIZE = 20;
    const batches: number[][] = [];
    
    for (let i = 0; i < blobKeys.length; i += BATCH_SIZE) {
      batches.push(blobKeys.slice(i, i + BATCH_SIZE));
    }

    console.log(`Created ${batches.length} batches (max ${BATCH_SIZE} blobs each)`);

    // STEP 4: Fetch each batch
    const allEvents: unknown[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const startKey = batch[0];
      const endKey = batch[batch.length - 1];
      
      console.log(`Fetching batch ${i + 1}/${batches.length}: blobs ${startKey}-${endKey}`);
      
      const snapshotResponse = await fetch(
        `${posthogDomain}/api/projects/${projectId}/session_recordings/${id}/snapshots?source=blob_v2&start_blob_key=${startKey}&end_blob_key=${endKey}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (snapshotResponse.ok) {
        const rawText = await snapshotResponse.text();
        const lines = rawText.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            // Data comes as [windowId, event] pairs
            if (Array.isArray(parsed) && parsed.length === 2) {
              const event = parsed[1] as Record<string, unknown>;
              // DECOMPRESS the data field if needed
              if (event.data) {
                event.data = maybeDecompress(event.data);
              }
              allEvents.push(event);
            }
          } catch (e) {
            console.error('Failed to parse line:', e);
          }
        }
      } else {
        console.error(`Failed to fetch batch ${i + 1}, status: ${snapshotResponse.status}`);
      }
    }

    // Sort by timestamp for proper playback
    allEvents.sort((a, b) => {
      const aEvent = a as { timestamp?: number };
      const bEvent = b as { timestamp?: number };
      return (aEvent.timestamp || 0) - (bEvent.timestamp || 0);
    });

    console.log(`✅ Collected ${allEvents.length} events from ${batches.length} batch(es)`);

    return NextResponse.json({ sources: allEvents });

  } catch (error) {
    console.error('Error fetching snapshots:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
