'use client';

import { useEffect, useRef, useState } from 'react';
import type rrwebPlayer from 'rrweb-player';
import type { RRWebEvent } from '@/types/posthog';
import 'rrweb-player/dist/style.css';

interface ReplayPlayerProps {
  recordingId: string;
  snapshots: RRWebEvent[];
  autoPlay?: boolean;
  onFinish?: () => void;
}

export default function ReplayPlayer({ 
  recordingId, 
  snapshots, 
  autoPlay = true,
  onFinish
}: ReplayPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Calculate responsive dimensions
  useEffect(() => {
    const calculateDimensions = () => {
      const maxWidth = Math.min(800, window.innerWidth - 32);
      const maxHeight = Math.min(600, window.innerHeight * 0.6);
      setDimensions({ width: maxWidth, height: maxHeight });
    };

    calculateDimensions();
    window.addEventListener('resize', calculateDimensions);
    return () => window.removeEventListener('resize', calculateDimensions);
  }, []);

  useEffect(() => {
    const initPlayer = async () => {
      try {
        console.log('🎬 Init called - snapshots:', snapshots.length, 'container:', !!containerRef.current);
        
        if (snapshots.length === 0) {
          setError('No snapshots available');
          return;
        }

        if (!containerRef.current) {
          console.warn('Container not ready, waiting...');
          // Retry after a short delay
          setTimeout(initPlayer, 100);
          return;
        }

        // Import rrweb-player dynamically
        const { default: rrwebPlayer } = await import('rrweb-player');

        // Clean up previous player if exists
        if (playerRef.current) {
          playerRef.current.pause();
          containerRef.current.innerHTML = '';
        }

        console.log('✅ Initializing player with events:', snapshots);

        // Create new player instance
        playerRef.current = new rrwebPlayer({
          target: containerRef.current,
          props: {
            events: snapshots,
            autoPlay,
            width: dimensions.width,
            height: dimensions.height,
            showController: true,
            speed: 8,
            speedOption: [1, 2, 4, 8, 16],
            skipInactive: true,
          },
        });

        // Explicitly set speed after initialization to ensure UI reflects it
        if (playerRef.current) {
          playerRef.current.setSpeed(8);
        }

        // Listen for finish event
        if (playerRef.current && onFinish) {
          playerRef.current.addEventListener('finish', onFinish);
        }

        console.log('✅ Player created successfully');
      } catch (err) {
        console.error('❌ Error initializing player:', err);
        setError(`Failed to load replay player: ${err}`);
      }
    };

    initPlayer();

    // Cleanup on unmount
    return () => {
      if (playerRef.current) {
        playerRef.current.pause();
      }
    };
  }, [snapshots, autoPlay, recordingId, dimensions, onFinish]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-red-50 dark:bg-red-900/20 rounded-lg">
        <div className="text-center text-red-600 dark:text-red-400">
          <p className="font-semibold mb-2">Error</p>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center">
      <div ref={containerRef} className="rounded-lg overflow-hidden shadow-lg" />
    </div>
  );
}
