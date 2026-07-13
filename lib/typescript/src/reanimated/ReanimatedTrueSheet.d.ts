import { TrueSheet } from '../TrueSheet';
import type { TrueSheetProps } from '../TrueSheet.types';
interface ReanimatedTrueSheetProps extends TrueSheetProps {
    /**
     * Worklet version of `onPositionChange`
     *
     * @see {@link TrueSheetProps.onPositionChange}
     */
    onPositionChange?: TrueSheetProps['onPositionChange'];
}
/**
 * Reanimated-enabled version of TrueSheet that automatically syncs position with the provider's shared value.
 * Must be used within a ReanimatedTrueSheetProvider.
 *
 * NOTE: `onPositionChange` is now under UI thread.
 * Make sure you add `worklet` if you want to override this.
 *
 * @example
 * ```tsx
 * import { ReanimatedTrueSheet, ReanimatedTrueSheetProvider } from '@lodev09/react-native-true-sheet'
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
//# sourceMappingURL=ReanimatedTrueSheet.d.ts.map