export default function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.tone}`} role="status" onClick={onClose}>
      {toast.message}
    </div>
  );
}
