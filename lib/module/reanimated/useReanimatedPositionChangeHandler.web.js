"use strict";

import { useCallback } from 'react';
/**
 * Web implementation of useReanimatedPositionChangeHandler.
 *
 * Returns a simple callback wrapper. The worklet directive is ignored on web
 * since there's no native UI thread.
 *
 * @param handler - The position change handler function
 * @param _dependencies - Unused on web, kept for API compatibility
 * @returns An event handler compatible with onPositionChange prop
 */
export const useReanimatedPositionChangeHandler = (handler, _dependencies = []) => {
  const context = {};
  return useCallback(event => {
    handler(event.nativeEvent, context);
  }, [handler]);
};
//# sourceMappingURL=useReanimatedPositionChangeHandler.web.js.map