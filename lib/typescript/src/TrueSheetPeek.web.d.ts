import { type RefObject } from 'react';
import { View, type ViewProps } from 'react-native';
/**
 * Reports the measured peek content height to the owning TrueSheet.
 * @internal
 */
export interface TrueSheetPeekContextValue {
    contentRef: RefObject<View | null>;
    setPeekContentHeight: (height: number) => void;
}
export declare const TrueSheetPeekContext: import("react").Context<TrueSheetPeekContextValue | null>;
/**
 * Wrapper component that marks its children as the sheet's peek content.
 * When rendered within a `TrueSheet`, the `"peek"` detent reveals everything
 * from the top of the sheet through the bottom of this component — content
 * below it stays hidden until the sheet is expanded.
 */
export declare const TrueSheetPeek: ({ onLayout, ...rest }: ViewProps) => import("react").JSX.Element;
//# sourceMappingURL=TrueSheetPeek.web.d.ts.map