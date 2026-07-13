import type { PositionChangeEvent, PositionChangeEventPayload } from '../TrueSheet.types';
import type { DependencyList } from 'react-native-reanimated/lib/typescript/hook/commonTypes';
type PositionChangeHandler = (payload: PositionChangeEventPayload, context: Record<string, unknown>) => void;
export declare const useReanimatedPositionChangeHandler: (handler: PositionChangeHandler, dependencies?: DependencyList) => import("react-native-reanimated").EventHandlerProcessed<PositionChangeEvent, never>;
export {};
//# sourceMappingURL=useReanimatedPositionChangeHandler.d.ts.map