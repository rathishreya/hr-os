import { Settings2 } from 'lucide-react'
import { Button, Modal, cx } from '../../ui'
import { DRAWER_TAB_OPTIONS } from '../../hooks/useDrawerPreferences'

function ToggleRow({ label, checked, onChange, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
      <input type="checkbox" className="mt-0.5 rounded border-slate-300" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  )
}

function OptionPills({ value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cx(
            'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
            value === opt.value
              ? 'border-violet-300 bg-violet-50 text-violet-800'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function DrawerCustomizeModal({ open, onClose, prefs, onChange, onReset }) {
  function setTab(id, enabled) {
    if (!enabled) {
      const count = DRAWER_TAB_OPTIONS.filter((t) => prefs.tabs[t.id] !== false).length
      if (count <= 1 && prefs.tabs[id] !== false) return
    }
    onChange({ tabs: { [id]: enabled } })
  }

  function setOverview(key, enabled) {
    onChange({ overview: { [key]: enabled } })
  }

  const enabledTabCount = DRAWER_TAB_OPTIONS.filter((t) => prefs.tabs[t.id] !== false).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize candidate panel"
      footer={(
        <>
          <Button variant="ghost" onClick={() => { onReset(); onClose() }}>Reset defaults</Button>
          <Button onClick={onClose}>Done</Button>
        </>
      )}
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Panel layout</h3>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs text-slate-600">Panel width</p>
              <OptionPills
                value={prefs.width}
                onChange={(width) => onChange({ width })}
                options={[
                  { value: 'narrow', label: 'Narrow' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'wide', label: 'Wide' },
                  { value: 'full', label: 'Full' },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-slate-600">Background behind panel</p>
              <OptionPills
                value={prefs.overlay}
                onChange={(overlay) => onChange({ overlay })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'light', label: 'Light' },
                  { value: 'medium', label: 'Medium' },
                ]}
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Default when opening</h3>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs text-slate-600">First tab</p>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={prefs.defaultTab}
                onChange={(e) => onChange({ defaultTab: e.target.value })}
              >
                {DRAWER_TAB_OPTIONS.filter((t) => prefs.tabs[t.id] !== false).map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1.5 text-xs text-slate-600">Resume tab default</p>
              <OptionPills
                value={prefs.resumeDefaultView}
                onChange={(resumeDefaultView) => onChange({ resumeDefaultView })}
                options={[
                  { value: 'formatted', label: 'Formatted' },
                  { value: 'document', label: 'Original PDF' },
                ]}
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tabs to show</h3>
          <div className="space-y-1.5">
            {DRAWER_TAB_OPTIONS.map((t) => (
              <ToggleRow
                key={t.id}
                label={t.label}
                checked={prefs.tabs[t.id] !== false}
                onChange={(on) => setTab(t.id, on)}
                description={enabledTabCount <= 1 && prefs.tabs[t.id] !== false ? 'At least one tab required' : undefined}
              />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Overview sections</h3>
          <div className="space-y-1.5">
            <ToggleRow label="Stage dropdown" checked={prefs.overview.stage} onChange={(on) => setOverview('stage', on)} />
            <ToggleRow label="Live status" checked={prefs.overview.liveStatus} onChange={(on) => setOverview('liveStatus', on)} />
            <ToggleRow label="AI summary" checked={prefs.overview.aiSummary} onChange={(on) => setOverview('aiSummary', on)} />
            <ToggleRow label="Screening & emails cards" checked={prefs.overview.screeningEmails} onChange={(on) => setOverview('screeningEmails', on)} />
            <ToggleRow label="Interview report" checked={prefs.overview.interviewReport} onChange={(on) => setOverview('interviewReport', on)} />
            <ToggleRow label="Comments preview" checked={prefs.overview.comments} onChange={(on) => setOverview('comments', on)} />
          </div>
        </section>

        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Settings2 className="h-3.5 w-3.5" />
          Saved on this browser only.
        </p>
      </div>
    </Modal>
  )
}
