"use strict";

import { forwardRef } from 'react';
import Animated, { withSpring, withTiming, Easing } from 'react-native-reanimated';
import { Platform } from 'react-native';
import { TrueSheet } from '../TrueSheet';
import { useReanimatedTrueSheet } from "./ReanimatedTrueSheetProvider.js";
import { useReanimatedPositionChangeHandler } from './useReanimatedPositionChangeHandler';
import { jsx as _jsx } from "react/jsx-runtime";
const SPRING_CONFIG = {
  damping: 500,
  stiffness: 1000,
  mass: 3,
  overshootClamping: true
};
const TIMING_CONFIG = {
  duration: 300,
  easing: Easing.bezier(0.25, 0.1, 0.25, 1)
};
// Create animated version of TrueSheet
const AnimatedTrueSheet = Animated.createAnimatedComponent(TrueSheet);

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
export const ReanimatedTrueSheet = /*#__PURE__*/forwardRef((props, ref) => {
  const {
    onPositionChange,
    ...rest
  } = props;
  const {
    animatedPosition,
    animatedIndex,
    animatedDetent
  } = useReanimatedTrueSheet();
  const positionChangeHandler = useReanimatedPositionChangeHandler(payload => {
    'worklet';

    if (payload.realtime) {
      // Update directly when we have real-time values (during drag or animation tracking)
      animatedPosition.value = payload.position;
      animatedIndex.value = payload.index;
      animatedDetent.value = payload.detent;
    } else {
      // Animate position, index, and detent when not real-time
      if (Platform.OS === 'android') {
        animatedPosition.value = withTiming(payload.position, TIMING_CONFIG);
        animatedIndex.value = withTiming(payload.index, TIMING_CONFIG);
        animatedDetent.value = withTiming(payload.detent, TIMING_CONFIG);
      } else {
        animatedPosition.value = withSpring(payload.position, SPRING_CONFIG);
        animatedIndex.value = withSpring(payload.index, SPRING_CONFIG);
        animatedDetent.value = withSpring(payload.detent, SPRING_CONFIG);
      }
    }
    onPositionChange?.({
      nativeEvent: payload
    });
  });
  return /*#__PURE__*/_jsx(AnimatedTrueSheet, {
    ref: ref,
    onPositionChange: positionChangeHandler,
    ...rest
  });
});
//# sourceMappingURL=ReanimatedTrueSheet.js.map