"use strict";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const SheetContext = /*#__PURE__*/createContext(null);
const NO_PROVIDER_ERROR = 'TrueSheet: useTrueSheet() requires a <TrueSheetProvider> ancestor on web.';
const EMPTY_STACK = Object.freeze([]);
export function TrueSheetProvider({
  children
}) {
  const namedSheetsRef = useRef(new Map());
  const stackRef = useRef(EMPTY_STACK);
  const listenersRef = useRef(new Set());

  // Stable portal container created once. Attached to an anchor div rendered
  // in this provider's tree so the sheets unmount cleanly with the provider
  // (e.g., when a screen-scoped provider unmounts on navigation).
  const portalContainer = useMemo(() => typeof document !== 'undefined' ? document.createElement('div') : null, []);
  const anchorRef = useRef(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !portalContainer) return;
    anchor.appendChild(portalContainer);
    return () => {
      if (portalContainer.parentNode) {
        portalContainer.parentNode.removeChild(portalContainer);
      }
    };
  }, [portalContainer]);
  const value = useMemo(() => {
    const notify = () => listenersRef.current.forEach(listener => listener());
    return {
      registerByName: (name, ref) => {
        namedSheetsRef.current.set(name, ref);
        return () => {
          if (namedSheetsRef.current.get(name) === ref) {
            namedSheetsRef.current.delete(name);
          }
        };
      },
      resolveByName: name => {
        const ref = namedSheetsRef.current.get(name);
        const methods = ref?.current;
        if (!methods) {
          throw new Error(`TrueSheet: no sheet registered with name "${name}"`);
        }
        return methods;
      },
      pushOpen: entry => {
        if (stackRef.current.some(e => e.ref === entry.ref)) return;
        stackRef.current = [...stackRef.current, entry];
        notify();
      },
      popOpen: entry => {
        const idx = stackRef.current.findIndex(e => e.ref === entry.ref);
        if (idx < 0) return;
        stackRef.current = [...stackRef.current.slice(0, idx), ...stackRef.current.slice(idx + 1)];
        notify();
      },
      subscribeStack: listener => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      getStackSnapshot: () => stackRef.current,
      portalContainer
    };
  }, [portalContainer]);
  return /*#__PURE__*/_jsxs(SheetContext.Provider, {
    value: value,
    children: [children, /*#__PURE__*/_jsx("div", {
      ref: anchorRef
    })]
  });
}
export function usePortalContainer() {
  const ctx = useContext(SheetContext);
  return ctx?.portalContainer ?? null;
}
export function useTrueSheet() {
  const ctx = useContext(SheetContext);
  return useMemo(() => {
    if (!ctx) {
      const reject = async () => {
        throw new Error(NO_PROVIDER_ERROR);
      };
      return {
        present: reject,
        resize: reject,
        dismiss: reject,
        dismissStack: reject,
        dismissAll: reject
      };
    }
    return {
      present: (name, index, animated) => ctx.resolveByName(name).present(index, animated),
      resize: (name, index) => ctx.resolveByName(name).resize(index),
      dismiss: (name, animated) => ctx.resolveByName(name).dismiss(animated),
      dismissStack: (name, animated) => ctx.resolveByName(name).dismissStack(animated),
      dismissAll: async animated => {
        const stack = ctx.getStackSnapshot();
        await Promise.all([...stack].reverse().map(entry => entry.ref.current?.dismiss(animated)));
      }
    };
  }, [ctx]);
}
export function useRegisterSheet(name, ref) {
  const ctx = useContext(SheetContext);
  useEffect(() => {
    if (!ctx || !name) return;
    return ctx.registerByName(name, ref);
  }, [ctx, name, ref]);
}

/**
 * Registers the sheet in the open stack while `isOpen` is true and returns
 * live data used by each sheet to render stacked visuals and dismiss children.
 */
export function useSheetStack(ref, nodeRef, isOpen, isFormSheet) {
  const ctx = useContext(SheetContext);
  const isFormSheetRef = useRef(isFormSheet);
  isFormSheetRef.current = isFormSheet;
  const entry = useMemo(() => ({
    ref,
    nodeRef,
    isFormSheetRef
  }), [ref, nodeRef]);
  useEffect(() => {
    if (!ctx || !isOpen) return;
    ctx.pushOpen(entry);
    return () => ctx.popOpen(entry);
  }, [ctx, entry, isOpen]);
  const subscribe = useCallback(listener => {
    if (!ctx) return () => {};
    return ctx.subscribeStack(listener);
  }, [ctx]);
  const getSnapshot = useCallback(() => ctx ? ctx.getStackSnapshot() : EMPTY_STACK, [ctx]);
  const stack = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const stackIndex = stack.findIndex(e => e.ref === ref);
  const isNested = stackIndex > 0;
  const descendants = useMemo(() => stackIndex < 0 ? EMPTY_STACK : stack.slice(stackIndex + 1), [stack, stackIndex]);
  const dismissAbove = useCallback(async animated => {
    if (!ctx) return;
    const snapshot = ctx.getStackSnapshot();
    const idx = snapshot.findIndex(e => e.ref === ref);
    if (idx < 0) return;
    const above = snapshot.slice(idx + 1);
    await Promise.all([...above].reverse().map(e => e.ref.current?.dismiss(animated)));
  }, [ctx, ref]);
  return {
    descendants,
    isNested,
    dismissAbove
  };
}
//# sourceMappingURL=TrueSheetProvider.web.js.map