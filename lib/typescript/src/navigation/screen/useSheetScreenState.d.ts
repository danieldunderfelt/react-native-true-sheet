import { TrueSheet } from '../../TrueSheet';
import type { DetentChangeEvent, DetentInfoEventPayload, DidBlurEvent, DidFocusEvent, DidPresentEvent, DragBeginEvent, DragChangeEvent, DragEndEvent, PositionChangeEvent, PositionChangeEventPayload, WillBlurEvent, WillDismissEvent, WillFocusEvent, WillPresentEvent } from '../../TrueSheet.types';
import type { TrueSheetNavigationEventMap, TrueSheetNavigationHelpers, TrueSheetNavigationProp } from '../types';
import type { ParamListBase } from '@react-navigation/core';
type EmitFn = TrueSheetNavigationHelpers['emit'];
interface UseSheetScreenStateProps {
    detentIndex: number;
    resizeKey?: number;
    closing?: boolean;
    navigation: TrueSheetNavigationProp<ParamListBase>;
    routeKey: string;
    emit: EmitFn;
}
export declare const useSheetScreenState: (props: UseSheetScreenStateProps) => {
    ref: import("react").RefObject<TrueSheet | null>;
    initialDetentIndex: number;
    emitEvent: (type: keyof TrueSheetNavigationEventMap, data: DetentInfoEventPayload | PositionChangeEventPayload | undefined) => void;
    eventHandlers: {
        onWillPresent: (e: WillPresentEvent) => void;
        onDidPresent: (e: DidPresentEvent) => void;
        onWillDismiss: (_e: WillDismissEvent) => void;
        onDidDismiss: () => void;
        onDetentChange: (e: DetentChangeEvent) => void;
        onDragBegin: (e: DragBeginEvent) => void;
        onDragChange: (e: DragChangeEvent) => void;
        onDragEnd: (e: DragEndEvent) => void;
        onPositionChange: (e: PositionChangeEvent) => void;
        onWillFocus: (_e: WillFocusEvent) => void;
        onDidFocus: (_e: DidFocusEvent) => void;
        onWillBlur: (_e: WillBlurEvent) => void;
        onDidBlur: (_e: DidBlurEvent) => void;
    };
};
export {};
//# sourceMappingURL=useSheetScreenState.d.ts.map