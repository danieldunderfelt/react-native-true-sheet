import React from 'react';
import type { DrawerDirection } from './types';
export declare function useSnapPoints({ activeSnapPointProp, setActiveSnapPointProp, snapPoints, drawerRef, overlayRef, fadeFromIndex, onSnapPointChange, direction, container, snapToSequentialPoint, isOpen, contentHeight, detachedOffset, maxContentHeight, peekHeight, initialAnimated, }: {
    activeSnapPointProp?: number | string | null;
    setActiveSnapPointProp?(snapPoint: number | null | string): void;
    snapPoints?: (number | string)[];
    fadeFromIndex?: number;
    drawerRef: React.RefObject<HTMLDivElement | null>;
    overlayRef: React.RefObject<HTMLDivElement | null>;
    onSnapPointChange(activeSnapPointIndex: number): void;
    direction?: DrawerDirection;
    container?: HTMLElement | null | undefined;
    snapToSequentialPoint?: boolean;
    isOpen?: boolean;
    contentHeight?: number;
    detachedOffset?: number;
    maxContentHeight?: number;
    peekHeight?: number;
    initialAnimated?: boolean;
}): {
    isLastSnapPoint: true | null;
    activeSnapPoint: string | number | null | undefined;
    shouldFade: boolean;
    getPercentageDragged: (absDraggedDistance: number, isDraggingDown: boolean) => number | null;
    setActiveSnapPoint: React.Dispatch<React.SetStateAction<string | number | null | undefined>>;
    activeSnapPointIndex: number | null;
    onRelease: ({ draggedDistance, closeDrawer, velocity, dismissible, }: {
        draggedDistance: number;
        closeDrawer: () => void;
        velocity: number;
        dismissible: boolean;
    }) => void;
    onDrag: ({ draggedDistance }: {
        draggedDistance: number;
    }) => void;
    snapPointsOffset: number[];
};
//# sourceMappingURL=use-snap-points.d.ts.map