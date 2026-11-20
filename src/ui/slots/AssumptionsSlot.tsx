import { Assumptions } from '../Assumptions';

export function AssumptionsSlot() {
  return (
    <details className="panel fold" aria-label="Assumptions and validation">
      <summary>Assumptions &amp; validation</summary>
      <Assumptions />
    </details>
  );
}
