"use strict";

// This code comes from https://github.com/radix-ui/primitives/tree/main/packages/react/compose-refs

import * as React from 'react';
/**
 * Set a given ref to a given value
 * This utility takes care of different types of refs: callback refs and RefObject(s)
 */
function setRef(ref, value) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref !== null && ref !== undefined) {
    ref.current = value;
  }
}

/**
 * A utility to compose multiple refs together
 * Accepts callback refs and RefObject(s)
 */
function composeRefs(...refs) {
  return node => refs.forEach(ref => setRef(ref, node));
}

/**
 * A custom hook that composes multiple refs
 * Accepts callback refs and RefObject(s)
 */
function useComposedRefs(...refs) {
  return React.useCallback(composeRefs(...refs), refs);
}
export { composeRefs, useComposedRefs };
//# sourceMappingURL=use-composed-refs.js.map