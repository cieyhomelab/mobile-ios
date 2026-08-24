import { useEffect, useState } from 'react';

import { hasRequiredKeys } from '@/lib/secure-keys';

export type ByokStatusState = 'checking' | 'ready' | 'missing';

export type ByokStatus = {
  state: ByokStatusState;
};

export function useByokStatus(): ByokStatus {
  const [state, setState] = useState<ByokStatusState>('checking');

  useEffect(() => {
    void (async () => {
      try {
        const ready = await hasRequiredKeys();
        setState(ready ? 'ready' : 'missing');
      } catch {
        setState('missing');
      }
    })();
  }, []);

  return { state };
}
