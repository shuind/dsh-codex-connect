/** Shared visual tokens and DSH-native styles for Codex Connect settings. */
import type { CSSProperties } from 'react'

/** Scoped stylesheet aligning Codex Connect with DSH Desktop & dsh-codex-harness. */
export const CODEX_CONNECT_SETTINGS_CSS = `
.cc-root { max-width: 760px; min-width: 0; font-size: 13px; color: var(--dsw-alias-label-primary); }
.cc-root * { box-sizing: border-box; }
.cc-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.cc-tabs { display: flex; align-items: flex-end; gap: 20px; min-width: 0; }
.cc-tab { position: relative; display: inline-flex; align-items: center; gap: 6px; border: 0; padding: 7px 1px 9px; background: transparent; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; white-space: nowrap; }
.cc-tab:hover { color: var(--dsw-alias-label-primary); }
.cc-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.cc-tab[aria-selected="true"]::after { position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-primary); content: ''; }
.cc-tab-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 5px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.14)); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1; font-variant-numeric: tabular-nums; }
.cc-card { border: 0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2)); border-radius: var(--dsw-radius-xl, 12px); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); padding: 14px 16px; }
.cc-card-title { margin: 0 0 10px; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.cc-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1, var(--dsw-alias-border-l2)); }
.cc-row:first-of-type { padding-top: 2px; }
.cc-row:last-child { border-bottom: 0; padding-bottom: 0; }
.cc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 28px; padding: 5px 11px; border: 0.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); border-radius: var(--dsw-radius-md, 8px); background: var(--dsw-alias-bg-layer-2, transparent); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.cc-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.cc-btn:disabled { opacity: 0.48; cursor: default; }
.cc-btn-danger { color: var(--dsw-alias-state-error-primary, #d92d20); background: transparent; }
.cc-btn-ghost { border-color: transparent; background: transparent; color: var(--dsw-alias-label-secondary); padding: 4px 8px; }
.cc-btn-ghost:hover:not(:disabled) { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.1)); }
.cc-input { width: 100%; min-height: 32px; padding: 5px 9px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md, 8px); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; line-height: 18px; }
.cc-input:disabled { opacity: 0.55; }
.cc-switch { appearance: none; -webkit-appearance: none; width: 34px; height: 20px; border: 0.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); border-radius: 16px; background: var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.2)); position: relative; cursor: pointer; flex: 0 0 auto; margin: 0; transition: background 0.15s ease; }
.cc-switch::before { content: ''; position: absolute; width: 14px; height: 14px; top: 2.5px; left: 2.5px; border-radius: 50%; background: var(--dsw-alias-label-secondary); transition: left 0.15s ease, background 0.15s ease; }
.cc-switch:checked { background: var(--dsw-alias-label-primary); border-color: transparent; }
.cc-switch:checked::before { left: 16.5px; background: var(--dsw-alias-bg-base, var(--dsw-alias-bg-layer-1)); }
.cc-switch:disabled { opacity: 0.45; cursor: default; }
.cc-root :is(input, select, button, a, summary):focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary)); outline-offset: 2px; }
.cc-savebar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 12px; padding: 10px 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-xl, 12px); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1); }
`

export const stackStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 }
export const fieldsetStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, margin: 0, padding: 0, border: 0, minWidth: 0 }
export const headingStyle: CSSProperties = { margin: 0, fontSize: 13, lineHeight: '18px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }
export const bodyStyle: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' }
export const labelStyle: CSSProperties = { fontSize: 13, lineHeight: '18px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }
export const monoStyle: CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)' }
export const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }
export const formFieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }
export const buttonsStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
export const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }
export const primaryButtonStyle: CSSProperties = {
  borderColor: 'var(--dsw-alias-button-primary-fill)',
  background: 'var(--dsw-alias-button-primary-fill)',
  color: 'var(--dsw-alias-label-primary-foreground)',
  fontWeight: 500,
}
export const errorStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-error-primary, #d92d20)' }
export const successStyle: CSSProperties = { ...bodyStyle, color: 'var(--dsw-alias-state-success-primary, #16825d)' }
export const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 18,
  padding: '0 6px',
  borderRadius: 999,
  background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.12))',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 11,
  lineHeight: '18px',
  fontWeight: 500,
}
export const activeBadgeStyle: CSSProperties = {
  ...badgeStyle,
  background: 'var(--dsw-alias-state-success-secondary, rgba(34, 160, 107, 0.12))',
  color: 'var(--dsw-alias-state-success-primary, #087a41)',
  fontWeight: 600,
}
export const subPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 10,
  padding: '10px 12px',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.06))',
}
export const quotaTitleStyle: CSSProperties = { margin: 0, fontSize: 12, lineHeight: '16px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' }
