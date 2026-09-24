import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./components/Bits";

const ToastContext = createContext<(text: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const push = useCallback((text: string) => {
    const id = Date.now();
    setToasts((list) => [...list.slice(-3), { id, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <button key={item.id} type="button" className="toast" onClick={() => setToasts((list) => list.filter((entry) => entry.id !== item.id))}>
            <Icon name="check" /> {item.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
