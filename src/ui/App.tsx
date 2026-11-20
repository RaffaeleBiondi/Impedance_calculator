import { useState } from 'react';
import { StoreProvider, useStore } from '../state/store';
import { StackupEditor } from './StackupEditor';
import { CalculatorSlot } from './slots/CalculatorSlot';
import { ToolsSlot } from './slots/ToolsSlot';
import { AssumptionsSlot } from './slots/AssumptionsSlot';
import { ImportDialog } from './ImportDialog';
import { ThemeToggle } from './ThemeToggle';
import logo128 from '../assets/logo-header-128.png';
import logo256 from '../assets/logo-header-256.png';
import './theme.css';

function Shell() {
  const { notice, dispatch } = useStore();
  const [importing, setImporting] = useState(false);
  return (
    <div className="app">
      <header className="top">
        <img className="logo" src={logo128} srcSet={`${logo128} 1x, ${logo256} 2x`} width={40} height={40} alt="LordOfTheOhms logo" />
        <div className="titles">
          <h1>LordOfTheOhms</h1>
          <p>PCB trace impedance calculator</p>
        </div>
        <button type="button" onClick={() => setImporting(true)}>Import KiCad&hellip;</button>
        <ThemeToggle />
      </header>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => dispatch({ type: 'dismissNotice' })} aria-label="Dismiss">Dismiss</button>
        </div>
      )}
      <main className="cols">
        <StackupEditor onImportKicad={() => setImporting(true)} />
        <CalculatorSlot />
      </main>
      <ToolsSlot />
      <AssumptionsSlot />
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}
