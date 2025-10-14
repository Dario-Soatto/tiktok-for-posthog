import { NextRequest, NextResponse } from 'next/server';
import { SessionRecording, SessionRecordingsResponse } from '@/types/posthog';

export async function POST(request: NextRequest) {
  try {
    const { projectId, apiKey } = await request.json();

    // Validate inputs
    if (!projectId || !apiKey) {
      return NextResponse.json(
        { error: 'Project ID and API Key are required' },
        { status: 400 }
      );
    }

    // Determine the correct PostHog domain (defaulting to US)
    const posthogDomain = 'https://us.posthog.com';

    // Fetch MORE recordings initially since we'll filter many out
    // We want 10 good recordings, so fetch 50 to account for filtering
    const response = await fetch(
      `${posthogDomain}/api/projects/${projectId}/session_recordings?limit=50`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          error: 'Failed to fetch recordings from PostHog',
          details: errorData 
        },
        { status: response.status }
      );
    }

    const data: SessionRecordingsResponse = await response.json();
    
    // Filter recordings based on quality criteria
    const filteredRecordings = data.results.filter((recording: SessionRecording) => {
      // Must be at least 30 seconds long
      const isLongEnough = recording.recording_duration >= 30;
      
      // Must have at least 1 interaction (click or keypress)
      const hasInteraction = (recording.click_count + recording.keypress_count) >= 1;
      
      // Must be completed (not still ongoing)
      const isComplete = recording.ongoing === false;
      
      return isLongEnough && hasInteraction && isComplete;
    });

    console.log(`📊 Filtered ${data.results.length} recordings down to ${filteredRecordings.length}`);
    console.log(`   - Duration >= 30s: ${data.results.filter(r => r.recording_duration >= 30).length}`);
    console.log(`   - Has interaction: ${data.results.filter(r => (r.click_count + r.keypress_count) >= 1).length}`);
    console.log(`   - Is complete: ${data.results.filter(r => !r.ongoing).length}`);

    // Return all filtered recordings (removed the .slice(0, 10) limit)
    return NextResponse.json({
      count: filteredRecordings.length,
      next: data.next,
      previous: data.previous,
      results: filteredRecordings,
    });

  } catch (error) {
    console.error('Error fetching replays:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
