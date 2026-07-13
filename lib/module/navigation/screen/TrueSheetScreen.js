"use strict";

import { useCallback } from 'react';
import { TrueSheet } from '../../TrueSheet';
import { useSheetScreenState } from "./useSheetScreenState.js";
import { jsx as _jsx } from "react/jsx-runtime";
export const TrueSheetScreen = ({
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
  const handlePositionChange = useCallback(e => {
    onPositionChange(e);
    positionChangeHandler?.(e.nativeEvent);
  }, [onPositionChange, positionChangeHandler]);
  return /*#__PURE__*/_jsx(TrueSheet, {
    ref: ref,
    name: `navigation-sheet-${routeKey}`,
    initialDetentIndex: initialDetentIndex,
    detents: detents,
    onPositionChange: handlePositionChange,
    ...sheetProps,
    ...eventHandlers,
    children: children
  });
};
//# sourceMappingURL=TrueSheetScreen.js.map