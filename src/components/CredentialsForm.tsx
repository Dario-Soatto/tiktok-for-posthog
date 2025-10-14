'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface CredentialsFormProps {
  onSubmit: (credentials: { projectId: string; apiKey: string }) => void;
  initialValues?: { projectId: string; apiKey: string };
}

export default function CredentialsForm({ onSubmit, initialValues }: CredentialsFormProps) {
  const [projectId, setProjectId] = useState(initialValues?.projectId || '');
  const [apiKey, setApiKey] = useState(initialValues?.apiKey || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (projectId && apiKey) {
      onSubmit({ projectId, apiKey });
    }
  };

  return (
    <Card className="max-w-md w-full mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl text-center">PostHog Replay Viewer</CardTitle>
        <CardDescription className="text-center">
          Enter your PostHog credentials to view session replays
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="projectId">PostHog Project ID</Label>
            <Input
              id="projectId"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="12345"
              required
            />
            <p className="text-xs text-muted-foreground">
              Find this in PostHog under Project Settings
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">Personal API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="phx_..."
              required
            />
            <p className="text-xs text-muted-foreground">
              Create one in PostHog under Personal API Keys
            </p>
          </div>

          <Button type="submit" className="w-full">
            Load Replays
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
