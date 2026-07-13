"use strict";

import { useNavigation } from '@react-navigation/core';
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
export const useTrueSheetNavigation = () => useNavigation();
//# sourceMappingURL=useTrueSheetNavigation.js.map