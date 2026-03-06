export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  confirmClassName = 'bg-blue-600 hover:bg-blue-700 text-white',
  onConfirm,
  onCancel,
  error,
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
      <div className="bg-slate-800 rounded-2xl max-w-sm w-full border border-slate-700 shadow-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
        <div className="text-sm text-slate-400 mb-4">{message}</div>
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold text-sm transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${confirmClassName}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
