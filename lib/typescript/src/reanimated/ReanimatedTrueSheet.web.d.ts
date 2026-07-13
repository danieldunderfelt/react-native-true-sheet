import { TrueSheet } from '../TrueSheet';
import type { TrueSheetProps } from '../TrueSheet.types';
interface ReanimatedTrueSheetProps extends TrueSheetProps {
    /**
     * Callback for position changes.
     *
     * @see {@link TrueSheetProps.onPositionChange}
     */
    onPositionChange?: TrueSheetProps['onPositionChange'];
}
/**
 * Reanimated-enabled version of TrueSheet for web that automatically syncs
 * position with the provider's shared value.
 * Must be used within a ReanimatedTrueSheetProvider.
 *
 * @example
 * ```tsx
 * import { ReanimatedTrueSheet, ReanimatedTrueSheetProvider } from '@lodev09/react-native-true-sheet/reanimated'
 *
 * function MyScreen() {
 *   const sheetRef = useRef<TrueSheet>(null)
 *
 *   return (
 *     <ReanimatedTrueSheetProvider>
 *       <View>
 *         <ReanimatedTrueSheet
 *           ref={sheetRef}
 *           detents={[0.25, 0.5, 1]}
 *           initialDetentIndex={1}
 *         >
 *           <Text>Sheet Content</Text>
 *         </ReanimatedTrueSheet>
 *       </View>
 *     </ReanimatedTrueSheetProvider>
 *   )
 * }
 * ```
 */
export declare const ReanimatedTrueSheet: import("react").ForwardRefExoticComponent<ReanimatedTrueSheetProps & import("react").RefAttributes<TrueSheet>>;
export {};
//# sourceMappingURL=ReanimatedTrueSheet.web.d.ts.map