"use strict";
'use client';

import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Presence } from '@radix-ui/react-presence';
import { DrawerContext, useDrawerContext } from "./context.js";
import './style.css';
import { isIOS, isMobileFirefox } from "./browser.js";
import { BORDER_RADIUS, CLOSE_THRESHOLD, DRAG_CLASS, NESTED_DISPLACEMENT, SCROLL_LOCK_TIMEOUT, TRANSITIONS, VELOCITY_THRESHOLD, WINDOW_TOP_OFFSET } from "./constants.js";
import { dampenValue, getTranslate, isVertical, reset, set } from "./helpers.js";
import { useComposedRefs } from "./use-composed-refs.js";
import { useControllableState } from "./use-controllable-state.js";
import { usePositionFixed } from "./use-position-fixed.js";
import { isInput, usePreventScroll } from "./use-prevent-scroll.js";
import { useScaleBackground } from "./use-scale-background.js";
import { useSnapPoints } from "./use-snap-points.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Root({
  open: openProp,
  onOpenChange,
  children,
  onDrag: onDragProp,
  onRelease: onReleaseProp,
  snapPoints,
  shouldScaleBackground = false,
  setBackgroundColorOnScale = true,
  closeThreshold = CLOSE_THRESHOLD,
  scrollLockTimeout = SCROLL_LOCK_TIMEOUT,
  dismissible = true,
  draggable = true,
  handleOnly = false,
  fadeFromIndex = snapPoints && snapPoints.length - 1,
  activeSnapPoint: activeSnapPointProp,
  setActiveSnapPoint: setActiveSnapPointProp,
  fixed,
  modal = true,
  onClose,
  nested,
  noBodyStyles = false,
  direction = 'bottom',
  defaultOpen = false,
  disablePreventScroll = true,
  snapToSequentialPoint = false,
  preventScrollRestoration = false,
  repositionInputs = true,
  onAnimationEnd,
  onPositionChange,
  container,
  autoFocus = false,
  detached = false,
  detachedOffset = 0,
  detachedRadius = 0,
  detachedWrapperStyle,
  maxContentHeight,
  peekHeight,
  initialAnimated = true,
  onContentHeightChange
}) {
  const [isOpen = false, setIsOpen] = useControllableState({
    defaultProp: defaultOpen,
    prop: openProp,
    onChange: o => {
      onOpenChange?.(o);
      if (!o && !nested) {
        restorePositionSetting();
      }
      setTimeout(() => {
        onAnimationEnd?.(o);
      }, TRANSITIONS.DURATION * 1000);
    }
  });
  const [hasBeenOpened, setHasBeenOpened] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [justReleased, setJustReleased] = React.useState(false);
  const overlayRef = React.useRef(null);
  const openTime = React.useRef(null);
  const dragStartTime = React.useRef(null);
  const dragEndTime = React.useRef(null);
  const lastTimeDragPrevented = React.useRef(null);
  const isAllowedToDrag = React.useRef(false);
  const nestedOpenChangeTimer = React.useRef(null);
  const pointerStart = React.useRef(0);
  const keyboardIsOpen = React.useRef(false);
  const shouldAnimate = React.useRef(!defaultOpen);
  const previousDiffFromInitial = React.useRef(0);
  const drawerRef = React.useRef(null);
  const drawerHeightRef = React.useRef(drawerRef.current?.getBoundingClientRect().height || 0);
  const drawerWidthRef = React.useRef(drawerRef.current?.getBoundingClientRect().width || 0);
  const initialDrawerHeight = React.useRef(0);
  const [contentHeight, setContentHeight] = React.useState(0);
  const onContentHeightChangeRef = React.useRef(onContentHeightChange);
  React.useEffect(() => {
    onContentHeightChangeRef.current = onContentHeightChange;
  });
  React.useEffect(() => {
    onContentHeightChangeRef.current?.(contentHeight);
  }, [contentHeight]);
  const onSnapPointChange = React.useCallback(activeSnapPointIndex => {
    // Change openTime ref when we reach the last snap point to prevent dragging for 500ms incase it's scrollable.
    if (snapPoints && activeSnapPointIndex === snapPointsOffset.length - 1) openTime.current = new Date();
  }, []);
  const {
    activeSnapPoint,
    activeSnapPointIndex,
    setActiveSnapPoint,
    onRelease: onReleaseSnapPoints,
    snapPointsOffset,
    onDrag: onDragSnapPoints,
    shouldFade,
    getPercentageDragged: getSnapPointsPercentageDragged
  } = useSnapPoints({
    snapPoints,
    activeSnapPointProp,
    setActiveSnapPointProp,
    drawerRef,
    fadeFromIndex,
    overlayRef,
    onSnapPointChange,
    direction,
    container,
    snapToSequentialPoint,
    isOpen,
    contentHeight,
    detachedOffset: detached ? detachedOffset : 0,
    maxContentHeight,
    peekHeight,
    initialAnimated
  });
  usePreventScroll({
    isDisabled: !isOpen || isDragging || !modal || justReleased || !hasBeenOpened || !repositionInputs || !disablePreventScroll
  });
  const {
    restorePositionSetting
  } = usePositionFixed({
    isOpen,
    modal,
    nested: nested ?? false,
    hasBeenOpened,
    preventScrollRestoration,
    noBodyStyles
  });
  function getScale() {
    return (window.innerWidth - WINDOW_TOP_OFFSET) / window.innerWidth;
  }
  function onPress(event) {
    if (!draggable) return;
    if (!dismissible && !snapPoints) return;
    if (drawerRef.current && !drawerRef.current.contains(event.target)) return;
    drawerHeightRef.current = drawerRef.current?.getBoundingClientRect().height || 0;
    drawerWidthRef.current = drawerRef.current?.getBoundingClientRect().width || 0;
    setIsDragging(true);
    dragStartTime.current = new Date();

    // iOS doesn't trigger mouseUp after scrolling so we need to listen to touched in order to disallow dragging
    if (isIOS()) {
      window.addEventListener('touchend', () => isAllowedToDrag.current = false, {
        once: true
      });
    }
    // Ensure we maintain correct pointer capture even when going outside of the drawer
    event.target.setPointerCapture(event.pointerId);
    pointerStart.current = isVertical(direction) ? event.pageY : event.pageX;
  }
  function shouldDrag(el, isDraggingInDirection) {
    let element = el;
    const highlightedText = window.getSelection()?.toString();
    const swipeAmount = drawerRef.current ? getTranslate(drawerRef.current, direction) : null;
    const date = new Date();

    // Fixes https://github.com/emilkowalski/vaul/issues/483
    if (element.tagName === 'SELECT') {
      return false;
    }
    if (element.hasAttribute('data-vaul-no-drag') || element.closest('[data-vaul-no-drag]')) {
      return false;
    }
    if (direction === 'right' || direction === 'left') {
      return true;
    }

    // Allow scrolling when animating
    if (openTime.current && date.getTime() - openTime.current.getTime() < 500) {
      return false;
    }
    if (swipeAmount !== null) {
      if (direction === 'bottom' ? swipeAmount > 0 : swipeAmount < 0) {
        return true;
      }
    }

    // Don't drag if there's highlighted text
    if (highlightedText && highlightedText.length > 0) {
      return false;
    }

    // Disallow dragging if drawer was scrolled within `scrollLockTimeout`
    if (lastTimeDragPrevented.current && date.getTime() - lastTimeDragPrevented.current.getTime() < scrollLockTimeout && swipeAmount === 0) {
      lastTimeDragPrevented.current = date;
      return false;
    }
    if (isDraggingInDirection) {
      lastTimeDragPrevented.current = date;

      // We are dragging down so we should allow scrolling
      return false;
    }

    // Keep climbing up the DOM tree as long as there's a parent
    while (element) {
      // Check if the element is scrollable
      if (element.scrollHeight > element.clientHeight) {
        if (element.scrollTop !== 0) {
          lastTimeDragPrevented.current = new Date();

          // The element is scrollable and not scrolled to the top, so don't drag
          return false;
        }
        if (element.getAttribute('role') === 'dialog') {
          return true;
        }
      }

      // Move up to the parent element
      element = element.parentNode;
    }

    // No scrollable parents not scrolled to the top found, so drag
    return true;
  }
  function onDrag(event) {
    if (!drawerRef.current) {
      return;
    }

    // We need to know how much of the drawer has been dragged in percentages so that we can transform background accordingly
    if (isDragging) {
      const directionMultiplier = direction === 'bottom' || direction === 'right' ? 1 : -1;
      const draggedDistance = (pointerStart.current - (isVertical(direction) ? event.pageY : event.pageX)) * directionMultiplier;
      const isDraggingInDirection = draggedDistance > 0;

      // Pre condition for disallowing dragging in the close direction.
      const noCloseSnapPointsPreCondition = snapPoints && !dismissible && !isDraggingInDirection;

      // Disallow dragging down to close when first snap point is the active one and dismissible prop is set to false.
      if (noCloseSnapPointsPreCondition && activeSnapPointIndex === 0) return;

      // We need to capture last time when drag with scroll was triggered and have a timeout between
      const absDraggedDistance = Math.abs(draggedDistance);
      const wrapper = document.querySelector('[data-vaul-drawer-wrapper]');
      const drawerDimension = direction === 'bottom' || direction === 'top' ? drawerHeightRef.current : drawerWidthRef.current;

      // Calculate the percentage dragged, where 1 is the closed position
      let percentageDragged = absDraggedDistance / drawerDimension;
      const snapPointPercentageDragged = getSnapPointsPercentageDragged(absDraggedDistance, isDraggingInDirection);
      if (snapPointPercentageDragged !== null) {
        percentageDragged = snapPointPercentageDragged;
      }

      // Disallow close dragging beyond the smallest snap point.
      if (noCloseSnapPointsPreCondition && percentageDragged >= 1) {
        return;
      }
      if (!isAllowedToDrag.current && !shouldDrag(event.target, isDraggingInDirection)) return;
      drawerRef.current.classList.add(DRAG_CLASS);
      // If shouldDrag gave true once after pressing down on the drawer, we set isAllowedToDrag to true and it will remain true until we let go, there's no reason to disable dragging mid way, ever, and that's the solution to it
      isAllowedToDrag.current = true;
      set(drawerRef.current, {
        transition: 'none'
      });
      set(overlayRef.current, {
        transition: 'none'
      });
      onDragProp?.(event, percentageDragged);
      if (snapPoints) {
        onDragSnapPoints({
          draggedDistance
        });
      }

      // Run this only if snapPoints are not defined or if we are at the last snap point (highest one)
      if (isDraggingInDirection && !snapPoints) {
        const dampenedDraggedDistance = dampenValue(draggedDistance);
        const translateValue = Math.min(dampenedDraggedDistance * -1, 0) * directionMultiplier;
        set(drawerRef.current, {
          transform: isVertical(direction) ? `translate3d(0, ${translateValue}px, 0)` : `translate3d(${translateValue}px, 0, 0)`
        });
        return;
      }
      const opacityValue = 1 - percentageDragged;
      if (shouldFade || fadeFromIndex && activeSnapPointIndex === fadeFromIndex - 1) {
        set(overlayRef.current, {
          opacity: `${opacityValue}`,
          transition: 'none'
        }, true);
      }
      if (wrapper && overlayRef.current && shouldScaleBackground) {
        // Calculate percentageDragged as a fraction (0 to 1)
        const scaleValue = Math.min(getScale() + percentageDragged * (1 - getScale()), 1);
        const borderRadiusValue = 8 - percentageDragged * 8;
        const translateValue = Math.max(0, 14 - percentageDragged * 14);
        set(wrapper, {
          borderRadius: `${borderRadiusValue}px`,
          transform: isVertical(direction) ? `scale(${scaleValue}) translate3d(0, ${translateValue}px, 0)` : `scale(${scaleValue}) translate3d(${translateValue}px, 0, 0)`,
          transition: 'none'
        }, true);
      }
      if (!snapPoints) {
        const translateValue = absDraggedDistance * directionMultiplier;
        set(drawerRef.current, {
          transform: isVertical(direction) ? `translate3d(0, ${translateValue}px, 0)` : `translate3d(${translateValue}px, 0, 0)`
        });
      }
    }
  }
  React.useEffect(() => {
    window.requestAnimationFrame(() => {
      shouldAnimate.current = true;
    });
  }, []);

  // Reset to the first snap point on every open so a prior session's active snap
  // (kept in state by `useControllableState` after dismissal) doesn't leak into
  // the next present. Skipped when `activeSnapPoint` is controlled externally.
  React.useEffect(() => {
    if (isOpen && snapPoints && activeSnapPointProp === undefined) {
      setActiveSnapPoint(snapPoints[0]);
    }
  }, [isOpen]);
  const onPositionChangeRef = React.useRef(onPositionChange);
  React.useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  });
  React.useEffect(() => {
    function onVisualViewportChange() {
      if (!drawerRef.current || !repositionInputs) return;
      const focusedElement = document.activeElement;
      if (isInput(focusedElement) || keyboardIsOpen.current) {
        const visualViewportHeight = window.visualViewport?.height || 0;
        const totalHeight = window.innerHeight;
        // This is the height of the keyboard
        let diffFromInitial = totalHeight - visualViewportHeight;
        const drawerHeight = drawerRef.current.getBoundingClientRect().height || 0;
        // Adjust drawer height only if it's tall enough
        const isTallEnough = drawerHeight > totalHeight * 0.8;
        if (!initialDrawerHeight.current) {
          initialDrawerHeight.current = drawerHeight;
        }
        const offsetFromTop = drawerRef.current.getBoundingClientRect().top;

        // visualViewport height may change due to somq e subtle changes to the keyboard. Checking if the height changed by 60 or more will make sure that they keyboard really changed its open state.
        if (Math.abs(previousDiffFromInitial.current - diffFromInitial) > 60) {
          keyboardIsOpen.current = !keyboardIsOpen.current;
        }
        if (snapPoints && snapPoints.length > 0 && snapPointsOffset && activeSnapPointIndex) {
          const activeSnapPointHeight = snapPointsOffset[activeSnapPointIndex] || 0;
          diffFromInitial += activeSnapPointHeight;
        }
        previousDiffFromInitial.current = diffFromInitial;
        // We don't have to change the height if the input is in view, when we are here we are in the opened keyboard state so we can correctly check if the input is in view
        if (drawerHeight > visualViewportHeight || keyboardIsOpen.current) {
          const height = drawerRef.current.getBoundingClientRect().height;
          let newDrawerHeight = height;
          if (height > visualViewportHeight) {
            newDrawerHeight = visualViewportHeight - (isTallEnough ? offsetFromTop : WINDOW_TOP_OFFSET);
          }
          // When fixed, don't move the drawer upwards if there's space, but rather only change it's height so it's fully scrollable when the keyboard is open
          if (fixed) {
            drawerRef.current.style.height = `${height - Math.max(diffFromInitial, 0)}px`;
          } else {
            drawerRef.current.style.height = `${Math.max(newDrawerHeight, visualViewportHeight - offsetFromTop)}px`;
          }
        } else if (!isMobileFirefox()) {
          drawerRef.current.style.height = `${initialDrawerHeight.current}px`;
        }
        if (snapPoints && snapPoints.length > 0 && !keyboardIsOpen.current) {
          drawerRef.current.style.bottom = '0px';
        } else {
          // Negative bottom value would never make sense
          drawerRef.current.style.bottom = `${Math.max(diffFromInitial, 0)}px`;
        }
      }
    }
    window.visualViewport?.addEventListener('resize', onVisualViewportChange);
    return () => window.visualViewport?.removeEventListener('resize', onVisualViewportChange);
  }, [activeSnapPointIndex, snapPoints, snapPointsOffset]);
  function closeDrawer(fromWithin) {
    cancelDrag();
    onClose?.();
    if (!fromWithin) {
      setIsOpen(false);
    }
  }
  function resetDrawer() {
    if (!drawerRef.current) return;
    const wrapper = document.querySelector('[data-vaul-drawer-wrapper]');
    const currentSwipeAmount = getTranslate(drawerRef.current, direction);
    set(drawerRef.current, {
      transform: 'translate3d(0, 0, 0)',
      transition: `transform ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`
    });
    set(overlayRef.current, {
      transition: `opacity ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
      opacity: '1'
    });

    // Don't reset background if swiped upwards
    if (shouldScaleBackground && currentSwipeAmount && currentSwipeAmount > 0 && isOpen) {
      set(wrapper, {
        borderRadius: `${BORDER_RADIUS}px`,
        overflow: 'hidden',
        ...(isVertical(direction) ? {
          transform: `scale(${getScale()}) translate3d(0, calc(env(safe-area-inset-top) + 14px), 0)`,
          transformOrigin: 'top'
        } : {
          transform: `scale(${getScale()}) translate3d(calc(env(safe-area-inset-top) + 14px), 0, 0)`,
          transformOrigin: 'left'
        }),
        transitionProperty: 'transform, border-radius',
        transitionDuration: `${TRANSITIONS.DURATION}s`,
        transitionTimingFunction: `cubic-bezier(${TRANSITIONS.EASE.join(',')})`
      }, true);
    }
  }
  function cancelDrag() {
    if (!isDragging || !drawerRef.current) return;
    drawerRef.current.classList.remove(DRAG_CLASS);
    isAllowedToDrag.current = false;
    setIsDragging(false);
    dragEndTime.current = new Date();
  }
  function onRelease(event) {
    if (!isDragging || !drawerRef.current) return;
    drawerRef.current.classList.remove(DRAG_CLASS);
    isAllowedToDrag.current = false;
    setIsDragging(false);
    dragEndTime.current = new Date();
    const swipeAmount = getTranslate(drawerRef.current, direction);
    if (!event || !shouldDrag(event.target, false) || !swipeAmount || Number.isNaN(swipeAmount)) return;
    if (dragStartTime.current === null) return;
    const timeTaken = dragEndTime.current.getTime() - dragStartTime.current.getTime();
    const distMoved = pointerStart.current - (isVertical(direction) ? event.pageY : event.pageX);
    const velocity = Math.abs(distMoved) / timeTaken;
    if (velocity > 0.05) {
      // `justReleased` is needed to prevent the drawer from focusing on an input when the drag ends, as it's not the intent most of the time.
      setJustReleased(true);
      setTimeout(() => {
        setJustReleased(false);
      }, 200);
    }
    if (snapPoints) {
      const directionMultiplier = direction === 'bottom' || direction === 'right' ? 1 : -1;
      onReleaseSnapPoints({
        draggedDistance: distMoved * directionMultiplier,
        closeDrawer,
        velocity,
        dismissible
      });
      onReleaseProp?.(event, true);
      return;
    }

    // Moved upwards, don't do anything
    if (direction === 'bottom' || direction === 'right' ? distMoved > 0 : distMoved < 0) {
      resetDrawer();
      onReleaseProp?.(event, true);
      return;
    }
    if (velocity > VELOCITY_THRESHOLD) {
      closeDrawer();
      onReleaseProp?.(event, false);
      return;
    }
    const visibleDrawerHeight = Math.min(drawerRef.current.getBoundingClientRect().height ?? 0, window.innerHeight);
    const visibleDrawerWidth = Math.min(drawerRef.current.getBoundingClientRect().width ?? 0, window.innerWidth);
    const isHorizontalSwipe = direction === 'left' || direction === 'right';
    if (Math.abs(swipeAmount) >= (isHorizontalSwipe ? visibleDrawerWidth : visibleDrawerHeight) * closeThreshold) {
      closeDrawer();
      onReleaseProp?.(event, false);
      return;
    }
    onReleaseProp?.(event, true);
    resetDrawer();
  }
  React.useEffect(() => {
    // Trigger enter animation without using CSS animation
    if (isOpen) {
      set(document.documentElement, {
        scrollBehavior: 'auto'
      });
      openTime.current = new Date();
    }
    return () => {
      reset(document.documentElement, 'scrollBehavior');
    };
  }, [isOpen]);
  function onNestedOpenChange(o) {
    const scale = o ? (window.innerWidth - NESTED_DISPLACEMENT) / window.innerWidth : 1;
    const initialTranslate = o ? -NESTED_DISPLACEMENT : 0;
    if (nestedOpenChangeTimer.current) {
      window.clearTimeout(nestedOpenChangeTimer.current);
    }
    set(drawerRef.current, {
      transition: `transform ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
      transform: isVertical(direction) ? `scale(${scale}) translate3d(0, ${initialTranslate}px, 0)` : `scale(${scale}) translate3d(${initialTranslate}px, 0, 0)`
    });
    if (!o && drawerRef.current) {
      nestedOpenChangeTimer.current = setTimeout(() => {
        const translateValue = getTranslate(drawerRef.current, direction);
        set(drawerRef.current, {
          transition: 'none',
          transform: isVertical(direction) ? `translate3d(0, ${translateValue}px, 0)` : `translate3d(${translateValue}px, 0, 0)`
        });
      }, 500);
    }
  }
  function onNestedDrag(_event, percentageDragged) {
    if (percentageDragged < 0) return;
    const initialScale = (window.innerWidth - NESTED_DISPLACEMENT) / window.innerWidth;
    const newScale = initialScale + percentageDragged * (1 - initialScale);
    const newTranslate = -NESTED_DISPLACEMENT + percentageDragged * NESTED_DISPLACEMENT;
    set(drawerRef.current, {
      transform: isVertical(direction) ? `scale(${newScale}) translate3d(0, ${newTranslate}px, 0)` : `scale(${newScale}) translate3d(${newTranslate}px, 0, 0)`,
      transition: 'none'
    });
  }
  function onNestedRelease(_event, o) {
    const dim = isVertical(direction) ? window.innerHeight : window.innerWidth;
    const scale = o ? (dim - NESTED_DISPLACEMENT) / dim : 1;
    const translate = o ? -NESTED_DISPLACEMENT : 0;
    if (o) {
      set(drawerRef.current, {
        transition: `transform ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`,
        transform: isVertical(direction) ? `scale(${scale}) translate3d(0, ${translate}px, 0)` : `scale(${scale}) translate3d(${translate}px, 0, 0)`
      });
    }
  }
  return /*#__PURE__*/_jsx(DialogPrimitive.Root, {
    defaultOpen: defaultOpen,
    onOpenChange: open => {
      if (!dismissible && !open) return;
      if (open) {
        setHasBeenOpened(true);
      } else {
        closeDrawer(true);
      }
      setIsOpen(open);
    },
    open: isOpen
    // Always non-modal at the Radix level — Radix's modal mode locks
    // body.style.pointerEvents and its restore on layer unmount is buggy
    // (see git history). Vaul's own overlay handles click-trapping; the
    // overlay sets pointer-events: none below fadeFromIndex so clicks
    // pass through to the page (matches native dimmedDetentIndex). Vaul's
    // own `modal` prop still drives overlay rendering and click-outside
    // behavior below.
    ,
    modal: false,
    children: /*#__PURE__*/_jsx(DrawerContext.Provider, {
      value: {
        activeSnapPoint,
        snapPoints,
        setActiveSnapPoint,
        drawerRef,
        overlayRef,
        onOpenChange,
        onPress,
        onRelease,
        onDrag,
        dismissible,
        shouldAnimate,
        handleOnly,
        isOpen,
        isDragging,
        shouldFade,
        closeDrawer,
        onNestedDrag,
        onNestedOpenChange,
        onNestedRelease,
        keyboardIsOpen,
        modal,
        snapPointsOffset,
        activeSnapPointIndex,
        fadeFromIndex,
        direction,
        shouldScaleBackground,
        setBackgroundColorOnScale,
        noBodyStyles,
        container,
        autoFocus,
        onPositionChangeRef,
        setContentHeight,
        detached,
        detachedOffset: detached ? detachedOffset : 0,
        detachedRadius: detached ? detachedRadius : 0,
        detachedWrapperStyle
      },
      children: children
    })
  });
}
export const Overlay = /*#__PURE__*/React.forwardRef(({
  style,
  ...rest
}, ref) => {
  const {
    overlayRef,
    snapPoints,
    onRelease,
    shouldFade,
    isOpen,
    modal,
    shouldAnimate,
    activeSnapPointIndex,
    fadeFromIndex
  } = useDrawerContext();
  const composedRef = useComposedRefs(ref, overlayRef);
  const hasSnapPoints = snapPoints && snapPoints.length > 0;
  const [delayedSnapPoints, setDelayedSnapPoints] = React.useState(false);
  const onMouseUp = React.useCallback(event => onRelease(event), [onRelease]);
  React.useEffect(() => {
    if (hasSnapPoints) {
      window.requestAnimationFrame(() => {
        setDelayedSnapPoints(true);
      });
    }
  }, []);

  // Overlay is the component that is locking scroll, removing it will unlock the scroll without having to dig into Radix's Dialog library
  if (!modal) {
    return null;
  }

  // When the active snap is below fadeFromIndex, the overlay is fully
  // transparent (CSS opacity: 0). Radix's DialogOverlayImpl sets inline
  // `pointer-events: auto` which would still catch clicks on the invisible
  // layer — drive this via React so it stays correct even before
  // `snapToPoint` runs (Presence defers the drawer/overlay mount, leaving
  // refs null on the first open effect pass).
  const isBelowFade = hasSnapPoints && fadeFromIndex !== undefined && typeof activeSnapPointIndex === 'number' && activeSnapPointIndex < fadeFromIndex;

  // Render our own overlay element instead of `DialogPrimitive.Overlay`:
  // Radix's Overlay returns null when the Dialog is non-modal, and we run
  // Radix as `modal={false}` to keep it from locking body pointer-events.
  // `Presence` keeps the node mounted through the closing animation
  // (`fadeOut`) before unmounting.
  return /*#__PURE__*/_jsx(Presence, {
    present: isOpen,
    children: /*#__PURE__*/_jsx("div", {
      onMouseUp: onMouseUp,
      ref: composedRef,
      "data-state": isOpen ? 'open' : 'closed',
      "data-vaul-overlay": "",
      "data-vaul-snap-points": isOpen && hasSnapPoints ? 'true' : 'false',
      "data-vaul-delayed-snap-points": delayedSnapPoints ? 'true' : 'false',
      "data-vaul-snap-points-overlay": isOpen && shouldFade ? 'true' : 'false',
      "data-vaul-animate": shouldAnimate?.current ? 'true' : 'false',
      ...rest,
      style: overlayStyle(style, !!isBelowFade)
    })
  });
});
Overlay.displayName = 'Drawer.Overlay';
const overlayStyle = (style, isBelowFade) => ({
  ...style,
  pointerEvents: isBelowFade ? 'none' : 'auto'
});
export const Content = /*#__PURE__*/React.forwardRef(({
  onPointerDownOutside,
  onEscapeKeyDown,
  style,
  onOpenAutoFocus,
  children,
  detachedSiblings,
  ...rest
}, ref) => {
  const {
    drawerRef,
    onPress,
    onRelease,
    onDrag,
    keyboardIsOpen,
    snapPointsOffset,
    activeSnapPointIndex,
    fadeFromIndex,
    modal,
    isOpen,
    isDragging,
    direction,
    snapPoints,
    setActiveSnapPoint,
    dismissible,
    container,
    handleOnly,
    shouldAnimate,
    autoFocus,
    onPositionChangeRef,
    setContentHeight,
    detached,
    detachedOffset,
    detachedRadius,
    detachedWrapperStyle: detachedWrapperStyleProp
  } = useDrawerContext();
  // Always measure the inner wrapper's natural height. The drawer itself may
  // be styled to a fixed viewport height, so we measure an inner wrapper
  // instead. Ref callback starts the observer as soon as the node mounts
  // (Radix Presence defers the portal mount past useEffect). The measurement
  // drives the 'auto' snap point and is also exposed via
  // `onContentHeightChange` for callers that size the surrounding card.
  const autoRoRef = React.useRef(null);
  const setAutoSizeNode = React.useCallback(node => {
    autoRoRef.current?.disconnect();
    if (!node) {
      autoRoRef.current = null;
      return;
    }
    const measure = () => setContentHeight(node.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    autoRoRef.current = ro;
  }, [setContentHeight]);
  const isBelowFade = snapPoints !== undefined && snapPoints !== null && fadeFromIndex !== undefined && typeof activeSnapPointIndex === 'number' && activeSnapPointIndex < fadeFromIndex;
  // Needed to use transition instead of animations
  const [delayedSnapPoints, setDelayedSnapPoints] = React.useState(false);
  const composedRef = useComposedRefs(ref, drawerRef);
  const pointerStartRef = React.useRef(null);
  const lastKnownPointerEventRef = React.useRef(null);
  const wasBeyondThePointRef = React.useRef(false);
  const hasSnapPoints = snapPoints && snapPoints.length > 0;
  useScaleBackground();
  const isDeltaInDirection = (delta, dir, threshold = 0) => {
    if (wasBeyondThePointRef.current) return true;
    const deltaY = Math.abs(delta.y);
    const deltaX = Math.abs(delta.x);
    const isDeltaX = deltaX > deltaY;
    const dFactor = ['bottom', 'right'].includes(dir) ? 1 : -1;
    if (dir === 'left' || dir === 'right') {
      const isReverseDirection = delta.x * dFactor < 0;
      if (!isReverseDirection && deltaX >= 0 && deltaX <= threshold) {
        return isDeltaX;
      }
    } else {
      const isReverseDirection = delta.y * dFactor < 0;
      if (!isReverseDirection && deltaY >= 0 && deltaY <= threshold) {
        return !isDeltaX;
      }
    }
    wasBeyondThePointRef.current = true;
    return true;
  };
  React.useEffect(() => {
    if (hasSnapPoints) {
      window.requestAnimationFrame(() => {
        setDelayedSnapPoints(true);
      });
    }
  }, []);

  // Event-driven position tracking. We only tick RAF while the drawer is
  // actually moving (drag / CSS transition / CSS animation). When it's idle at
  // a snap, no frames run at all.
  const positionTrackingRef = React.useRef(null);
  React.useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    const state = {
      rafId: null,
      movingCount: 0,
      lastPosition: Number.NaN,
      start: () => {},
      stop: () => {}
    };
    const emit = () => {
      const cb = onPositionChangeRef.current;
      if (!cb) return;
      const position = drawer.getBoundingClientRect().top;
      if (position !== state.lastPosition) {
        state.lastPosition = position;
        cb(position);
      }
    };
    const tick = () => {
      emit();
      state.rafId = state.movingCount > 0 ? window.requestAnimationFrame(tick) : null;
    };
    state.start = () => {
      state.movingCount += 1;
      if (state.rafId === null) {
        state.rafId = window.requestAnimationFrame(tick);
      }
    };
    state.stop = () => {
      state.movingCount = Math.max(0, state.movingCount - 1);
      // RAF loop will exit on its next tick; emit the settled position now.
      if (state.movingCount === 0) emit();
    };
    const wrapper = drawer.closest('[data-vaul-detached-wrapper]');

    // Listen on the wrapper too: drag-overshoot snap-back animates the wrapper
    // alone when the drawer's target is unchanged (e.g. snapping back to the
    // same detent). Without this, position goes stale mid-animation because
    // the drawer's `transitionrun` never fires.
    const onTransitionRun = e => {
      if ((e.target === drawer || e.target === wrapper) && e.propertyName === 'transform') state.start();
    };
    const onTransitionDone = e => {
      if ((e.target === drawer || e.target === wrapper) && e.propertyName === 'transform') state.stop();
    };
    const onAnimationStart = e => {
      if (e.target === drawer || e.target === wrapper) state.start();
    };
    const onAnimationDone = e => {
      if (e.target === drawer || e.target === wrapper) state.stop();
    };
    drawer.addEventListener('transitionrun', onTransitionRun);
    drawer.addEventListener('transitionend', onTransitionDone);
    drawer.addEventListener('transitioncancel', onTransitionDone);
    drawer.addEventListener('animationstart', onAnimationStart);
    drawer.addEventListener('animationend', onAnimationDone);
    drawer.addEventListener('animationcancel', onAnimationDone);
    wrapper?.addEventListener('transitionrun', onTransitionRun);
    wrapper?.addEventListener('transitionend', onTransitionDone);
    wrapper?.addEventListener('transitioncancel', onTransitionDone);
    positionTrackingRef.current = state;
    emit();
    return () => {
      drawer.removeEventListener('transitionrun', onTransitionRun);
      drawer.removeEventListener('transitionend', onTransitionDone);
      drawer.removeEventListener('transitioncancel', onTransitionDone);
      drawer.removeEventListener('animationstart', onAnimationStart);
      drawer.removeEventListener('animationend', onAnimationDone);
      drawer.removeEventListener('animationcancel', onAnimationDone);
      wrapper?.removeEventListener('transitionrun', onTransitionRun);
      wrapper?.removeEventListener('transitionend', onTransitionDone);
      wrapper?.removeEventListener('transitioncancel', onTransitionDone);
      if (state.rafId !== null) window.cancelAnimationFrame(state.rafId);
      positionTrackingRef.current = null;
    };
  }, []);
  React.useEffect(() => {
    const state = positionTrackingRef.current;
    if (!state) return;
    if (isDragging) state.start();else state.stop();
  }, [isDragging]);
  function handleOnPointerUp(event) {
    pointerStartRef.current = null;
    wasBeyondThePointRef.current = false;
    onRelease(event);
  }

  // The drawer always sits inside a fixed clip wrapper. `contain: paint`
  // establishes the wrapper as the containing block so the drawer's own
  // `position: fixed` is constrained here, and `overflow: hidden` keeps any
  // overshoot out of the viewport. When `detached` the wrapper also floats
  // with a bottom gap and rounded bottom corners; otherwise it sits flush.
  // Transform/transition are managed imperatively (via drag overshoot and the
  // dismiss effect) so React doesn't skip DOM writes for values it thinks it
  // already owns.
  const wrapperStyle = React.useMemo(() => ({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: detached ? detachedOffset : 0,
    overflow: 'hidden',
    contain: 'paint',
    pointerEvents: 'none',
    borderBottomLeftRadius: detached ? detachedRadius : 0,
    borderBottomRightRadius: detached ? detachedRadius : 0,
    ...detachedWrapperStyleProp
  }), [detached, detachedOffset, detachedRadius, detachedWrapperStyleProp]);

  // Translate the wrapper off-screen on dismiss so the whole card slides out
  // as one. The reset-then-target pattern on open forces the browser to
  // record a starting value so the transition actually animates.
  // Start at `false` so a mount with `isOpen=true` (autopresent via
  // `initialDetentIndex`) is detected as a false→true transition and runs
  // the slide-up animation instead of snapping straight to rest.
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (!drawerRef.current) {
      wasOpenRef.current = isOpen;
      return;
    }
    const wrapper = drawerRef.current.closest('[data-vaul-detached-wrapper]');
    if (wrapper) {
      const transition = `transform ${TRANSITIONS.DURATION}s cubic-bezier(${TRANSITIONS.EASE.join(',')})`;
      const viewportH = typeof window !== 'undefined' ? window.innerHeight : 0;
      if (!isOpen && wasOpenRef.current) {
        wrapper.style.transition = transition;
        wrapper.style.transform = `translate3d(0, ${viewportH}px, 0)`;
      } else if (isOpen && !wasOpenRef.current) {
        wrapper.style.transition = 'none';
        wrapper.style.transform = `translate3d(0, ${viewportH}px, 0)`;
        // eslint-disable-next-line no-void
        void wrapper.offsetHeight;
        wrapper.style.transition = transition;
        wrapper.style.transform = 'translate3d(0, 0, 0)';
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, detached, drawerRef]);
  const contentNode = /*#__PURE__*/_jsx(DialogPrimitive.Content, {
    "data-vaul-drawer-direction": direction,
    "data-vaul-drawer": "",
    "data-vaul-detached": detached ? 'true' : 'false',
    "data-vaul-delayed-snap-points": delayedSnapPoints ? 'true' : 'false',
    "data-vaul-snap-points": isOpen && hasSnapPoints ? 'true' : 'false',
    "data-vaul-custom-container": container ? 'true' : 'false',
    "data-vaul-animate": shouldAnimate?.current ? 'true' : 'false',
    ...rest,
    ref: composedRef,
    style: snapPointsOffset && snapPointsOffset.length > 0 ? {
      '--snap-point-height': `${snapPointsOffset[activeSnapPointIndex ?? 0]}px`,
      ...style,
      'pointerEvents': 'auto'
    } : {
      ...style,
      pointerEvents: 'auto'
    },
    onPointerDown: event => {
      if (handleOnly) return;
      rest.onPointerDown?.(event);
      pointerStartRef.current = {
        x: event.pageX,
        y: event.pageY
      };
      onPress(event);
    },
    onOpenAutoFocus: e => {
      onOpenAutoFocus?.(e);
      if (!autoFocus) {
        e.preventDefault();
      }
    },
    onPointerDownOutside: e => {
      onPointerDownOutside?.(e);
      if (!modal || e.defaultPrevented || isBelowFade) {
        e.preventDefault();
        return;
      }

      // Non-dismissible + dimmed: collapse to the highest non-dimmed
      // snap point instead of silently swallowing the dismiss attempt.
      // Mirrors the native Android dim-tap behavior.
      if (!dismissible && hasSnapPoints && fadeFromIndex !== undefined && fadeFromIndex > 0 && typeof activeSnapPointIndex === 'number' && activeSnapPointIndex >= fadeFromIndex) {
        e.preventDefault();
        setActiveSnapPoint(snapPoints[fadeFromIndex - 1]);
        return;
      }
      if (keyboardIsOpen.current) {
        keyboardIsOpen.current = false;
      }
    },
    onEscapeKeyDown: e => {
      onEscapeKeyDown?.(e);
      if (e.defaultPrevented) return;

      // Non-dismissible: collapse to the first snap point (if above it)
      // instead of silently swallowing the dismiss attempt. Mirrors the
      // native Android back-press behavior.
      if (!dismissible) {
        e.preventDefault();
        if (hasSnapPoints && typeof activeSnapPointIndex === 'number' && activeSnapPointIndex > 0) {
          setActiveSnapPoint(snapPoints[0]);
        }
      }
    },
    onFocusOutside: e => {
      // Never auto-dismiss the sheet on focus shifts. Without Radix's
      // FocusScope trap (we run modal={false}), this fires whenever
      // focus naturally leaves the drawer — e.g. React Navigation's
      // web driver hides the previous screen via display:none, which
      // moves focus off the trigger and dismisses the sheet.
      e.preventDefault();
    },
    onPointerMove: event => {
      lastKnownPointerEventRef.current = event;
      if (handleOnly) return;
      rest.onPointerMove?.(event);
      if (!pointerStartRef.current) return;
      const yPosition = event.pageY - pointerStartRef.current.y;
      const xPosition = event.pageX - pointerStartRef.current.x;
      const swipeStartThreshold = event.pointerType === 'touch' ? 10 : 2;
      const delta = {
        x: xPosition,
        y: yPosition
      };
      const isAllowedToSwipe = isDeltaInDirection(delta, direction, swipeStartThreshold);
      if (isAllowedToSwipe) onDrag(event);else if (Math.abs(xPosition) > swipeStartThreshold || Math.abs(yPosition) > swipeStartThreshold) {
        pointerStartRef.current = null;
      }
    },
    onPointerUp: event => {
      rest.onPointerUp?.(event);
      pointerStartRef.current = null;
      wasBeyondThePointRef.current = false;
      onRelease(event);
    },
    onPointerOut: event => {
      rest.onPointerOut?.(event);
      handleOnPointerUp(lastKnownPointerEventRef.current);
    },
    onContextMenu: event => {
      rest.onContextMenu?.(event);
      if (lastKnownPointerEventRef.current) {
        handleOnPointerUp(lastKnownPointerEventRef.current);
      }
    },
    children: /*#__PURE__*/_jsx("div", {
      ref: setAutoSizeNode,
      "data-vaul-auto-size-wrapper": "",
      style: autoSizeWrapperStyle,
      children: children
    })
  });
  return /*#__PURE__*/_jsxs("div", {
    "data-vaul-detached-wrapper": "",
    style: wrapperStyle,
    children: [contentNode, detachedSiblings]
  });
});
Content.displayName = 'Drawer.Content';

// `flow-root` establishes a new block formatting context so the first child's
// margin-top (e.g. a grabber) stays inside the wrapper instead of collapsing
// out — otherwise `offsetHeight` under-reports and the drawer positions the
// wrapper below where the content actually ends.
const autoSizeWrapperStyle = {
  display: 'flow-root'
};
const LONG_HANDLE_PRESS_TIMEOUT = 250;
const DOUBLE_TAP_TIMEOUT = 120;
export const Handle = /*#__PURE__*/React.forwardRef(({
  preventCycle = false,
  children,
  ...rest
}, ref) => {
  const {
    closeDrawer,
    isDragging,
    snapPoints,
    activeSnapPoint,
    setActiveSnapPoint,
    dismissible,
    handleOnly,
    isOpen,
    onPress,
    onDrag
  } = useDrawerContext();
  const closeTimeoutIdRef = React.useRef(null);
  const shouldCancelInteractionRef = React.useRef(false);
  function handleStartCycle() {
    // Stop if this is the second click of a double click
    if (shouldCancelInteractionRef.current) {
      handleCancelInteraction();
      return;
    }
    window.setTimeout(() => {
      handleCycleSnapPoints();
    }, DOUBLE_TAP_TIMEOUT);
  }
  function handleCycleSnapPoints() {
    // Prevent accidental taps while resizing drawer
    if (isDragging || preventCycle || shouldCancelInteractionRef.current) {
      handleCancelInteraction();
      return;
    }
    // Make sure to clear the timeout id if the user releases the handle before the cancel timeout
    handleCancelInteraction();
    if (!snapPoints || snapPoints.length === 0) {
      if (!dismissible) {
        closeDrawer();
      }
      return;
    }
    const isLastSnapPoint = activeSnapPoint === snapPoints[snapPoints.length - 1];
    if (isLastSnapPoint && dismissible) {
      closeDrawer();
      return;
    }
    const currentSnapIndex = snapPoints.findIndex(point => point === activeSnapPoint);
    if (currentSnapIndex === -1) return; // activeSnapPoint not found in snapPoints
    const nextSnapPoint = snapPoints[currentSnapIndex + 1];
    if (nextSnapPoint === undefined) return;
    setActiveSnapPoint(nextSnapPoint);
  }
  function handleStartInteraction() {
    closeTimeoutIdRef.current = window.setTimeout(() => {
      // Cancel click interaction on a long press
      shouldCancelInteractionRef.current = true;
    }, LONG_HANDLE_PRESS_TIMEOUT);
  }
  function handleCancelInteraction() {
    if (closeTimeoutIdRef.current) {
      window.clearTimeout(closeTimeoutIdRef.current);
    }
    shouldCancelInteractionRef.current = false;
  }
  return /*#__PURE__*/_jsx("div", {
    onClick: handleStartCycle,
    onPointerCancel: handleCancelInteraction,
    onPointerDown: e => {
      if (handleOnly) onPress(e);
      handleStartInteraction();
    },
    onPointerMove: e => {
      if (handleOnly) onDrag(e);
    }
    // onPointerUp is already handled by the content component
    ,
    ref: ref,
    "data-vaul-drawer-visible": isOpen ? 'true' : 'false',
    "data-vaul-handle": "",
    "aria-hidden": "true",
    ...rest,
    children: /*#__PURE__*/_jsx("span", {
      "data-vaul-handle-hitarea": "",
      "aria-hidden": "true",
      children: children
    })
  });
});
Handle.displayName = 'Drawer.Handle';
export function NestedRoot({
  onDrag,
  onOpenChange,
  open: nestedIsOpen,
  ...rest
}) {
  const {
    onNestedDrag,
    onNestedOpenChange,
    onNestedRelease
  } = useDrawerContext();
  if (!onNestedDrag) {
    throw new Error('Drawer.NestedRoot must be placed in another drawer');
  }
  return /*#__PURE__*/_jsx(Root, {
    nested: true,
    open: nestedIsOpen,
    onClose: () => {
      onNestedOpenChange(false);
    },
    onDrag: (e, p) => {
      onNestedDrag(e, p);
      onDrag?.(e, p);
    },
    onOpenChange: o => {
      if (o) {
        onNestedOpenChange(o);
      }
      onOpenChange?.(o);
    },
    onRelease: onNestedRelease,
    ...rest
  });
}
export function Portal(props) {
  const context = useDrawerContext();
  const {
    container = context.container,
    ...portalProps
  } = props;
  return /*#__PURE__*/_jsx(DialogPrimitive.Portal, {
    container: container,
    ...portalProps
  });
}
export const Drawer = {
  Root,
  NestedRoot,
  Content,
  Overlay,
  Trigger: DialogPrimitive.Trigger,
  Portal,
  Handle,
  Close: DialogPrimitive.Close,
  Title: DialogPrimitive.Title,
  Description: DialogPrimitive.Description
};
//# sourceMappingURL=index.js.map