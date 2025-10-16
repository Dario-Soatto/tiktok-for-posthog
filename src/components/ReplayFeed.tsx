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
  const [playerWidth, setPlayerWidth] = useState(800); // Add this state

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

  useEffect(() => {
    if (recordings.length > 0) {
      prefetchRecordings(recordings, currentIndex);
    }
  }, [currentIndex, recordings]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingProgrammatically.current) return;

      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const newIndex = Math.round(scrollTop / containerHeight);

      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < recordings.length) {
        setCurrentIndex(newIndex);
        setSnapshotError(null);
      }
    };

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

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isScrollingProgrammatically.current = true;
    const targetScroll = index * container.clientHeight;
    
    container.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    });

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

  const prefetchRecordings = useCallback((recordingsList: SessionRecording[], fromIndex: number) => {
    const endIndex = Math.min(fromIndex + 5, recordingsList.length);
    
    for (let i = fromIndex; i < endIndex; i++) {
      const recording = recordingsList[i];
      fetchSnapshotsForRecording(recording.id, i === fromIndex);
    }
  }, [snapshots, fetchingIds]);

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

  const handlePlayerDimensionsChange = useCallback((width: number, height: number) => {
    setPlayerWidth(width);
  }, []);

  // Calculate left and right offsets for footer to align with replay box edges
  const footerOffset = Math.max(0, (typeof window !== 'undefined' ? window.innerWidth : 0) - playerWidth) / 2;

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

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-black">
      {/* Fixed Header - Black/Transparent */}
      <header className="absolute top-0 left-0 right-0 z-20 bg-black/50 backdrop-blur-sm">
        <div className="px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">TikHog</h1>
          <Button variant="ghost" size="sm" onClick={onLogout} className="text-white hover:bg-white/10">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Scrollable container with snap points */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-scroll overflow-x-hidden snap-y snap-mandatory"
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
              className="w-full h-full snap-start snap-always flex items-center justify-center shrink-0"
            >
              {/* Main replay area - constrained by header/footer with aspect ratio maintained */}
              <div className="w-full h-full flex items-center justify-center px-4" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
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
                    onDimensionsChange={isActive ? handlePlayerDimensionsChange : undefined}
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
            </div>
          );
        })}
      </div>

      {/* Fixed Footer - Black/Transparent, Compact */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 bg-black/50 backdrop-blur-sm">
        <div 
          className="py-3 flex items-end justify-between text-xs text-white/80" 
          style={{ 
            paddingLeft: `${footerOffset}px`, 
            paddingRight: `${footerOffset}px` 
          }}
        >
          {/* Left side - Recording info (stacked vertically) */}
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              {currentRecording?.person?.name || currentRecording?.distinct_id || 'Unknown'}
            </span>
            <a
              href={`https://us.posthog.com/project/${credentials.projectId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white inline-flex items-center gap-1"
            >
              Project {credentials.projectId}
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`https://us.posthog.com/project/${credentials.projectId}/replay/${currentRecording?.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white inline-flex items-center gap-1"
            >
              View in PostHog
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Right side - Navigation */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <span className="text-white/80">
              {currentIndex + 1} / {recordings.length}
            </span>

            <Button
              onClick={handleNext}
              disabled={currentIndex === recordings.length - 1}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-white hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
