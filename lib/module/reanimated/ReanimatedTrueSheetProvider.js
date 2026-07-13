"use strict";

import { createContext, useContext, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { jsx as _jsx } from "react/jsx-runtime";
const ReanimatedTrueSheetContext = /*#__PURE__*/createContext(null);
/**
 * Provider component that manages shared values for Reanimated TrueSheet.
 * Wrap your app or component tree with this provider to enable Reanimated integration.
 *
 * @example
 * ```tsx
 * import { ReanimatedTrueSheetProvider } from '@lodev09/react-native-true-sheet'
 *
 * function App() {
 *   return (
 *     <ReanimatedTrueSheetProvider>
 *       <YourApp />
 *     </ReanimatedTrueSheetProvider>
 *   )
 * }
 * ```
 */
export const ReanimatedTrueSheetProvider = ({
  children
}) => {
  const {
    height
  } = useWindowDimensions();
  const animatedPosition = useSharedValue(height);
  const animatedIndex = useSharedValue(-1);
  const animatedDetent = useSharedValue(0);
  const value = useMemo(() => ({
    animatedPosition,
    animatedIndex,
    animatedDetent
  }), [animatedPosition, animatedIndex, animatedDetent]);
  return /*#__PURE__*/_jsx(ReanimatedTrueSheetContext.Provider, {
    value: value,
    children: children
  });
};

/**
 * Hook to access the Reanimated TrueSheet context.
 * Returns the shared values for sheet position and detent index that can be used in animations.
 *
 * @throws Error if used outside of ReanimatedTrueSheetProvider
 *
 * @example
 * ```tsx
 * import { useReanimatedTrueSheet } from '@lodev09/react-native-true-sheet'
 * import { useAnimatedStyle } from 'react-native-reanimated'
 *
 * function MyComponent() {
 *   const { animatedPosition, animatedIndex } = useReanimatedTrueSheet()
 *
 *   const animatedStyle = useAnimatedStyle(() => ({
 *     transform: [{ translateY: -animatedPosition.value }]
 *   }))
 *
 *   return <Animated.View style={animatedStyle}>...</Animated.View>
 * }
 * ```
 */
export const useReanimatedTrueSheet = () => {
  const context = useContext(ReanimatedTrueSheetContext);
  if (!context) {
    throw new Error('useReanimatedTrueSheet must be used within a ReanimatedTrueSheetProvider. ' + 'Make sure to wrap your component tree with <ReanimatedTrueSheetProvider>.');
  }
  return context;
};
//# sourceMappingURL=ReanimatedTrueSheetProvider.js.map