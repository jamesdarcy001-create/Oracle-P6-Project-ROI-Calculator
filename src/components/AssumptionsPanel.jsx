import { getAssumptionSections, MODEL_VERSION } from "../model/assumptions.js";
import { fmtPlain } from "../model/format.js";

export default function AssumptionsPanel({ open, onClose, inputs, results }) {
  if (!open || !results) return null;
  const sections = getAssumptionSections(inputs, results);

  return (
    <div className="sc-overlay ap-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ap-panel" role="dialog" aria-labelledby="ap-title">
        <div className="ap-head">
          <div>
            <div className="sc-title" id="ap-title">
              ASSUMPTIONS
            </div>
            <div className="ap-sub">How each line item is calculated · model v{MODEL_VERSION}</div>
          </div>
          <button type="button" className="hdr-btn" onClick={onClose}>
            ESC
          </button>
        </div>
        <div className="ap-body">
          {sections.map((sec) => (
            <section key={sec.title} className="ap-section">
              <h3 className="ap-sec-title">{sec.title}</h3>
              {sec.items.map((item) => (
                <div key={item.name} className="ap-row">
                  <div className="ap-row-top">
                    <span className="ap-name">{item.name}</span>
                    <span className="ap-amt">{fmtPlain(item.amount)}</span>
                  </div>
                  <p className="ap-formula">{item.formula}</p>
                </div>
              ))}
            </section>
          ))}
        </div>
        <p className="ap-foot">
          Indicative model for discovery conversations. Adjust inputs and platform cost to match your deployment.
        </p>
      </div>
    </div>
  );
}
