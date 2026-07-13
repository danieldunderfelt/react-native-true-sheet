import { type ReactNode, type RefObject } from 'react';
import type { TrueSheetMethods, TrueSheetStaticMethods } from './TrueSheet.types';
type SheetRef = RefObject<TrueSheetMethods | null>;
type NodeRef = RefObject<HTMLDivElement | null>;
interface StackEntry {
    ref: SheetRef;
    nodeRef: NodeRef;
    isFormSheetRef: RefObject<boolean>;
}
export interface TrueSheetProviderProps {
    children: ReactNode;
}
export declare function TrueSheetProvider({ children }: TrueSheetProviderProps): import("react").JSX.Element;
export declare function usePortalContainer(): HTMLElement | null;
export declare function useTrueSheet(): TrueSheetStaticMethods;
export declare function useRegisterSheet(name: string | undefined, ref: SheetRef): void;
/**
 * Registers the sheet in the open stack while `isOpen` is true and returns
 * live data used by each sheet to render stacked visuals and dismiss children.
 */
export declare function useSheetStack(ref: SheetRef, nodeRef: NodeRef, isOpen: boolean, isFormSheet: boolean): {
    descendants: readonly StackEntry[];
    isNested: boolean;
    dismissAbove: (animated?: boolean) => Promise<void>;
};
export {};
//# sourceMappingURL=TrueSheetProvider.web.d.ts.map