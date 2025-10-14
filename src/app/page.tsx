'use client';

import { useLocalStorage } from '@/hooks/useLocalStorage';
import CredentialsForm from '@/components/CredentialsForm';
import ReplayFeed from '@/components/ReplayFeed';

interface Credentials {
  projectId: string;
  apiKey: string;
}

export default function Home() {
  const [credentials, setCredentials] = useLocalStorage<Credentials | null>(
    'posthog-credentials',
    null
  );

  const handleCredentialsSubmit = (creds: Credentials) => {
    setCredentials(creds);
  };

  const handleLogout = () => {
    setCredentials(null);
  };

  return (
    <>
      {!credentials ? (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
          <CredentialsForm onSubmit={handleCredentialsSubmit} />
        </div>
      ) : (
        <ReplayFeed credentials={credentials} onLogout={handleLogout} />
      )}
    </>
  );
}
