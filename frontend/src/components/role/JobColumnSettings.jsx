import { Modal, Button } from '../../ui'
import { JOB_APP_COLUMNS } from '../../hooks/useJobAppColumns'

export default function JobColumnSettings({ open, onClose, visible, onToggle, onReset }) {
  return (
    <Modal open={open} onClose={onClose} title="Table columns" footer={<Button variant="ghost" onClick={onReset}>Reset defaults</Button>}>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {JOB_APP_COLUMNS.filter((c) => !c.locked).map((col) => (
          <label key={col.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={visible[col.id] !== false}
              onChange={(e) => onToggle(col.id, e.target.checked)}
              className="rounded border-slate-300 text-violet-600"
            />
            <span className="text-sm text-slate-700">{col.label}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
