import { useMachine } from '@xstate/react';
import { orchestratorMachine } from './machines/orchestratorMachine';
import { AppShell } from './components/AppShell/AppShell';

export default function App() {
  const [, , actor] = useMachine(orchestratorMachine);
  return <AppShell actor={actor} />;
}
