import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  emptyScheme,
  schemeReducer,
  type Scheme,
  type SchemeAction,
} from "../model/scheme";

interface SchemeContextValue {
  scheme: Scheme;
  dispatch: (a: SchemeAction) => void;
}

const SchemeContext = createContext<SchemeContextValue | null>(null);

export function SchemeProvider({ children }: { children: ReactNode }) {
  const [scheme, dispatch] = useReducer(schemeReducer, undefined, emptyScheme);
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
