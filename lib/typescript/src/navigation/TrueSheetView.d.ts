import type { ParamListBase } from '@react-navigation/core';
import type { TrueSheetDescriptorMap, TrueSheetNavigationHelpers, TrueSheetNavigationState } from './types';
interface TrueSheetViewProps {
    state: TrueSheetNavigationState<ParamListBase>;
    navigation: TrueSheetNavigationHelpers;
    descriptors: TrueSheetDescriptorMap;
}
export declare const TrueSheetView: ({ state, navigation, descriptors }: TrueSheetViewProps) => import("react").JSX.Element;
export {};
//# sourceMappingURL=TrueSheetView.d.ts.map