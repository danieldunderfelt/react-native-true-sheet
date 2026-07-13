"use strict";

import { createContext, useContext, useEffect, useRef } from 'react';
import { View } from 'react-native';

/**
 * Reports the measured peek content height to the owning TrueSheet.
 * @internal
 */
import { jsx as _jsx } from "react/jsx-runtime";
export const TrueSheetPeekContext = /*#__PURE__*/createContext(null);

/**
 * Wrapper component that marks its children as the sheet's peek content.
 * When rendered within a `TrueSheet`, the `"peek"` detent reveals everything
 * from the top of the sheet through the bottom of this component — content
 * below it stays hidden until the sheet is expanded.
 */
export const TrueSheetPeek = ({
  onLayout,
  ...rest
}) => {
  const context = useContext(TrueSheetPeekContext);
  const viewRef = useRef(null);
  useEffect(() => () => context?.setPeekContentHeight(0), [context]);
  const handleLayout = event => {
    if (context) {
      // On web, View refs resolve to the underlying DOM elements.
      const peekElement = viewRef.current;
      const contentElement = context.contentRef.current;

      // Distance from the top of the content view to the bottom of the peek view,
      // so the peek view's offset within the content (padding, views above it)
      // counts toward the peek detent.
      const bottom = peekElement && contentElement ? peekElement.getBoundingClientRect().bottom - contentElement.getBoundingClientRect().top : event.nativeEvent.layout.height;
      context.setPeekContentHeight(bottom);
    }
    onLayout?.(event);
  };
  return /*#__PURE__*/_jsx(View, {
    ...rest,
    ref: viewRef,
    onLayout: handleLayout
  });
};
//# sourceMappingURL=TrueSheetPeek.web.js.map