import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { UserPlus, X } from 'lucide-react';

interface NewParticipantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddParticipant: (payload: { name: string; role: string }) => Promise<void>;
}

export const NewParticipantDrawer: React.FC<NewParticipantDrawerProps> = ({
  isOpen,
  onClose,
  onAddParticipant,
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Introduce tu nombre o el del participante.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onAddParticipant({
        name: name.trim(),
        role: role.trim() || 'Participante',
      });
      setName('');
      setRole('');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo añadir al participante.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="new-participant-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[#0B1F3A]/20 backdrop-blur-[1px]"
          />

          <motion.aside
            key="new-participant-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Añadir participante a la reunión"
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-xl flex flex-col"
          >
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0B1F3A] tracking-tight">
                  Añadir participante
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Registra un integrante para marcar sus franjas disponibles, adaptables o no disponibles.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar panel"
                className="p-2 text-slate-400 hover:text-[#0B1F3A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex-1 px-6 py-6 space-y-5"
            >
              <div>
                <label
                  htmlFor="participant-name"
                  className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                >
                  Nombre completo
                </label>
                <input
                  id="participant-name"
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Dra. Andrea Ruiz"
                  className="w-full h-10 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A]"
                />
              </div>

              <div>
                <label
                  htmlFor="participant-role"
                  className="block text-xs font-semibold text-[#0B1F3A] mb-1.5"
                >
                  Área o especialidad (opcional)
                </label>
                <input
                  id="participant-role"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Ej. Pediatría, Operaciones, Diseño..."
                  className="w-full h-10 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#0B1F3A]"
                />
              </div>

              {error && (
                <p role="alert" className="text-xs font-medium text-rose-700">
                  {error}
                </p>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-4 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 h-10 px-5 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] disabled:opacity-60 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>
                    {isSubmitting ? 'Registrando...' : 'Continuar a franjas'}
                  </span>
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
