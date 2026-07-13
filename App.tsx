import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import { hydrateSyncQueue } from './src/modules/offlineSync';

export default function App() {
  useEffect(() => {
    // Restore any queued offline actions persisted before the last shutdown
    // so they are not lost across restarts/reboots (Req 15.1).
    void hydrateSyncQueue();
  }, []);

  return (
    <Provider store={store}>
      <AppNavigator />
    </Provider>
  );
}
