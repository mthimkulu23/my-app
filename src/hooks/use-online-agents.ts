import { useEffect, useState } from 'react';

import { apiRequest, type AgentDirectoryEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function useOnlineAgents() {
  const { token } = useAuth();
  const [agents, setAgents] = useState<AgentDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!token) {
        setAgents([]);
        setLoading(false);
        return;
      }
      try {
        const result = await apiRequest<AgentDirectoryEntry[]>('/api/agents', {}, token);
        if (active) {
          setAgents(result);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load online agents.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void refresh();
    const interval = setInterval(refresh, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  return { agents, loading, error };
}