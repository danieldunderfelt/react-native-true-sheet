"use strict";

import { useEvent, useHandler } from 'react-native-reanimated';
export const useReanimatedPositionChangeHandler = (handler, dependencies = []) => {
  const {
    context,
    doDependenciesDiffer
  } = useHandler({
    onPositionChange: handler
  }, dependencies);
  return useEvent(event => {
    'worklet';

    if (handler && event.eventName.endsWith('onPositionChange')) {
      handler(event, context);
    }
  }, ['onPositionChange'], doDependenciesDiffer);
};
//# sourceMappingURL=useReanimatedPositionChangeHandler.js.map