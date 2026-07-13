"use strict";

import TrueSheetPeekViewNativeComponent from './fabric/TrueSheetPeekViewNativeComponent';

/**
 * Wrapper component that marks its children as the sheet's peek content.
 * When rendered within a `TrueSheet`, the `"peek"` detent reveals everything
 * from the top of the sheet through the bottom of this component — content
 * below it stays hidden until the sheet is expanded.
 */
import { jsx as _jsx } from "react/jsx-runtime";
export const TrueSheetPeek = props => /*#__PURE__*/_jsx(TrueSheetPeekViewNativeComponent, {
  ...props
});
//# sourceMappingURL=TrueSheetPeek.js.map