// Technical checks retained by the Oruga profile. Taste and factual truth need review.
const ACTIVE = new Set(['10', '10a', '10b', '15', '17', '18', '24a', '24b', '26a', '26b', '27', '39a', '39b', '40', '41', '48', '53', '62', '70', '73', '74', '76', 'F3', 'F6', 'F21', 'F22', 'F23', 'F25', 'kept', 'render', 'a11y']);
const BLOCKING = new Set(['10a', '15', '27', '62', '73', '76', 'kept', 'render', 'a11y']);
export function normalizeFinding(finding) {
  const g = String(finding.gate);
  // Upstream gate 34 also mandates global overflow clipping. Retain actual rendered overflow only.
  const overflow = g === '34' && /\[\d+px\]/.test(finding.evidence) && /overflow|wider|horizontal|scrollWidth/i.test(finding.evidence);
  if (!ACTIVE.has(g) && !overflow) return null;
  let grade = finding.grade;
  if (['FAIL', 'REFLEX'].includes(grade) && !BLOCKING.has(g) && !overflow) grade = 'WARN';
  if (g === '26a' && /nothing shows keyboard focus|focus ring .*:1/.test(finding.evidence)) grade = finding.grade;
  if (['40', '41'].includes(g) && /\[\d+px\]/.test(finding.evidence)) grade = finding.grade;
  return { ...finding, gate: g, grade, tier: 'technical',
    fix: overflow ? 'Find and fix the overflowing content or grid; preserve visible content and focus rings.' : g === '26b' ? 'Verify the states relevant to this control; use real keyboard/click tests.' : finding.fix };
}
