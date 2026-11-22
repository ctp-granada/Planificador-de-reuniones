import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarCheck2,
  CalendarDays,
  Check,
  Clock,
  HelpCircle,
  X,
} from 'lucide-react';

interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpDrawer: React.FC<HelpDrawerProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const steps = [
    {
      num: '01',
      title: 'Crea, edita o abre una reunión',
      desc: 'Pulsa «Nueva reunión» para elegir los días y el horario, usa «Editar reunión» si eres quien organiza para ajustarla después, o comparte el enlace con «Copiar enlace».',
    },
    {
      num: '02',
      title: 'Accede con tu correo de la UGR',
      desc: 'Cualquier persona puede ver las respuestas del grupo. Para crear reuniones o apuntarte en el calendario, inicia sesión con tu cuenta @ugr.es o @go.ugr.es.',
    },
    {
      num: '03',
      title: 'Apúntate marcando tu disponibilidad',
      desc: 'Selecciona un estado (Disponible, Me adapto o No disponible), haz clic o arrastra sobre las celdas y pulsa «Apuntarme y guardar».',
    },
    {
      num: '04',
      title: 'Elige la mejor franja en el consenso',
      desc: 'La matriz muestra cuántas personas coinciden en cada hora. Pulsa cualquier franja para ver quién asiste y confirmar la hora definitiva.',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="help-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-[#0B1F3A]/20 backdrop-blur-[1px]"
          />

          <motion.aside
            key="help-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Ayuda de uso"
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-xl flex flex-col"
          >
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-5 h-5 text-[#0B1F3A]" />
                <h2 className="text-lg font-semibold text-[#0B1F3A] tracking-tight">
                  Guía rápida de uso
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar ayuda"
                className="p-2 text-slate-400 hover:text-[#0B1F3A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Steps */}
              <ol className="space-y-4">
                {steps.map((step) => (
                  <li
                    key={step.num}
                    className="pb-4 border-b border-slate-100 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-mono text-xs font-semibold text-[#059669] tabular-nums">
                        {step.num}
                      </span>
                      <h3 className="text-sm font-semibold text-[#0B1F3A]">
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-1 pl-7 text-xs text-slate-600 leading-relaxed">
                      {step.desc}
                    </p>
                  </li>
                ))}
              </ol>

              {/* States legend */}
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-xs font-semibold text-[#0B1F3A] mb-3">
                  Significado de cada estado
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] inline-flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-slate-700">
                      <strong className="text-[#0B1F3A]">Disponible:</strong> te viene bien ese horario.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-amber-50 border border-amber-200 text-amber-800 inline-flex items-center justify-center shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-slate-700">
                      <strong className="text-[#0B1F3A]">Me adapto:</strong> puedes asistir si hace falta.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-rose-50 border border-rose-200 text-rose-800 inline-flex items-center justify-center shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-slate-700">
                      <strong className="text-[#0B1F3A]">No disponible:</strong> no puedes asistir en esa franja.
                    </span>
                  </div>
                </div>
              </div>

              {/* Calendar & Navigation tips */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-start gap-2.5">
                  <CalendarCheck2 className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <strong className="text-[#0B1F3A]">Desplazar días:</strong> si la reunión tiene muchos días, desliza hacia la derecha y las horas seguirán visibles a la izquierda.
                  </p>
                </div>
                <div className="flex items-start gap-2.5">
                  <CalendarDays className="w-4 h-4 text-[#0B1F3A] shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <strong className="text-[#0B1F3A]">Vista mensual:</strong> cambia a la vista de calendario para ver todas las reuniones del mes, filtrar por estado o crear una reunión directamente en un día concreto.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/70">
              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 text-sm font-medium text-white bg-[#0B1F3A] rounded-lg hover:bg-[#132F54] transition-colors cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
