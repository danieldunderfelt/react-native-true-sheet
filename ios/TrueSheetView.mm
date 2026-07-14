//
//  Created by Jovanni Lo (@lodev09)
//  Copyright (c) 2024-present. All rights reserved.
//
//  This source code is licensed under the MIT license found in the
//  LICENSE file in the root directory of this source tree.
//

#ifdef RCT_NEW_ARCH_ENABLED

#import "TrueSheetView.h"
#import "TrueSheetContainerView.h"
#import "TrueSheetContentView.h"
#import "TrueSheetFooterView.h"
#import "TrueSheetModule.h"
#import "TrueSheetViewController.h"
#import "core/RNScreensEventObserver.h"
#import "events/TrueSheetDragEvents.h"
#import "events/TrueSheetFocusEvents.h"
#import "events/TrueSheetLifecycleEvents.h"
#import "events/TrueSheetStateEvents.h"
#import "utils/LayoutUtil.h"

#import <react/renderer/components/TrueSheetSpec/EventEmitters.h>
#import <react/renderer/components/TrueSheetSpec/Props.h>
#import <react/renderer/components/TrueSheetSpec/RCTComponentViewHelpers.h>
#import <react/renderer/components/TrueSheetSpec/TrueSheetViewComponentDescriptor.h>
#import <react/renderer/components/TrueSheetSpec/TrueSheetViewShadowNode.h>
#import <react/renderer/components/TrueSheetSpec/TrueSheetViewState.h>

#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <React/RCTLog.h>
#import <React/RCTSurfaceTouchHandler.h>
#import <React/RCTUtils.h>
#import <cxxreact/ReactNativeVersion.h>
#import <react/renderer/core/State.h>

using namespace facebook::react;

typedef NS_OPTIONS(NSUInteger, TrueSheetHideReason) {
  TrueSheetHideReasonNavigation = 1 << 0,
  TrueSheetHideReasonSuspension = 1 << 1,
};

@interface TrueSheetView () <TrueSheetViewControllerDelegate,
  TrueSheetContainerViewDelegate,
  RNScreensEventObserverDelegate>
@end

@implementation TrueSheetView {
  TrueSheetContainerView *_containerView;
  TrueSheetViewController *_controller;
  RCTSurfaceTouchHandler *_touchHandler;
  TrueSheetViewShadowNode::ConcreteState::Shared _state;
  UIView *_snapshotView;
  CGSize _lastStateSize;
  NSInteger _initialDetentIndex;
  TrueSheetViewInsetAdjustment _insetAdjustment;
  BOOL _scrollable;
  ScrollableOptions *_scrollableOptions;
  BOOL _initialDetentAnimated;
  BOOL _isSheetUpdatePending;
  BOOL _pendingLayoutUpdate;
  BOOL _didInitiallyPresent;
  BOOL _dismissedByNavigation;
  BOOL _dismissedByPresenterTeardown;
  BOOL _pendingNavigationRepresent;
  BOOL _pendingMountEvent;
  BOOL _pendingSizeChange;
  BOOL _pendingPropsUpdate;
  NSArray *_pendingDetents;
  RNScreensEventObserver *_screensEventObserver;
  BOOL _suspendedProp;
  BOOL _suspendedByModule;
  BOOL _suspensionActive;
  BOOL _logicallyOpen;
  BOOL _resumeEmitsPresentEvents;
  NSUInteger _hideReasons;
  BOOL _dismissingForSuspension;
  BOOL _suppressPresentEvents;
  NSUInteger _presentEventGeneration;
  BOOL _applySuspendAfterPresent;
  TrueSheetCompletionBlock _applyDismissAfterPresent;
  BOOL _pendingSuspendedValue;
  BOOL _hasPendingSuspendedChange;
  // Whether the next actual presentViewController: should suppress present events (a silent
  // resume). Threaded through the pending-present slot so a defer/supersede can't leak it.
  BOOL _nextPresentSuppressesEvents;
  BOOL _pendingPresentSuppressesEvents;

  // Single-slot pending present. A present issued while a dismissal transition is in
  // flight (our own, or one owned by the presenter chain) is parked here and replayed
  // from that transition's completion — never a timer.
  BOOL _hasPendingPresent;
  NSInteger _pendingPresentIndex;
  BOOL _pendingPresentAnimated;
  TrueSheetCompletionBlock _pendingPresentCompletion;
  NSUInteger _pendingPresentAttempts;
  CFTimeInterval _pendingPresentDeferredAt;
  NSUInteger _pendingPresentGeneration;
  NSUInteger _generation;
  BOOL _isReplayingPendingPresent;
  NSUInteger _currentReplayAttempts;
  CFTimeInterval _currentReplayDeferredAt;

  // The tag this view was registered under. Fabric resets self.tag to 0 *before* prepareForRecycle,
  // so unregistering by self.tag there (or in dealloc) is a no-op that leaks the real tag's registry
  // entry — a later ref call would then resolve the stale tag to whatever sheet reuses this view.
  // Cache it at registration and unregister by the cached value instead.
  NSInteger _registeredTag;

  // Content-not-ready gate. A present that lands before the container child has mounted — or
  // after it was torn down for an unmount/recycle — is parked here and replayed from
  // mountChildComponentView. A sheet must never appear without its content (an empty bar that
  // then vanishes when the teardown completes). Unlike the pending-present slot this has no
  // timeout: the mount is a deterministic signal, and a present that never gets content is
  // cleared by recycle/dealloc/dismiss instead.
  BOOL _hasPendingContentPresent;
  NSInteger _pendingContentPresentIndex;
  BOOL _pendingContentPresentAnimated;
  TrueSheetCompletionBlock _pendingContentPresentCompletion;
  BOOL _pendingContentPresentSuppressesEvents;
  NSUInteger _pendingContentPresentGeneration;
}

#pragma mark - Initialization

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const TrueSheetViewProps>();
    _props = defaultProps;

    self.hidden = YES;
    self.userInteractionEnabled = NO;

    _controller = [[TrueSheetViewController alloc] init];
    _controller.delegate = self;

    _touchHandler = [[RCTSurfaceTouchHandler alloc] init];
    _containerView = nil;
    _snapshotView = nil;
    _lastStateSize = CGSizeZero;
    _initialDetentIndex = -1;
    _initialDetentAnimated = YES;
    _scrollable = NO;
    _isSheetUpdatePending = NO;

    _screensEventObserver = [[RNScreensEventObserver alloc] init];
    _screensEventObserver.delegate = self;
  }
  return self;
}

- (void)didMoveToWindow {
  [super didMoveToWindow];

  if (!self.window)
    return;

  if (self.tag > 0) {
    _registeredTag = self.tag;
    [TrueSheetModule registerView:self withTag:@(self.tag)];
  }

  if (_pendingNavigationRepresent && !_controller.isPresented) {
    _pendingNavigationRepresent = NO;
    [self flushRepresentIfNeeded];
    return;
  }

  if (_initialDetentIndex >= 0 && !_didInitiallyPresent && (_suspendedProp || _suspendedByModule)) {
    _logicallyOpen = YES;
    _resumeEmitsPresentEvents = YES;
  }

  if (_initialDetentIndex >= 0 && !_didInitiallyPresent && !_suspendedProp && !_suspendedByModule) {
    UIViewController *vc = [self findPresentingViewController];

    // Only present if the view controller is in the same window and not being dismissed
    if (vc && vc.view.window == self.window && !_controller.isBeingDismissed) {
      _didInitiallyPresent = YES;
      [self presentAtIndex:_initialDetentIndex animated:_initialDetentAnimated completion:nil];
    } else {
      // Animate next time when sheet finally moves to the correct window
      _initialDetentAnimated = YES;
    }
  }
}

- (void)dealloc {
  [_screensEventObserver stopObserving];
  _screensEventObserver = nil;

  [self cancelPendingPresentWithReason:@"deallocated"];
  [self cancelPendingContentPresentWithReason:@"deallocated"];

  // Dismiss only this sheet's own presenter, non-animated — never the chain root (which
  // would tear down unrelated modals and parent sheets), and without spawning a fresh
  // animated transition that a subsequent present would then have to wait behind.
  if (_controller && _controller.presentingViewController && !_controller.isBeingDismissed) {
    [_controller.presentingViewController dismissViewControllerAnimated:NO completion:nil];
  }

  _didInitiallyPresent = NO;
  _dismissedByNavigation = NO;
  _dismissedByPresenterTeardown = NO;
  _pendingNavigationRepresent = NO;
  _suspendedProp = NO;
  _suspendedByModule = NO;
  _suspensionActive = NO;
  _logicallyOpen = NO;
  _resumeEmitsPresentEvents = NO;
  _hideReasons = 0;
  _dismissingForSuspension = NO;
  _suppressPresentEvents = NO;
  _presentEventGeneration = 0;
  _nextPresentSuppressesEvents = NO;
  _pendingPresentSuppressesEvents = NO;
  _applySuspendAfterPresent = NO;
  _applyDismissAfterPresent = nil;
  _pendingSuspendedValue = NO;
  _hasPendingSuspendedChange = NO;

  _controller.delegate = nil;
  _controller = nil;

  [_snapshotView removeFromSuperview];
  _snapshotView = nil;

  [TrueSheetModule unregisterViewWithTag:@(_registeredTag)];
  _registeredTag = 0;
}

#pragma mark - RCTComponentViewProtocol

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<TrueSheetViewComponentDescriptor>();
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  [super updateProps:props oldProps:oldProps];

  const auto &newProps = *std::static_pointer_cast<TrueSheetViewProps const>(props);

  // Detents (-1 represents "auto")
  NSMutableArray *detents = [NSMutableArray new];
  for (const auto &detent : newProps.detents) {
    [detents addObject:@(detent)];
  }

  if (oldProps) {
    const auto &prevProps = *std::static_pointer_cast<TrueSheetViewProps const>(oldProps);
    if (newProps.detents != prevProps.detents || newProps.insetAdjustment != prevProps.insetAdjustment) {
      _pendingLayoutUpdate = YES;
    }
    if (newProps.suspended != prevProps.suspended) {
      _pendingSuspendedValue = newProps.suspended;
      _hasPendingSuspendedChange = YES;
    }
  }

  if (_controller.isBeingPresented) {
    _pendingDetents = detents;
  } else {
    _controller.detents = detents;
  }

  // Background color
  _controller.backgroundColor = RCTUIColorFromSharedColor(newProps.backgroundColor);

  // Blur tint
  _controller.backgroundBlur = newProps.backgroundBlur;

  // Blur options
  const auto &blurOpts = newProps.blurOptions;
  _controller.blurIntensity = blurOpts.intensity >= 0 ? @(blurOpts.intensity) : nil;
  _controller.blurInteraction = blurOpts.interaction;

  // Corner radius
  _controller.cornerRadius = newProps.cornerRadius < 0 ? nil : @(newProps.cornerRadius);

  // Content height
  _controller.maxContentHeight = newProps.maxContentHeight != 0.0 ? @(newProps.maxContentHeight) : nil;

  // Content width
  _controller.maxContentWidth = newProps.maxContentWidth != 0.0 ? @(newProps.maxContentWidth) : nil;

  // Anchor
  _controller.anchor = newProps.anchor;

  _controller.grabber = newProps.grabber;

  // Grabber options - check if any non-default values are set
  const auto &grabberOpts = newProps.grabberOptions;
  UIColor *grabberColor = RCTUIColorFromSharedColor(grabberOpts.color);
  BOOL hasGrabberOptions = grabberOpts.width > 0 || grabberOpts.height > 0 || grabberOpts.topMargin > 0 ||
                           grabberOpts.cornerRadius >= 0 || grabberColor != nil || !grabberOpts.adaptive;

  if (hasGrabberOptions) {
    GrabberOptions *options = [[GrabberOptions alloc] init];
    if (grabberOpts.width > 0)
      options.width = @(grabberOpts.width);
    if (grabberOpts.height > 0)
      options.height = @(grabberOpts.height);
    if (grabberOpts.topMargin > 0)
      options.topMargin = @(grabberOpts.topMargin);
    if (grabberOpts.cornerRadius >= 0)
      options.cornerRadius = @(grabberOpts.cornerRadius);
    if (grabberColor)
      options.color = grabberColor;
    options.adaptive = grabberOpts.adaptive;
    _controller.grabberOptions = options;
  } else {
    _controller.grabberOptions = nil;
  }

  _controller.presentation = newProps.presentation;
  _controller.dismissible = newProps.dismissible;
  _controller.draggable = newProps.draggable;
  _controller.dimmed = newProps.dimmed;

  if (newProps.dimmedDetentIndex >= 0) {
    _controller.dimmedDetentIndex = @(newProps.dimmedDetentIndex);
  }

  _initialDetentIndex = newProps.initialDetentIndex;
  _initialDetentAnimated = newProps.initialDetentAnimated;
  _scrollable = newProps.scrollable;

  const auto &scrollableOpts = newProps.scrollableOptions;
  BOOL scrollingExpandsSheet = scrollableOpts.scrollingExpandsSheet;
  auto topEdgeEffect = scrollableOpts.topScrollEdgeEffect;
  auto bottomEdgeEffect = scrollableOpts.bottomScrollEdgeEffect;
  BOOL hasScrollableOptions = scrollableOpts.keyboardScrollOffset > 0 || !scrollingExpandsSheet ||
                              topEdgeEffect != TrueSheetViewTopScrollEdgeEffect::Hidden ||
                              bottomEdgeEffect != TrueSheetViewBottomScrollEdgeEffect::Hidden;

  if (hasScrollableOptions) {
    ScrollableOptions *options = [[ScrollableOptions alloc] init];
    options.keyboardScrollOffset = scrollableOpts.keyboardScrollOffset;
    options.scrollingExpandsSheet = scrollingExpandsSheet;
    options.topScrollEdgeEffect = topEdgeEffect;
    options.bottomScrollEdgeEffect = bottomEdgeEffect;
    _scrollableOptions = options;
  } else {
    _scrollableOptions = nil;
  }

  _controller.scrollingExpandsSheet = scrollingExpandsSheet;

  CGFloat footerKeyboardOffset = newProps.footerOptions.keyboardOffset;
  if (_controller.footerKeyboardOffset != footerKeyboardOffset) {
    _controller.footerKeyboardOffset = footerKeyboardOffset;
    [_containerView updateFooterKeyboardOffset];
  }

  _insetAdjustment = newProps.insetAdjustment;
  _controller.insetAdjustment = _insetAdjustment;

  [self setupScrollable];
}

- (void)updateState:(const State::Shared &)state oldState:(const State::Shared &)oldState {
  _state = std::static_pointer_cast<TrueSheetViewShadowNode::ConcreteState const>(state);

  if (_controller) {
    // Initialize with _controller size to set initial width
    [self viewControllerDidChangeSize:_controller.view.frame.size];
  }
}

/**
 * Updates Fabric state with container dimensions for Yoga layout.
 */
- (void)updateStateWithSize:(CGSize)size {
  if (!_state)
    return;

  if (fabs(size.width - _lastStateSize.width) < 0.5 && fabs(size.height - _lastStateSize.height) < 0.5)
    return;

  _lastStateSize = size;

  auto stateData = _state->getData();
  stateData.containerWidth = static_cast<float>(size.width);
  stateData.containerHeight = static_cast<float>(size.height);

#if REACT_NATIVE_VERSION_MINOR >= 82
  // TODO: RN 0.82+ processes state updates in the same layout pass (synchronous).
  // Once stable, we can drop native layout constraints in favor of synchronous Yoga layout.
  _state->updateState(std::move(stateData), facebook::react::EventQueue::UpdateMode::unstable_Immediate);
#else
  _state->updateState(std::move(stateData));
#endif
}

- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask {
  [super finalizeUpdates:updateMask];

  // Emit pending mount event now that eventEmitter is available
  if (_pendingMountEvent && (updateMask & RNComponentViewUpdateMaskEventEmitter)) {
    _pendingMountEvent = NO;
    [TrueSheetLifecycleEvents emitMount:_eventEmitter];
  }

  if (!(updateMask & RNComponentViewUpdateMaskProps) || !_controller)
    return;

  [self setupScrollable];

  if (_controller.isPresented) {
    [self applySheetPropsUpdate];
  } else if (_controller.isBeingPresented) {
    _pendingPropsUpdate = YES;
  } else if (_initialDetentIndex >= 0) {
    _pendingLayoutUpdate = NO;
  }

  if (_hasPendingSuspendedChange) {
    BOOL suspended = _pendingSuspendedValue;
    _hasPendingSuspendedChange = NO;
    [self applySuspended:suspended];
  }
}

- (void)prepareForRecycle {
  [super prepareForRecycle];

  // Fabric has already zeroed self.tag by now — unregister by the cached tag (see _registeredTag).
  [TrueSheetModule unregisterViewWithTag:@(_registeredTag)];
  _registeredTag = 0;

  // Invalidate any deferred present from this incarnation and stop observing.
  _generation++;
  [self cancelPendingPresentWithReason:@"recycled"];
  [self cancelPendingContentPresentWithReason:@"recycled"];
  [_screensEventObserver stopObserving];

  // A recycled TrueSheetView keeps its controller alive — dealloc, which nils it, is deferred
  // indefinitely by the recycle pool. If the controller is still presented or mid-transition, the
  // next React component to reuse this view inherits a zombie `isPresented` controller: its own
  // present() then defers behind a dismissal that isn't its own and is finally cancelled (the
  // boarding-sheet-never-opens bug). Tear the stale controller down for its situation and install
  // a fresh one so every reuse starts pristine.
  if (_controller.isPresented || _controller.isBeingPresented || _controller.isBeingDismissed ||
      _controller.presentingViewController != nil) {
    // Detach first: events from the old controller's own teardown must not fire on this view,
    // which is about to host a different sheet.
    _controller.delegate = nil;
    _controller.orphanedAfterUnmount = YES;
    [_controller attemptOrphanTeardown];

    // The snapshot remains owned by the detached controller's view hierarchy until teardown.
    _snapshotView = nil;

    _controller = [[TrueSheetViewController alloc] init];
    _controller.delegate = self;
  }

  _controller.activeDetentIndex = -1;

  _lastStateSize = CGSizeZero;
  _didInitiallyPresent = NO;
  _dismissedByNavigation = NO;
  _dismissedByPresenterTeardown = NO;
  _controller.dismissedWithPresenter = NO;
  _pendingNavigationRepresent = NO;
  _suspendedProp = NO;
  _suspendedByModule = NO;
  _suspensionActive = NO;
  _logicallyOpen = NO;
  _resumeEmitsPresentEvents = NO;
  _hideReasons = 0;
  _dismissingForSuspension = NO;
  _suppressPresentEvents = NO;
  _presentEventGeneration = 0;
  _nextPresentSuppressesEvents = NO;
  _pendingPresentSuppressesEvents = NO;
  _applySuspendAfterPresent = NO;
  _applyDismissAfterPresent = nil;
  _pendingSuspendedValue = NO;
  _hasPendingSuspendedChange = NO;

  // Transition-pending props belong to the previous incarnation. Left set, they would be replayed
  // onto the reused view's fresh controller (e.g. the old sheet's detents applied on the next
  // didPresent), so clear them alongside the controller reset above.
  _pendingDetents = nil;
  _pendingPropsUpdate = NO;
  _pendingSizeChange = NO;
  _pendingLayoutUpdate = NO;
  _isSheetUpdatePending = NO;
}

#pragma mark - Child Component Mounting

- (void)cleanupContainerView {
  if (_containerView == nil)
    return;

  _containerView.delegate = nil;
  [_touchHandler detachFromView:_containerView];
  [LayoutUtil unpinView:_containerView fromParentView:nil];
  [_containerView removeFromSuperview];

  _containerView = nil;
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index {
  if (![childComponentView isKindOfClass:[TrueSheetContainerView class]])
    return;

  if (_containerView != nil && _containerView != childComponentView) {
    RCTLogWarn(@"TrueSheet: Sheet can only have one container component.");
    [self cleanupContainerView];
  }

  if (_snapshotView) {
    [_snapshotView removeFromSuperview];
    _snapshotView = nil;
  }

  _containerView = (TrueSheetContainerView *)childComponentView;
  _containerView.delegate = self;

  [_touchHandler attachToView:_containerView];
  [_controller.view addSubview:_containerView];
  [LayoutUtil pinView:_containerView toParentView:_controller.view edges:UIRectEdgeAll];
  [_controller.view bringSubviewToFront:_containerView];
  _containerView.accessibilityViewIsModal = YES;
  _controller.accessibilityContentView = _containerView;
  [_controller setupAccessibilityContainer];

  CGFloat contentHeight = [_containerView contentHeight];
  if (contentHeight > 0) {
    _controller.contentHeight = @(contentHeight);
  }

  CGFloat headerHeight = [_containerView headerHeight];
  if (headerHeight > 0) {
    _controller.headerHeight = @(headerHeight);
  }

  CGFloat footerHeight = [_containerView footerHeight];
  if (footerHeight > 0) {
    _controller.footerHeight = @(footerHeight);
  }

  CGFloat peekContentHeight = [_containerView peekContentHeight];
  if (peekContentHeight > 0) {
    _controller.peekContentHeight = @(peekContentHeight);
  }

  if (_eventEmitter) {
    [TrueSheetLifecycleEvents emitMount:_eventEmitter];
  } else {
    _pendingMountEvent = YES;
  }

  // Content is now attached — replay any present that was parked waiting for it.
  [self flushPendingContentPresent];
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index {
  if (![childComponentView isKindOfClass:[TrueSheetContainerView class]])
    return;

  if (_containerView == nil || _containerView != childComponentView)
    return;

  if (_controller.isPresented) {
    UIView *superView = _containerView.superview;
    UIView *snapshot = [_containerView snapshotViewAfterScreenUpdates:NO];
    if (snapshot) {
      snapshot.frame = _containerView.frame;
      [superView insertSubview:snapshot belowSubview:_containerView];
      _snapshotView = snapshot;
    }
  }

  [self cleanupContainerView];
}

#pragma mark - TurboModule Methods

- (void)presentAtIndex:(NSInteger)index
              animated:(BOOL)animated
            completion:(nullable TrueSheetCompletionBlock)completion {
  if (_suspendedProp || _suspendedByModule) {
    if (!_controller.isPresented && !_logicallyOpen) {
      _resumeEmitsPresentEvents = YES;
    }
    _logicallyOpen = YES;
    _controller.activeDetentIndex = index;
    RCTLogWarn(@"TrueSheet: sheet is suspended; it will present at index %ld on resume.", (long)index);
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  // Gate 1: our own controller is mid-dismissal. Defer rather than false-resolving through
  // the already-presented guard below, since isPresented stays YES throughout an animated
  // dismissal. The transition coordinator also covers a cancelled interactive dismissal,
  // where viewControllerDidDismiss never fires.
  if (_controller.isBeingDismissed) {
    [self storePendingPresentAtIndex:index animated:animated completion:completion];

    __weak __typeof(self) weakSelf = self;
    id<UIViewControllerTransitionCoordinator> coordinator = _controller.transitionCoordinator;
    BOOL scheduled = NO;
    if (coordinator) {
      scheduled =
        [coordinator animateAlongsideTransition:nil
                                     completion:^(id<UIViewControllerTransitionCoordinatorContext> _Nonnull context) {
                                       [weakSelf flushPendingPresent];
                                     }];
    }
    // viewControllerDidDismiss also flushes; the fallback covers a coordinator that reports
    // no active transition (so its completion would never fire).
    if (!scheduled) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [weakSelf flushPendingPresent];
      });
    }
    return;
  }

  if (_controller.isBeingPresented || _controller.isPresented) {
    if (_controller.orphanedAfterUnmount) {
      // This recycled view is being reused for a new sheet while its previous controller is
      // still a presented zombie. Tear the zombie down and queue this present to replay clean.
      _controller.orphanedAfterUnmount = NO;
      [_controller.presentingViewController dismissViewControllerAnimated:NO completion:nil];
      [self storePendingPresentAtIndex:index animated:animated completion:completion];
      return;
    }

    RCTLogWarn(@"TrueSheet: sheet is already presented. Use resize() to change detent.");
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  // Reset navigation dismiss flag when presenting (handles view recycling edge cases)
  _dismissedByNavigation = NO;

  UIViewController *presentingViewController = [self findPresentingViewController];
  if (!presentingViewController) {
    NSError *error = [NSError errorWithDomain:@"com.lodev09.TrueSheet"
                                         code:1001
                                     userInfo:@{NSLocalizedDescriptionKey : @"No presenting view controller found"}];
    if (completion) {
      completion(NO, error);
    }
    return;
  }

  // Gate 2: the presenter still owns a view controller that is being dismissed — a sheet,
  // an RN Modal, or an RNS modal (class-agnostic). UIKit would refuse this present and
  // never call our completion, so defer and replay from the in-flight transition.
  UIViewController *occupyingController = presentingViewController.presentedViewController;
  if (occupyingController != nil) {
    [self storePendingPresentAtIndex:index animated:animated completion:completion];

    __weak __typeof(self) weakSelf = self;
    id<UIViewControllerTransitionCoordinator> coordinator = occupyingController.transitionCoordinator;
    BOOL scheduled = NO;
    if (coordinator) {
      scheduled =
        [coordinator animateAlongsideTransition:nil
                                     completion:^(id<UIViewControllerTransitionCoordinatorContext> _Nonnull context) {
                                       [weakSelf flushPendingPresent];
                                     }];
    }
    // Dismissal not yet started (or coordinator reports no active transition) — bounded retry.
    if (!scheduled) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [weakSelf flushPendingPresent];
      });
    }
    return;
  }

  // Gate 3: the container child has not mounted (or was torn down for an unmount/recycle).
  // Presenting now would show an empty sheet that vanishes once the teardown settles — the
  // classic symptom when a navigation represent or an initial present races content mounting.
  // Park it and replay from mountChildComponentView so the sheet only ever appears with content.
  if (_containerView == nil) {
    [self storePendingContentPresentAtIndex:index animated:animated completion:completion];
    return;
  }

  _dismissedByPresenterTeardown = NO;
  _controller.dismissedWithPresenter = NO;
  [_controller setupAnchorViewInView:presentingViewController.view];
  [_controller setupSheetSizing];
  [_controller setupSheetProps];
  [_controller setupSheetDetents];
  [_controller setupActiveDetentWithIndex:index];

  [self setupScrollable];

  [_screensEventObserver capturePresenterScreenFromView:self];
  [_screensEventObserver startObservingWithState:_state.get()->getData()];

  // Latch present-event suppression for exactly this presentation (a silent resume). Setting
  // it here — not at defer time — means every real present resets the latch, so a superseded
  // or consumer-cancelled resume can never silence a later present.
  _suppressPresentEvents = _nextPresentSuppressesEvents;
  _presentEventGeneration = _nextPresentSuppressesEvents ? _generation : 0;
  _nextPresentSuppressesEvents = NO;

  [presentingViewController presentViewController:_controller
                                         animated:animated
                                       completion:^{
                                         if (completion) {
                                           completion(YES, nil);
                                         }
                                       }];
}

- (void)resizeToIndex:(NSInteger)index completion:(nullable TrueSheetCompletionBlock)completion {
  if (_logicallyOpen && !_controller.isPresented) {
    _controller.activeDetentIndex = index;
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  if (!_controller.isPresented) {
    RCTLogWarn(@"TrueSheet: Cannot resize. Sheet is not presented.");
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  [_controller.sheetPresentationController animateChanges:^{
    [self->_controller resizeToDetentIndex:index];
  }];

  if (completion) {
    completion(YES, nil);
  }
}

- (TrueSheetViewController *)viewController {
  return _controller;
}

- (void)emitDismissedPosition {
  [TrueSheetStateEvents emitPositionChange:_eventEmitter
                                     index:-1
                                  position:_controller.screenHeight
                                    detent:0
                                  realtime:NO];
}

- (void)emitVisibilityChange:(BOOL)visible {
  [TrueSheetStateEvents emitVisibilityChange:_eventEmitter visible:visible];
}

- (BOOL)isLogicallyOpenWhileSuspended {
  return _logicallyOpen && !_controller.isPresented;
}

- (void)dismissAnimated:(BOOL)animated completion:(nullable TrueSheetCompletionBlock)completion {
  // A dismiss supersedes any parked present (e.g. present(); dismiss(); in one tick) so the
  // present settles deterministically instead of resurrecting the sheet on a later replay.
  [self cancelPendingPresentWithReason:@"dismissed"];
  [self cancelPendingContentPresentWithReason:@"dismissed"];

  if (_dismissedByPresenterTeardown && !_dismissingForSuspension && !_dismissedByNavigation) {
    // Explicit dismiss while the presenter is structurally tearing the sheet down: convert the
    // silent hide into a real close. Emit the will-dismiss that the teardown path suppressed;
    // viewControllerDidDismiss then completes the pair through its normal branch. Internal
    // dismisses (suspension, navigation) are excluded — they intentionally keep the sheet
    // logically open and must not un-mark the teardown.
    _dismissedByPresenterTeardown = NO;
    _controller.dismissedWithPresenter = NO;
    _logicallyOpen = NO;
    _resumeEmitsPresentEvents = NO;
    [TrueSheetLifecycleEvents emitWillDismiss:_eventEmitter];
  }

  if (_controller.isBeingPresented) {
    // Keep a non-nil block so viewControllerDidPresentAtIndex knows a dismiss is pending even
    // when the caller passed no completion. ARC copies the block on assignment to the ivar.
    _applyDismissAfterPresent = completion ?: ^(__unused BOOL success, __unused NSError *error) {
    };
    return;
  }

  if (_logicallyOpen && !_controller.isPresented) {
    [self cancelPendingPresentWithReason:@"dismissed"];
    _logicallyOpen = NO;
    _resumeEmitsPresentEvents = NO;
    _hideReasons &= ~TrueSheetHideReasonSuspension;
    _controller.activeDetentIndex = -1;
    [TrueSheetLifecycleEvents emitWillDismiss:_eventEmitter];
    [TrueSheetLifecycleEvents emitDidDismiss:_eventEmitter];
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  if (_controller.isBeingDismissed || !_controller.isPresented) {
    if (_controller.isBeingDismissed && _controller.dismissedWithPresenter && !_dismissedByPresenterTeardown) {
      // Explicit dismiss won the race against teardown classification (the async delegate
      // callback that would mark this teardown hasn't run yet). Clearing the native flag
      // lets the in-flight dismissal emit its normal event pair and prevents the silent
      // re-present.
      _controller.dismissedWithPresenter = NO;
      _logicallyOpen = NO;
      _resumeEmitsPresentEvents = NO;
    } else if (_controller.isBeingDismissed && _dismissingForSuspension) {
      // Explicit close while the suspension hide is still animating: the hide suppresses
      // its own lifecycle events, so emit the close pair here and drop the logical-open
      // state — the sheet must not return on resume.
      _logicallyOpen = NO;
      _resumeEmitsPresentEvents = NO;
      _controller.activeDetentIndex = -1;
      [TrueSheetLifecycleEvents emitWillDismiss:_eventEmitter];
      [TrueSheetLifecycleEvents emitDidDismiss:_eventEmitter];
    } else {
      RCTLogWarn(@"TrueSheet: sheet is already dismissed. No need to dismiss it again.");
    }

    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  // Dismiss from the presenting view controller to dismiss this sheet and all its children
  UIViewController *presenter = _controller.presentingViewController;
  [presenter dismissViewControllerAnimated:animated
                                completion:^{
                                  if (completion) {
                                    completion(YES, nil);
                                  }
                                }];
}

- (void)dismissStackAnimated:(BOOL)animated completion:(nullable TrueSheetCompletionBlock)completion {
  if (_controller.isBeingDismissed || !_controller.isPresented) {
    RCTLogWarn(@"TrueSheet: sheet is already dismissed. No need to dismiss it again.");

    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  // Only dismiss presented children, not this sheet itself
  if (!_controller.presentedViewController) {
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  // Calling dismiss on _controller dismisses all VCs presented on top of it, but keeps _controller presented
  [_controller dismissViewControllerAnimated:animated
                                  completion:^{
                                    if (completion) {
                                      completion(YES, nil);
                                    }
                                  }];
}

#pragma mark - TrueSheetContainerViewDelegate

/**
 * Debounced sheet update to handle rapid content/header size changes.
 */
- (void)setupSheetDetentsForSizeChange {
  if (_isSheetUpdatePending)
    return;

  if (_controller.isBeingPresented) {
    _pendingSizeChange = YES;
    return;
  }

  _isSheetUpdatePending = YES;

  dispatch_async(dispatch_get_main_queue(), ^{
    self->_isSheetUpdatePending = NO;
    if (!self->_containerView)
      return;

    // Refresh here (not just on peek size events) since the peek's offset
    // within the content can change without its own size changing.
    self->_controller.peekContentHeight = @([self->_containerView peekContentHeight]);
    [self->_controller setupSheetDetentsForSizeChange];
  });
}

- (void)containerViewContentDidChangeSize:(CGSize)newSize {
  _controller.contentHeight = @(newSize.height);
  [self setupSheetDetentsForSizeChange];
}

- (void)containerViewHeaderDidChangeSize:(CGSize)newSize {
  _controller.headerHeight = @(newSize.height);
  [self setupSheetDetentsForSizeChange];
}

- (void)containerViewFooterDidChangeSize:(CGSize)newSize {
  _controller.footerHeight = @(newSize.height);
  [self setupSheetDetentsForSizeChange];
  [_controller setupAccessibilityContainer];
}

- (void)containerViewPeekDidChangeSize:(CGSize)newSize {
  [self setupSheetDetentsForSizeChange];
}

// When the ScrollView changes (e.g. conditional remount), re-pin the new ScrollView.
- (void)containerViewScrollViewDidChange {
  [self setupScrollable];
}

#pragma mark - TrueSheetViewControllerDelegate

- (void)viewControllerWillPresentAtIndex:(NSInteger)index position:(CGFloat)position detent:(CGFloat)detent {
  _controller.activeDetentIndex = index;
  if (!(_suppressPresentEvents && _presentEventGeneration == _generation)) {
    [TrueSheetLifecycleEvents emitWillPresent:_eventEmitter index:index position:position detent:detent];
  }
}

- (void)viewControllerDidPresentAtIndex:(NSInteger)index position:(CGFloat)position detent:(CGFloat)detent {
  BOOL wasResume = _logicallyOpen;
  [_containerView setupKeyboardObserverWithViewController:_controller];
  if (!(_suppressPresentEvents && _presentEventGeneration == _generation)) {
    [TrueSheetLifecycleEvents emitDidPresent:_eventEmitter index:index position:position detent:detent];
  }

  if (_pendingPropsUpdate) {
    _pendingPropsUpdate = NO;
    [self applySheetPropsUpdate];
  }

  if (_pendingSizeChange) {
    _pendingSizeChange = NO;
    [self setupSheetDetentsForSizeChange];
  }

  [_controller verifyDimmingAfterPresentation];

  _suppressPresentEvents = NO;
  _presentEventGeneration = 0;
  _logicallyOpen = NO;
  if (wasResume) {
    [self emitVisibilityChange:YES];
  }

  if (_applySuspendAfterPresent) {
    _applySuspendAfterPresent = NO;
    [self reconcileSuspension];
  }

  if (_applyDismissAfterPresent) {
    TrueSheetCompletionBlock completion = _applyDismissAfterPresent;
    _applyDismissAfterPresent = nil;
    [self dismissAnimated:YES completion:completion];
  }
}

- (void)viewControllerDidDrag:(UIGestureRecognizerState)state
                        index:(NSInteger)index
                     position:(CGFloat)position
                       detent:(CGFloat)detent {
  switch (state) {
    case UIGestureRecognizerStateBegan:
      [TrueSheetDragEvents emitDragBegin:_eventEmitter index:index position:position detent:detent];
      break;
    case UIGestureRecognizerStateChanged:
      [TrueSheetDragEvents emitDragChange:_eventEmitter index:index position:position detent:detent];
      break;
    case UIGestureRecognizerStateEnded:
    case UIGestureRecognizerStateCancelled:
      [TrueSheetDragEvents emitDragEnd:_eventEmitter index:index position:position detent:detent];
      break;
    default:
      break;
  }
}

// The sheet is going down only because its UIKit presenter (a closing modal route, RN Modal, …)
// is being dismissed underneath it. The app never closed the sheet, so treat it like a
// suspension: keep it logically open, stay silent on lifecycle events, and resurface it once
// the teardown settles. Navigation- and suspension-driven dismissals have their own machinery.
- (void)markPresenterTeardownIfNeeded {
  if (_dismissedByPresenterTeardown || _dismissedByNavigation || _dismissingForSuspension) {
    return;
  }
  if (!_controller.dismissedWithPresenter) {
    return;
  }
  _dismissedByPresenterTeardown = YES;
  _logicallyOpen = YES;
  _resumeEmitsPresentEvents = NO;
  [self emitVisibilityChange:NO];
}

- (void)viewControllerWillDismiss {
  [self markPresenterTeardownIfNeeded];
  if (!_dismissedByNavigation && !_dismissingForSuspension && !_dismissedByPresenterTeardown) {
    [TrueSheetLifecycleEvents emitWillDismiss:_eventEmitter];
  }
}

- (void)viewControllerDidDismiss {
  [self markPresenterTeardownIfNeeded];
  [_containerView cleanupKeyboardObserver];

  if (_dismissedByPresenterTeardown) {
    _dismissedByPresenterTeardown = NO;
    _controller.dismissedWithPresenter = NO;
    _dismissingForSuspension = NO;

    // A parked present (an explicit present() queued behind this teardown) supersedes the
    // silent resume — replay it; otherwise re-present once the chain teardown fully settles.
    // presentAtIndex's gates absorb any transition still in flight.
    [self flushPendingPresent];
    __weak __typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{
      __strong __typeof(weakSelf) strongSelf = weakSelf;
      if (!strongSelf || strongSelf->_hasPendingPresent) {
        return;
      }
      if (strongSelf.window) {
        [strongSelf flushRepresentIfNeeded];
      } else {
        // Host view is detached (e.g. a full-screen modal removed the underlying screen's
        // view); didMoveToWindow flushes once UIKit restores it.
        strongSelf->_pendingNavigationRepresent = YES;
      }
    });
    return;
  }

  if (!_dismissedByNavigation && !_dismissingForSuspension) {
    _dismissedByNavigation = NO;
    _pendingNavigationRepresent = NO;

    _controller.activeDetentIndex = -1;
    [TrueSheetLifecycleEvents emitDidDismiss:_eventEmitter];
  }

  // Our own dismissal finished — drain any present that was parked behind it. Runs after
  // the navigation gate so a swap-and-reopen replays regardless of dismissal cause.
  [self flushPendingPresent];
  _dismissingForSuspension = NO;

  // Suspension lifted while its hide was still animating: resume now that the dismissal has
  // settled. Every other logically-open state carries a hide reason or an active suspension
  // source, so this only fires for that race.
  if (_logicallyOpen && !_suspendedProp && !_suspendedByModule && _hideReasons == 0) {
    [self flushRepresentIfNeeded];
  }
}

- (void)viewControllerDidChangeDetent:(NSInteger)index position:(CGFloat)position detent:(CGFloat)detent {
  if (_controller.activeDetentIndex != index) {
    _controller.activeDetentIndex = index;
  }
  if (!_dismissingForSuspension && !_suppressPresentEvents) {
    [TrueSheetStateEvents emitDetentChange:_eventEmitter index:index position:position detent:detent];
  }
}

- (void)viewControllerDidChangePosition:(CGFloat)index
                               position:(CGFloat)position
                                 detent:(CGFloat)detent
                               realtime:(BOOL)realtime {
  if (_dismissingForSuspension || _suppressPresentEvents) {
    return;
  }
  [TrueSheetStateEvents emitPositionChange:_eventEmitter index:index position:position detent:detent realtime:realtime];
}

- (void)viewControllerDidChangeSize:(CGSize)size {
  // TODO: Explicit screen height for now until synchronous layout is supported.
  CGSize effectiveSize = CGSizeMake(size.width, _controller.screenHeight);

  [self updateStateWithSize:effectiveSize];
}

- (void)viewControllerWillFocus {
  [TrueSheetFocusEvents emitWillFocus:_eventEmitter];
}

- (void)viewControllerDidFocus {
  [TrueSheetFocusEvents emitDidFocus:_eventEmitter];
}

- (void)viewControllerWillBlur {
  [TrueSheetFocusEvents emitWillBlur:_eventEmitter];
}

- (void)viewControllerDidBlur {
  [TrueSheetFocusEvents emitDidBlur:_eventEmitter];
}

#pragma mark - RNScreensEventObserverDelegate

- (void)presenterScreenWillDisappear {
  if (_controller.isPresented && !_controller.isBeingDismissed) {
    _hideReasons |= TrueSheetHideReasonNavigation;
    _dismissedByNavigation = YES;
    _logicallyOpen = YES;
    _resumeEmitsPresentEvents = YES;
    [self dismissAnimated:YES completion:nil];
  } else if (_logicallyOpen) {
    _hideReasons |= TrueSheetHideReasonNavigation;
  }
}

- (void)presenterScreenWillAppear {
  _hideReasons &= ~TrueSheetHideReasonNavigation;
  _dismissedByNavigation = NO;

  if (self.window) {
    [self flushRepresentIfNeeded];
  } else if (_logicallyOpen) {
    _pendingNavigationRepresent = YES;
  }
}

- (void)presenterInteractiveDismissDidBegin {
  [_controller beginInteractiveDismiss];
}

- (void)presenterInteractiveDismissDidUpdate:(CGFloat)progress {
  [_controller updateInteractiveDismiss:progress];
}

- (void)presenterInteractiveDismissDidEnd:(BOOL)cancelled duration:(NSTimeInterval)duration {
  if (cancelled) {
    [_controller cancelInteractiveDismissWithDuration:duration];
    return;
  }

  _dismissedByNavigation = YES;
  __weak __typeof(self) weakSelf = self;
  [_controller finishInteractiveDismissWithDuration:duration
                                         completion:^{
                                           [weakSelf dismissAnimated:NO completion:nil];
                                         }];
}

#pragma mark - Pending Present Queue

- (void)storePendingPresentAtIndex:(NSInteger)index
                          animated:(BOOL)animated
                        completion:(nullable TrueSheetCompletionBlock)completion {
  if (_hasPendingPresent && _pendingPresentCompletion) {
    _pendingPresentCompletion(NO, [self pendingPresentCancelledError:@"superseded"]);
  }

  _hasPendingPresent = YES;
  _pendingPresentIndex = index;
  _pendingPresentAnimated = animated;
  _pendingPresentCompletion = completion;
  _pendingPresentGeneration = _generation;
  _pendingPresentSuppressesEvents = _nextPresentSuppressesEvents;
  _nextPresentSuppressesEvents = NO;

  if (_isReplayingPendingPresent) {
    _pendingPresentAttempts = _currentReplayAttempts + 1;
    _pendingPresentDeferredAt = _currentReplayDeferredAt;
  } else {
    _pendingPresentAttempts = 0;
    _pendingPresentDeferredAt = CACurrentMediaTime();
  }
}

- (void)flushPendingPresent {
  if (!_hasPendingPresent) {
    return;
  }

  NSInteger index = _pendingPresentIndex;
  BOOL animated = _pendingPresentAnimated;
  TrueSheetCompletionBlock completion = _pendingPresentCompletion;
  NSUInteger generation = _pendingPresentGeneration;
  NSUInteger attempts = _pendingPresentAttempts;
  CFTimeInterval deferredAt = _pendingPresentDeferredAt;
  BOOL suppresses = _pendingPresentSuppressesEvents;

  _hasPendingPresent = NO;
  _pendingPresentCompletion = nil;

  if (generation != _generation) {
    if (completion) {
      completion(NO, [self pendingPresentCancelledError:@"recycled"]);
    }
    return;
  }

  if (attempts >= 10 || (CACurrentMediaTime() - deferredAt) > 2.0) {
    if (completion) {
      completion(NO, [self pendingPresentTimeoutError]);
    }
    return;
  }

  __weak __typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __strong __typeof(weakSelf) strongSelf = weakSelf;
    if (!strongSelf) {
      if (completion) {
        completion(NO, [NSError errorWithDomain:@"com.lodev09.TrueSheet"
                                           code:1003
                                       userInfo:@{NSLocalizedDescriptionKey : @"Presentation cancelled"}]);
      }
      return;
    }

    strongSelf->_isReplayingPendingPresent = YES;
    strongSelf->_currentReplayAttempts = attempts;
    strongSelf->_currentReplayDeferredAt = deferredAt;
    strongSelf->_nextPresentSuppressesEvents = suppresses;
    [strongSelf presentAtIndex:index animated:animated completion:completion];
    strongSelf->_isReplayingPendingPresent = NO;
  });
}

- (void)cancelPendingPresentWithReason:(NSString *)reason {
  if (!_hasPendingPresent) {
    return;
  }

  TrueSheetCompletionBlock completion = _pendingPresentCompletion;
  _hasPendingPresent = NO;
  _pendingPresentCompletion = nil;
  _suppressPresentEvents = NO;
  _presentEventGeneration = 0;

  if (completion) {
    completion(NO, [self pendingPresentCancelledError:reason]);
  }
}

- (void)storePendingContentPresentAtIndex:(NSInteger)index
                                 animated:(BOOL)animated
                               completion:(nullable TrueSheetCompletionBlock)completion {
  if (_hasPendingContentPresent && _pendingContentPresentCompletion) {
    _pendingContentPresentCompletion(NO, [self pendingPresentCancelledError:@"superseded"]);
  }

  _hasPendingContentPresent = YES;
  _pendingContentPresentIndex = index;
  _pendingContentPresentAnimated = animated;
  _pendingContentPresentCompletion = completion;
  _pendingContentPresentGeneration = _generation;
  _pendingContentPresentSuppressesEvents = _nextPresentSuppressesEvents;
  _nextPresentSuppressesEvents = NO;
}

- (void)flushPendingContentPresent {
  if (!_hasPendingContentPresent) {
    return;
  }

  NSInteger index = _pendingContentPresentIndex;
  BOOL animated = _pendingContentPresentAnimated;
  TrueSheetCompletionBlock completion = _pendingContentPresentCompletion;
  NSUInteger generation = _pendingContentPresentGeneration;
  BOOL suppresses = _pendingContentPresentSuppressesEvents;

  _hasPendingContentPresent = NO;
  _pendingContentPresentCompletion = nil;

  if (generation != _generation) {
    if (completion) {
      completion(NO, [self pendingPresentCancelledError:@"recycled"]);
    }
    return;
  }

  _nextPresentSuppressesEvents = suppresses;
  [self presentAtIndex:index animated:animated completion:completion];
}

- (void)cancelPendingContentPresentWithReason:(NSString *)reason {
  if (!_hasPendingContentPresent) {
    return;
  }

  TrueSheetCompletionBlock completion = _pendingContentPresentCompletion;
  _hasPendingContentPresent = NO;
  _pendingContentPresentCompletion = nil;

  if (completion) {
    completion(NO, [self pendingPresentCancelledError:reason]);
  }
}

- (NSError *)pendingPresentCancelledError:(NSString *)reason {
  NSString *message =
    reason.length > 0 ? [NSString stringWithFormat:@"Presentation cancelled: %@", reason] : @"Presentation cancelled";
  return [NSError errorWithDomain:@"com.lodev09.TrueSheet" code:1003 userInfo:@{NSLocalizedDescriptionKey : message}];
}

- (NSError *)pendingPresentTimeoutError {
  return [NSError
    errorWithDomain:@"com.lodev09.TrueSheet"
               code:1002
           userInfo:@{NSLocalizedDescriptionKey : @"Presentation timed out waiting for an in-flight transition"}];
}

#pragma mark - Private Helpers

- (void)applySuspended:(BOOL)suspended {
  _suspendedProp = suspended;
  [self reconcileSuspension];
}

- (BOOL)suspendFromModule {
  if (_suspendedByModule) {
    return YES;
  }

  // An ordinary close already in flight must not be captured — suspendAll would resurrect a
  // sheet the app just dismissed (isPresented stays YES throughout an animated dismissal).
  // Structural hides (navigation, presenter teardown, suspension) carry logical-open state,
  // a pending present, or the native teardown flag, and stay capturable.
  if (_controller.isBeingDismissed && !_logicallyOpen && !_hasPendingPresent && !_hasPendingContentPresent &&
      !_controller.dismissedWithPresenter) {
    return NO;
  }

  // Only capture sheets that are open in some form — presented, mid-presentation, parked
  // behind a transition, or already logically open. Everything else stays untouched so that
  // sheets presented after suspendAll (e.g. inside the modal that called it) work normally.
  BOOL open = _controller.isPresented || _controller.isBeingPresented || _hasPendingPresent ||
              _hasPendingContentPresent || _logicallyOpen;
  if (!open) {
    return NO;
  }

  _suspendedByModule = YES;
  [self reconcileSuspension];
  return YES;
}

- (void)resumeFromModule {
  if (!_suspendedByModule) {
    return;
  }
  _suspendedByModule = NO;
  [self reconcileSuspension];
}

// Applies the combined suspension state (prop OR module capture). The two sources are
// independent: the sheet stays suspended while either holds it, and only the transition
// between "any source active" and "none active" touches the native presentation.
- (void)reconcileSuspension {
  BOOL suspended = _suspendedProp || _suspendedByModule;
  if (suspended == _suspensionActive) {
    return;
  }
  _suspensionActive = suspended;

  if (suspended) {
    if (_hasPendingPresent) {
      _controller.activeDetentIndex = _pendingPresentIndex;
      [self cancelPendingPresentWithReason:@"suspended"];
      _logicallyOpen = YES;
      _resumeEmitsPresentEvents = _controller.isPresented ? NO : YES;
    }

    if (_controller.isBeingPresented) {
      // Not applied yet — viewControllerDidPresentAtIndex reconciles again once the
      // presentation lands (or skips if suspension was lifted in the meantime).
      _suspensionActive = NO;
      _applySuspendAfterPresent = YES;
      return;
    }

    if (_controller.isPresented) {
      _logicallyOpen = YES;
      _resumeEmitsPresentEvents = NO;
      _hideReasons |= TrueSheetHideReasonSuspension;
      _dismissingForSuspension = YES;
      [self emitVisibilityChange:NO];
      [self dismissAnimated:YES completion:nil];
      return;
    }

    _hideReasons |= TrueSheetHideReasonSuspension;
  } else {
    _hideReasons &= ~TrueSheetHideReasonSuspension;
    if (self.window) {
      [self flushRepresentIfNeeded];
    } else if (_logicallyOpen) {
      // Host view is detached (e.g. its screen sits under a closing full-screen modal);
      // didMoveToWindow flushes the resume once UIKit restores it.
      _pendingNavigationRepresent = YES;
    }
  }
}

- (void)flushRepresentIfNeeded {
  if (!(_logicallyOpen && _hideReasons == 0 && !_controller.isPresented && !_controller.isBeingPresented &&
        self.window != nil)) {
    return;
  }

  NSInteger index = _controller.activeDetentIndex;
  if (index < 0 && _initialDetentIndex >= 0) {
    index = _initialDetentIndex;
  }
  if (index < 0) {
    index = 0;
  }

  // Suppress present events for this resume unless it is a first-ever presentation (which must
  // emit normally). presentAtIndex: latches this at the real present, threading it through the
  // slot if it defers — so a superseded or cancelled resume never leaks the suppression.
  _nextPresentSuppressesEvents = !_resumeEmitsPresentEvents;

  __weak __typeof(self) weakSelf = self;
  [self presentAtIndex:index
              animated:YES
            completion:^(BOOL success, NSError *error) {
              if (!success && error.code == 1002) {
                // Timed out waiting for an in-flight transition; still logically open, retry.
                dispatch_async(dispatch_get_main_queue(), ^{
                  [weakSelf flushRepresentIfNeeded];
                });
              }
            }];
}

- (void)setupScrollable {
  if (!_containerView)
    return;

  _containerView.scrollableEnabled = _scrollable;
  _containerView.insetAdjustment = _insetAdjustment;
  _containerView.scrollableOptions = _scrollableOptions;
  [_containerView setupScrollable];
}

- (void)applySheetPropsUpdate {
  BOOL pendingLayoutUpdate = _pendingLayoutUpdate;
  _pendingLayoutUpdate = NO;

  if (_pendingDetents) {
    _controller.detents = _pendingDetents;
    _pendingDetents = nil;
  }

  UIView *presenterView = _controller.presentingViewController.view;
  [_controller setupAnchorViewInView:presenterView];

  [_controller setupSheetSizing];

  [_controller.sheetPresentationController animateChanges:^{
    [self->_controller setupSheetProps];
    if (pendingLayoutUpdate) {
      [self->_controller setupSheetDetentsForDetentsChange];
    } else {
      [self->_controller setupSheetDetents];
    }
    [self->_controller applyActiveDetent];
  }];
  [_controller setupDraggable];
}

- (UIViewController *)findPresentingViewController {
  // The host view can be windowless while a full-screen modal covers its screen (UIKit removes
  // the presenting view controller's view from the window) and briefly during that modal's
  // dismissal. The sheet's content lives in the controller, not under this view, so fall back
  // to the key window — the busy gates in presentAtIndex absorb any in-flight transition.
  UIWindow *window = self.window ?: RCTKeyWindow();
  UIViewController *rootViewController = window.rootViewController;
  if (!rootViewController)
    return nil;

  // Find topmost presented view controller that is not being dismissed
  while (rootViewController.presentedViewController) {
    UIViewController *presented = rootViewController.presentedViewController;

    // Skip any view controller that is being dismissed
    if (presented.isBeingDismissed) {
      break;
    }
    rootViewController = presented;
  }

  return rootViewController;
}

@end

Class<RCTComponentViewProtocol> TrueSheetViewCls(void) {
  return TrueSheetView.class;
}

#endif  // RCT_NEW_ARCH_ENABLED
