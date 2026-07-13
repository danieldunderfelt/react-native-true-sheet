"use strict";

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { TrueSheetActions } from "../TrueSheetRouter.js";
export const useSheetScreenState = props => {
  const {
    detentIndex,
    resizeKey,
    closing,
    navigation,
    routeKey,
    emit
  } = props;
  const ref = useRef(null);
  const isDismissedRef = useRef(false);
  const isFirstRenderRef = useRef(true);
  const initialDetentIndexRef = useRef(detentIndex);
  useEffect(() => {
    if (closing && !isDismissedRef.current) {
      isDismissedRef.current = true;
      ref.current?.dismiss();
    }
  }, [closing]);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    ref.current?.resize(detentIndex);
  }, [detentIndex, resizeKey]);
  const emitEvent = useCallback((type, data) => {
    emit({
      type,
      target: routeKey,
      data
    });
  }, [emit, routeKey]);
  const onDidDismiss = useCallback(() => {
    emitEvent('sheetDidDismiss', undefined);
    isDismissedRef.current = true;
    navigation.dispatch({
      ...TrueSheetActions.remove(),
      source: routeKey
    });
  }, [emitEvent, navigation, routeKey]);
  const eventHandlers = useMemo(() => ({
    onWillPresent: e => emitEvent('sheetWillPresent', e.nativeEvent),
    onDidPresent: e => emitEvent('sheetDidPresent', e.nativeEvent),
    onWillDismiss: _e => emitEvent('sheetWillDismiss', undefined),
    onDidDismiss,
    onDetentChange: e => emitEvent('sheetDetentChange', e.nativeEvent),
    onDragBegin: e => emitEvent('sheetDragBegin', e.nativeEvent),
    onDragChange: e => emitEvent('sheetDragChange', e.nativeEvent),
    onDragEnd: e => emitEvent('sheetDragEnd', e.nativeEvent),
    onPositionChange: e => emitEvent('sheetPositionChange', e.nativeEvent),
    onWillFocus: _e => emitEvent('sheetWillFocus', undefined),
    onDidFocus: _e => emitEvent('sheetDidFocus', undefined),
    onWillBlur: _e => emitEvent('sheetWillBlur', undefined),
    onDidBlur: _e => emitEvent('sheetDidBlur', undefined)
  }), [emitEvent, onDidDismiss]);
  return {
    ref,
    initialDetentIndex: initialDetentIndexRef.current,
    emitEvent,
    eventHandlers
  };
};
//# sourceMappingURL=useSheetScreenState.js.map