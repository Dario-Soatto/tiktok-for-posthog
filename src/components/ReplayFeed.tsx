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
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);

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

  // Detect scroll position to update current index
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Skip if we're scrolling programmatically
      if (isScrollingProgrammatically.current) return;

      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const newIndex = Math.round(scrollTop / containerHeight);

      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < recordings.length) {
        setCurrentIndex(newIndex);
        setSnapshotError(null);
      }
    };

    // Use a slight debounce to avoid too many updates
    let timeoutId: NodeJS.Timeout;
    const debouncedHandleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(handleScroll, 100);
    };

    container.addEventListener('scroll', debouncedHandleScroll, { passive: true });
    
    return () => {
      container.removeEventListener('scroll', debouncedHandleScroll);
      clearTimeout(timeoutId);
    };
  }, [currentIndex, recordings.length]);

  // Navigation functions
  const scrollToIndex = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isScrollingProgrammatically.current = true;
    const targetScroll = index * container.clientHeight;
    
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    });

    // Reset flag after animation
    setTimeout(() => {
      isScrollingProgrammatically.current = false;
    }, 500);

    setCurrentIndex(index);
    setSnapshotError(null);
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < recordings.length - 1) {
      scrollToIndex(currentIndex + 1);
    }
  }, [currentIndex, recordings.length, scrollToIndex]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      scrollToIndex(currentIndex - 1);
    }
  }, [currentIndex, scrollToIndex]);

  // Prefetch recordings from current index to current index + 4
  const prefetchRecordings = useCallback((recordingsList: SessionRecording[], fromIndex: number) => {
    const endIndex = Math.min(fromIndex + 5, recordingsList.length);
    
    for (let i = fromIndex; i < endIndex; i++) {
      const recording = recordingsList[i];
      fetchSnapshotsForRecording(recording.id, i === fromIndex);
    }
  }, [snapshots, fetchingIds]);

  // Fetch snapshots for a specific recording
  const fetchSnapshotsForRecording = async (recordingId: string, isPrimary: boolean = false) => {
    if (snapshots[recordingId] || fetchingIds.has(recordingId)) {
      return;
    }

    setFetchingIds(prev => new Set(prev).add(recordingId));

    try {
      console.log(`${isPrimary ? '🎯' : '⏳'} Fetching snapshots for recording ${recordingId}...`);
      
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
      if (isPrimary) {
        setSnapshotError(err instanceof Error ? err.message : 'Failed to load snapshot data');
      }
    } finally {
      setFetchingIds(prev => {
        const next = new Set(prev);
        next.delete(recordingId);
        return next;
      });
    }
  };

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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Fixed Header */}
      <header className="border-b bg-card z-10 flex-shrink-0">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold">PostHog Replays</h1>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Scrollable container with snap points */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        
        {recordings.map((recording, index) => {
          const currentSnapshots = snapshots[recording.id] || [];
          const isActive = index === currentIndex;
          
          return (
            <div
              key={recording.id}
              className="h-screen w-full snap-start snap-always flex flex-col"
            >
              {/* Main replay area */}
              <div className="flex-1 flex items-center justify-center bg-black p-4">
                {snapshotError && isActive ? (
                  <div className="text-center max-w-md">
                    <p className="text-destructive mb-4 font-semibold">Failed to load replay</p>
                    <p className="text-sm text-muted-foreground mb-4">{snapshotError}</p>
                    <Button onClick={() => fetchSnapshotsForRecording(recording.id, true)}>
                      Retry
                    </Button>
                  </div>
                ) : currentSnapshots.length > 0 ? (
                  <ReplayPlayer
                    key={recording.id}
                    recordingId={recording.id}
                    snapshots={currentSnapshots}
                    autoPlay={isActive}
                    onFinish={handleNext}
                  />
                ) : (
                  <div className="text-center text-white">
                    <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
                    <p>Loading replay data...</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Recording {index + 1} of {recordings.length}
                    </p>
                  </div>
                )}
              </div>

              {/* Recording info */}
              <div className="border-t bg-card flex-shrink-0">
                <div className="container mx-auto px-4 py-4 text-center">
                  <p className="font-semibold mb-1">
                    {recording.person?.name || recording.distinct_id}
                  </p>
                  <p className="text-sm text-muted-foreground mb-2 truncate">
                    {recording.start_url}
                  </p>
                  <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                    <Badge variant="secondary">
                      Duration: {formatDuration(recording.recording_duration)}
                    </Badge>
                    <Badge variant="secondary">{recording.click_count} clicks</Badge>
                    <Badge variant="secondary">{recording.keypress_count} keypresses</Badge>
                  </div>
                  <a
                    href={`https://us.posthog.com/project/${credentials.projectId}/replay/${recording.id}`}
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
              <div className="border-t bg-card flex-shrink-0">
                <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                  <Button
                    onClick={handlePrevious}
                    disabled={index === 0}
                    variant="outline"
                    size="default"
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>

                  <Badge variant="outline" className="text-sm">
                    {index + 1} / {recordings.length}
                  </Badge>

                  <Button
                    onClick={handleNext}
                    disabled={index === recordings.length - 1}
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
        })}
      </div>
    </div>
  );
}
