import { useMachine } from '@xstate/react';
import { orchestratorMachine } from './machines/orchestratorMachine';
import { AppShell } from './components/AppShell/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';

export default function App() {
  const [, , actor] = useMachine(orchestratorMachine);
  return (
    <ErrorBoundary>
      <AppShell actor={actor} />
    </ErrorBoundary>
  );
}
