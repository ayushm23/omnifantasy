export default function TabButton({ label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 font-semibold transition-all relative ${
        isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-300'
      }`}
    >
      {label}
      {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />}
    </button>
  );
}
