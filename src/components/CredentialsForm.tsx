'use client';

import { useState } from 'react';

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
    <div className="max-w-md w-full mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold mb-6 text-center">PostHog Replay Viewer</h1>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="projectId" className="block text-sm font-medium mb-2">
            PostHog Project ID
          </label>
          <input
            id="projectId"
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="12345"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Find this in PostHog under Project Settings
          </p>
        </div>

        <div>
          <label htmlFor="apiKey" className="block text-sm font-medium mb-2">
            Personal API Key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="phx_..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Create one in PostHog under Personal API Keys
          </p>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Load Replays
        </button>
      </form>
    </div>
  );
}
