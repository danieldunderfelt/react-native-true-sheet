"use strict";

import Animated from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useReanimatedPositionChangeHandler } from "../../reanimated/index.js";
import { TrueSheet } from '../../TrueSheet';
import { useSheetScreenState } from "./useSheetScreenState.js";
import { jsx as _jsx } from "react/jsx-runtime";
const AnimatedTrueSheet = Animated.createAnimatedComponent(TrueSheet);
export const ReanimatedTrueSheetScreen = ({
  detentIndex,
  resizeKey,
  navigation,
  emit,
  routeKey,
  closing,
  detents,
  children,
  positionChangeHandler,
  ...sheetProps
}) => {
  const {
    ref,
    initialDetentIndex,
    eventHandlers: {
      onPositionChange,
      ...eventHandlers
    }
  } = useSheetScreenState({
    detentIndex,
    resizeKey,
    closing,
    navigation,
    routeKey,
    emit
  });
  const reanimatedPositionChangeHandler = useReanimatedPositionChangeHandler(payload => {
    'worklet';

    positionChangeHandler?.(payload);
    scheduleOnRN(onPositionChange, {
      nativeEvent: payload
    });
  }, [onPositionChange, positionChangeHandler]);
  return /*#__PURE__*/_jsx(AnimatedTrueSheet, {
    ref: ref,
    name: `navigation-sheet-${routeKey}`,
    initialDetentIndex: initialDetentIndex,
    detents: detents,
    onPositionChange: reanimatedPositionChangeHandler,
    ...sheetProps,
    ...eventHandlers,
    children: children
  });
};
//# sourceMappingURL=ReanimatedTrueSheetScreen.js.map