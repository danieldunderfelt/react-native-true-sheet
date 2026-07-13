import { type ParamListBase } from '@react-navigation/core';
import type { TrueSheetNavigationProp } from './types';
/**
 * Hook to access TrueSheet navigation with the resize helper.
 *
 * @example
 * ```tsx
 * function MySheet() {
 *   const navigation = useTrueSheetNavigation();
 *
 *   // Resize to a specific detent
 *   const handleExpand = () => {
 *     navigation.resize(1); // Resize to second detent
 *   };
 *
 *   return (
 *     <Button title="Expand" onPress={handleExpand} />
 *   );
 * }
 * ```
 */
export declare const useTrueSheetNavigation: <T extends ParamListBase = ParamListBase>() => TrueSheetNavigationProp<T>;
//# sourceMappingURL=useTrueSheetNavigation.d.ts.map