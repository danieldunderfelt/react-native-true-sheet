"use strict";

// This code comes from https://github.com/radix-ui/primitives/blob/main/packages/react/use-controllable-state/src/useControllableState.tsx

import React from 'react';
function useCallbackRef(callback) {
  const callbackRef = React.useRef(callback);
  React.useEffect(() => {
    callbackRef.current = callback;
  });

  // https://github.com/facebook/react/issues/19240
  return React.useMemo(() => (...args) => callbackRef.current?.(...args), []);
}
function useUncontrolledState({
  defaultProp,
  onChange
}) {
  const uncontrolledState = React.useState(defaultProp);
  const [value] = uncontrolledState;
  const prevValueRef = React.useRef(value);
  const handleChange = useCallbackRef(onChange);
  React.useEffect(() => {
    if (prevValueRef.current !== value) {
      handleChange(value);
      prevValueRef.current = value;
    }
  }, [value, prevValueRef, handleChange]);
  return uncontrolledState;
}
export function useControllableState({
  prop,
  defaultProp,
  onChange = () => {}
}) {
  const [uncontrolledProp, setUncontrolledProp] = useUncontrolledState({
    defaultProp,
    onChange
  });
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledProp;
  const handleChange = useCallbackRef(onChange);
  const setValue = React.useCallback(nextValue => {
    if (isControlled) {
      const setter = nextValue;
      const next = typeof nextValue === 'function' ? setter(prop) : nextValue;
      if (next !== prop) handleChange(next);
    } else {
      setUncontrolledProp(nextValue);
    }
  }, [isControlled, prop, setUncontrolledProp, handleChange]);
  return [value, setValue];
}
//# sourceMappingURL=use-controllable-state.js.map