import React from 'react';
import { X } from 'lucide-react';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  preventClose,
  containerClassName = "",
  contentClassName = ""
  }) => {
  if (!isOpen) return null;
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200 ${containerClassName}`}>
      <div className={`bg-[var(--panel)] border border-[var(--border)] rounded-xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] shadow-[var(--shadow)] ${contentClassName}`}>
        <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-[var(--panel-muted)] shrink-0">
          <h3 className="text-lg font-bold text-[var(--text)]">{title}</h3>
          {!preventClose && <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"><X size={20} /></button>}
        </div>
        <div className="p-4 overflow-y-auto overflow-x-hidden custom-scrollbar">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
