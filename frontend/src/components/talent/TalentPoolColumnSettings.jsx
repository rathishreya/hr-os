import { Button, Modal } from '../../ui'
import { TALENT_POOL_COLUMNS } from '../../hooks/useTalentPoolColumns'

export default function TalentPoolColumnSettings({ open, onClose, visible, onToggle, onReset }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize table columns"
      footer={(
        <>
          <Button variant="ghost" onClick={() => { onReset(); onClose() }}>Reset</Button>
          <Button onClick={onClose}>Done</Button>
        </>
      )}
    >
      <p className="mb-3 text-sm text-slate-600">Choose which columns appear in your talent pool table.</p>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {TALENT_POOL_COLUMNS.filter((c) => !c.locked).map((col) => (
          <label
            key={col.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 transition-colors duration-150 ease-snappy hover:bg-slate-50"
          >
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={visible[col.id] !== false}
              onChange={(e) => onToggle(col.id, e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-800">{col.label}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
