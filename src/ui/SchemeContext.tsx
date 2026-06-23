import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  schemeReducer,
  type Scheme,
  type SchemeAction,
} from "../model/scheme";
import { initialScheme, saveToStorage } from "../model/persistence";

interface SchemeContextValue {
  scheme: Scheme;
  dispatch: (a: SchemeAction) => void;
}

const SchemeContext = createContext<SchemeContextValue | null>(null);

export function SchemeProvider({ children }: { children: ReactNode }) {
  const [scheme, dispatch] = useReducer(schemeReducer, undefined, initialScheme);

  // Autosave whenever durable scheme state changes. Selection-only changes
  // are cheap to re-save, so we don't bother debouncing for MVP.
  useEffect(() => {
    saveToStorage(scheme);
  }, [scheme.modules, scheme.wires, scheme.source, scheme.visibility]);

  const value = useMemo<SchemeContextValue>(
    () => ({ scheme, dispatch }),
    [scheme],
  );
  return (
    <SchemeContext.Provider value={value}>{children}</SchemeContext.Provider>
  );
}

export function useScheme(): SchemeContextValue {
  const v = useContext(SchemeContext);
  if (!v) throw new Error("useScheme must be used inside SchemeProvider");
  return v;
}
