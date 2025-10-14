// Type for a session recording from PostHog API
export interface SessionRecording {
    id: string;
    distinct_id: string;
    viewed: boolean;
    recording_duration: number; // in seconds
    start_time: string; // ISO date string
    end_time: string;
    click_count: number;
    keypress_count: number;
    start_url: string;
    person: {
      id: number;
      name: string;
      distinct_ids: string;
      properties: Record<string, unknown> | null;  // Changed from any
    } | null;
    ongoing: boolean;
  }
  
  // Response from listing recordings
  export interface SessionRecordingsResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: SessionRecording[];
  }
  
  // rrweb event types
  export interface RRWebEvent {
    type: number;
    data: unknown;  // Changed from any
    timestamp: number;
    delay?: number;
  }
  
  // Response from snapshots endpoint
  export interface SnapshotsResponse {
    snapshot_data_by_window_id: Record<string, RRWebEvent[]>;
  }
  