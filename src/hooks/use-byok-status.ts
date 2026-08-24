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
      const ready = await hasRequiredKeys();
      setState(ready ? 'ready' : 'missing');
    })();
  }, []);

  return { state };
}
