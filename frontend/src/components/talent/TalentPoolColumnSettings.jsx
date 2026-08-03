import { useEffect, useState } from 'react'
import { Button, Modal } from '../../ui'
import { TALENT_POOL_COLUMNS } from '../../hooks/useTalentPoolColumns'

const ALL_ON = Object.fromEntries(TALENT_POOL_COLUMNS.map((c) => [c.id, true]))

// Column chooser. Edits are buffered in a local DRAFT and only applied when the user clicks
// "Done" — so toggling checkboxes doesn't reshape the table live. Closing without Done (X /
// backdrop / Cancel) discards the draft.
export default function TalentPoolColumnSettings({ open, onClose, visible, onApply, onReset }) {
  const [draft, setDraft] = useState(visible)

  // Start each session from the current live visibility, so re-opening reflects what's applied.
  useEffect(() => { if (open) setDraft({ ...visible }) }, [open])  // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id, on) => setDraft((p) => ({ ...p, [id]: on }))
  const apply = () => { onApply(draft); onClose() }
  const resetDraft = () => setDraft({ ...ALL_ON })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize table columns"
      footer={(
        <>
          <Button variant="ghost" onClick={resetDraft}>Reset</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={apply}>Done</Button>
        </>
      )}
    >
      <p className="mb-3 text-sm text-slate-600">Choose which columns appear, then click <strong>Done</strong> to apply.</p>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {TALENT_POOL_COLUMNS.filter((c) => !c.locked).map((col) => (
          <label
            key={col.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 transition-colors duration-150 ease-snappy hover:bg-slate-50"
          >
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={draft[col.id] !== false}
              onChange={(e) => toggle(col.id, e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-800">{col.label}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
