'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReplayPlayer from './ReplayPlayer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Loader2, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import type { SessionRecording, RRWebEvent } from '@/types/posthog';

interface ReplayFeedProps {
  credentials: {
    projectId: string;
    apiKey: string;
  };
  onLogout: () => void;
}

export default function ReplayFeed({ credentials, onLogout }: ReplayFeedProps) {
  const [recordings, setRecordings] = useState<SessionRecording[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [snapshots, setSnapshots] = useState<Record<string, RRWebEvent[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set()); // Track in-flight requests
  const lastScrollTime = useRef<number>(0);  // Add this to prevent rapid scrolling

  // Fetch list of recordings on mount
  useEffect(() => {
    const fetchRecordings = async () => {
      try {
        setIsLoading(true);
        console.log('Fetching recordings...');
        const response = await fetch('/api/replays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('Failed to fetch recordings:', errorData);
          throw new Error('Failed to fetch recordings');
        }

        const data = await response.json();
        console.log('Recordings data:', data);
        setRecordings(data.results || []);
        
        // Prefetch first 5 recordings
        if (data.results && data.results.length > 0) {
          console.log('🚀 Prefetching first 5 recordings...');
          prefetchRecordings(data.results, 0);
        }
      } catch (err) {
        console.error('Error fetching recordings:', err);
        setError('Failed to load recordings. Check your credentials.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecordings();
  }, [credentials]);

  // Prefetch next 5 recordings when current index changes
  useEffect(() => {
    if (recordings.length > 0) {
      prefetchRecordings(recordings, currentIndex);
    }
  }, [currentIndex, recordings]);

  // Add this new useEffect for scroll navigation
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const now = Date.now();
      // Increase debounce to 1500ms for more reliable single navigation
      if (now - lastScrollTime.current < 1500) {
        e.preventDefault();
        return;
      }

      // Require a minimum scroll threshold to avoid tiny accidental scrolls
      if (Math.abs(e.deltaY) < 50) {
        return;
      }

      if (e.deltaY > 0) {
        // Scrolling down = next recording
        if (currentIndex < recordings.length - 1) {
          e.preventDefault();
          lastScrollTime.current = now;
          handleNext();
        }
      } else if (e.deltaY < 0) {
        // Scrolling up = previous recording
        if (currentIndex > 0) {
          e.preventDefault();
          lastScrollTime.current = now;
          handlePrevious();
        }
      }
    };

    window.addEventListener('wheel', handleWheel);
    
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [currentIndex, recordings.length]);

  // Prefetch recordings from current index to current index + 4
  const prefetchRecordings = useCallback((recordingsList: SessionRecording[], fromIndex: number) => {
    const endIndex = Math.min(fromIndex + 5, recordingsList.length);
    
    for (let i = fromIndex; i < endIndex; i++) {
      const recording = recordingsList[i];
      // Fetch in background without awaiting
      fetchSnapshotsForRecording(recording.id, i === fromIndex);
    }
  }, [snapshots, fetchingIds]);

  // Fetch snapshots for a specific recording
  const fetchSnapshotsForRecording = async (recordingId: string, isPrimary: boolean = false) => {
    // Don't fetch if we already have it or it's already being fetched
    if (snapshots[recordingId] || fetchingIds.has(recordingId)) {
      return;
    }

    // Mark as being fetched
    setFetchingIds(prev => new Set(prev).add(recordingId));

    try {
      console.log(`${isPrimary ? '🎯' : '⏳'} Fetching snapshots for recording ${recordingId}...`);
      
      // Only clear error for the primary (current) recording
      if (isPrimary) {
        setSnapshotError(null);
      }
      
      const response = await fetch(`/api/replays/${recordingId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to fetch snapshots:', response.status, errorData);
        throw new Error(`HTTP ${response.status}: ${errorData.error || 'Failed to fetch snapshots'}`);
      }

      const data = await response.json();
      
      // Try to extract snapshots - PostHog might return different formats
      let allSnapshots: RRWebEvent[] = [];
      
      if (data.snapshot_data_by_window_id) {
        allSnapshots = Object.values(data.snapshot_data_by_window_id).flat() as RRWebEvent[];
      } else if (data.sources) {
        allSnapshots = data.sources as RRWebEvent[];
      } else if (Array.isArray(data)) {
        allSnapshots = data;
      } else if (data.snapshots) {
        allSnapshots = data.snapshots;
      } else {
        console.warn('Unknown snapshot format:', Object.keys(data));
        throw new Error('Unknown snapshot data format');
      }

      if (allSnapshots.length === 0) {
        throw new Error('No snapshot data found in response');
      }
      
      setSnapshots(prev => ({
        ...prev,
        [recordingId]: allSnapshots,
      }));
      console.log(`✅ Loaded ${allSnapshots.length} snapshots for ${recordingId}`);
      
    } catch (err) {
      console.error('Error fetching snapshots:', err);
      // Only set error state for the primary (current) recording
      if (isPrimary) {
        setSnapshotError(err instanceof Error ? err.message : 'Failed to load snapshot data');
      }
    } finally {
      // Remove from in-flight set
      setFetchingIds(prev => {
        const next = new Set(prev);
        next.delete(recordingId);
        return next;
      });
    }
  };

  // Navigate to next recording
  const handleNext = useCallback(() => {
    if (currentIndex < recordings.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSnapshotError(null);
      // Prefetching happens automatically via useEffect
    }
  }, [currentIndex, recordings.length]);

  // Navigate to previous recording
  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSnapshotError(null);
      // Prefetching happens automatically via useEffect
    }
  }, [currentIndex]);

  // Format duration in seconds to mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-4" />
          <p className="text-xl text-muted-foreground">Loading replays...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-destructive mb-4">{error}</p>
          <Button onClick={onLogout}>Try Different Credentials</Button>
        </div>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-xl text-muted-foreground mb-4">No recordings found</p>
          <Button onClick={onLogout}>Change Credentials</Button>
        </div>
      </div>
    );
  }

  const currentRecording = recordings[currentIndex];
  const currentSnapshots = snapshots[currentRecording.id] || [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold">PostHog Replays</h1>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main replay area */}
      <div className="flex-1 flex items-center justify-center bg-black p-4">
        {snapshotError ? (
          <div className="text-center max-w-md">
            <p className="text-destructive mb-4 font-semibold">Failed to load replay</p>
            <p className="text-sm text-muted-foreground mb-4">{snapshotError}</p>
            <Button onClick={() => fetchSnapshotsForRecording(currentRecording.id, true)}>
              Retry
            </Button>
          </div>
        ) : currentSnapshots.length > 0 ? (
          <ReplayPlayer
            key={currentRecording.id}
            recordingId={currentRecording.id}
            snapshots={currentSnapshots}
            autoPlay={true}
            onFinish={handleNext}
          />
        ) : (
          <div className="text-center text-white">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
            <p>Loading replay data...</p>
            <p className="text-xs text-muted-foreground mt-2">
              Recording {currentIndex + 1} of {recordings.length}
            </p>
          </div>
        )}
      </div>

      {/* Recording info */}
      <div className="border-t bg-card">
        <div className="container mx-auto px-4 py-4 text-center">
          <p className="font-semibold mb-1">
            {currentRecording.person?.name || currentRecording.distinct_id}
          </p>
          <p className="text-sm text-muted-foreground mb-2 truncate">
            {currentRecording.start_url}
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
            <Badge variant="secondary">
              Duration: {formatDuration(currentRecording.recording_duration)}
            </Badge>
            <Badge variant="secondary">{currentRecording.click_count} clicks</Badge>
            <Badge variant="secondary">{currentRecording.keypress_count} keypresses</Badge>
          </div>
          <a
            href={`https://us.posthog.com/project/${credentials.projectId}/replay/${currentRecording.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            View in PostHog
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <Separator />

      {/* Navigation controls */}
      <div className="border-t bg-card">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            variant="outline"
            size="default"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <Badge variant="outline" className="text-sm">
            {currentIndex + 1} / {recordings.length}
          </Badge>

          <Button
            onClick={handleNext}
            disabled={currentIndex === recordings.length - 1}
            variant="outline"
            size="default"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
