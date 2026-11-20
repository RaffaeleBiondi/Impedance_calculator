import { StoreProvider, useStore } from '../state/store';
import { StackupEditor } from './StackupEditor';
import { CalculatorSlot } from './slots/CalculatorSlot';
import { ToolsSlot } from './slots/ToolsSlot';
import { AssumptionsSlot } from './slots/AssumptionsSlot';
import './theme.css';

function Shell() {
  const { notice, dispatch } = useStore();
  return (
    <div className="app">
      <header className="top">
        <h1>LordOfTheOhms</h1>
        <p>PCB trace impedance calculator. Runs entirely in your browser.</p>
      </header>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => dispatch({ type: 'dismissNotice' })} aria-label="Dismiss">Dismiss</button>
        </div>
      )}
      <main className="cols">
        <StackupEditor />
        <CalculatorSlot />
      </main>
      <ToolsSlot />
      <AssumptionsSlot />
    </div>
  );
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}
