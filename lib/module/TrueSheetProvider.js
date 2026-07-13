"use strict";

import { TrueSheet } from './TrueSheet';
/**
 * Provider for TrueSheet on native platforms.
 * This is a pass-through component - no context is needed on native
 * since TrueSheet uses static instance methods internally.
 */
export function TrueSheetProvider({
  children
}) {
  return children;
}

/**
 * Hook to control TrueSheet instances by name.
 * On native, this maps directly to TrueSheet static methods.
 */
export function useTrueSheet() {
  return {
    present: TrueSheet.present,
    dismiss: TrueSheet.dismiss,
    dismissStack: TrueSheet.dismissStack,
    resize: TrueSheet.resize,
    dismissAll: TrueSheet.dismissAll
  };
}
//# sourceMappingURL=TrueSheetProvider.js.map