import { Sweep } from '../Sweep';
import { WidthTable } from '../WidthTable';

export function ToolsSlot() {
  return (
    <section className="panel tools" aria-label="Sweep and width table">
      <Sweep />
      <WidthTable />
    </section>
  );
}
