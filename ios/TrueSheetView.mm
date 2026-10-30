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
#import "TrueSheetOverlayView.h"
#import "TrueSheetViewController.h"
#import "core/RNScreensEventObserver.h"
#import "events/TrueSheetDragEvents.h"
#import "events/TrueSheetFocusEvents.h"
#import "events/TrueSheetLifecycleEvents.h"
#import "events/TrueSheetStateEvents.h"
#import "utils/WindowUtil.h"

#import <react/renderer/components/TrueSheetSpec/EventEmitters.h>
#import <react/renderer/components/TrueSheetSpec/Props.h>
#import <react/renderer/components/TrueSheetSpec/RCTComponentViewHelpers.h>
#import <react/renderer/components/TrueSheetSpec/TrueSheetInsets.h>
#import <react/renderer/components/TrueSheetSpec/TrueSheetViewComponentDescriptor.h>
#import <react/renderer/components/TrueSheetSpec/TrueSheetViewShadowNode.h>
#import <react/renderer/components/TrueSheetSpec/TrueSheetViewState.h>

#import <React/RCTConversions.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <React/RCTLog.h>
#import <React/RCTSurfaceTouchHandler.h>
#import <React/RCTUtils.h>
#import <react/renderer/core/State.h>

using namespace facebook::react;

// A deferred present that is still blocked after this many replays, or this
// long after it was first deferred, fails with PRESENT_TIMEOUT.
static const NSUInteger TrueSheetPresentMaxAttempts = 10;
static const CFTimeInterval TrueSheetPresentTimeout = 2.0;

@interface TrueSheetView () <TrueSheetViewControllerDelegate,
  TrueSheetContainerViewDelegate,
  RNScreensEventObserverDelegate>

// The `suspended` prop or suspendAll holds the sheet
@property (nonatomic, readonly) BOOL isSuspended;

@end

// Runs the block on the main queue once the controller's transition ends, or
// on the next main-queue turn when it has none (or it won't take a completion).
static void TrueSheetRunAfterTransition(UIViewController *controller, dispatch_block_t block) {
  BOOL queued = [controller.transitionCoordinator
    animateAlongsideTransition:nil
                    completion:^(id<UIViewControllerTransitionCoordinatorContext> context) {
                      dispatch_async(dispatch_get_main_queue(), block);
                    }];

  if (!queued) {
    dispatch_async(dispatch_get_main_queue(), block);
  }
}

static NSError *TrueSheetError(TrueSheetErrorCode code, NSString *message) {
  return [NSError errorWithDomain:@"com.lodev09.TrueSheet" code:code userInfo:@{NSLocalizedDescriptionKey : message}];
}

// A present that replaces a deferred one settles both callers with its outcome.
static TrueSheetCompletionBlock TrueSheetJoinCompletions(
  TrueSheetCompletionBlock first, TrueSheetCompletionBlock second) {
  if (!first || !second) {
    return first ?: second;
  }

  return ^(BOOL success, NSError *_Nullable error) {
    first(success, error);
    second(success, error);
  };
}

@implementation TrueSheetView {
  TrueSheetContainerView *_containerView;
  TrueSheetViewController *_controller;
  RCTSurfaceTouchHandler *_touchHandler;
  TrueSheetViewShadowNode::ConcreteState::Shared _state;
  UIView *_snapshotView;
  CGSize _lastStateSize;
  NSInteger _initialDetentIndex;
  TrueSheetViewInsetAdjustment _insetAdjustment;
  ScrollableOptions *_scrollableOptions;
  NSInteger _scrollableHandle;
  // Fabric zeroes self.tag before prepareForRecycle, so unregister by this instead
  NSInteger _registeredTag;
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

  // Single-slot deferred present: parked behind an in-flight transition (replayed
  // once it ends) or until the container mounts (replayed from mountChildComponentView).
  BOOL _isPresentPending;
  BOOL _isPresentPendingContent;
  NSInteger _pendingPresentIndex;
  BOOL _pendingPresentAnimated;
  BOOL _pendingPresentSilent;
  NSUInteger _pendingPresentGeneration;
  NSUInteger _pendingPresentAttempts;
  CFTimeInterval _pendingPresentDeferredAt;
  TrueSheetCompletionBlock _pendingPresentCompletion;
  BOOL _isReplayingPendingPresent;
  NSUInteger _replayAttempts;
  CFTimeInterval _replayDeferredAt;

  // Open from JS's point of view while stepped aside natively. Resurfaces at
  // its remembered detent, silently unless JS never saw it open.
  BOOL _logicallyOpen;
  BOOL _resumeEmitsPresentEvents;
  BOOL _suppressPresentEvents;
  BOOL _visibilityHidden;
  BOOL _hiddenByNavigation;
  BOOL _suspendedProp;
  BOOL _suspendedByModule;
  BOOL _suspensionActive;
  BOOL _dismissingForSuspension;
  BOOL _applySuspendAfterPresent;
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
    _isSheetUpdatePending = NO;

    _screensEventObserver = [[RNScreensEventObserver alloc] init];
    _screensEventObserver.delegate = self;
  }
  return self;
}

// Also called from finalizeUpdates: a recycled host can deliver its mount event —
// which JS awaits before calling present() — before it re-attaches to a window.
- (void)registerViewIfNeeded {
  if (self.tag <= 0 || self.tag == _registeredTag)
    return;

  [TrueSheetModule unregisterView:self withTag:@(_registeredTag)];
  _registeredTag = self.tag;
  [TrueSheetModule registerView:self withTag:@(self.tag)];
}

- (void)didMoveToWindow {
  [super didMoveToWindow];

  if (!self.window)
    return;

  [self registerViewIfNeeded];

  if (_pendingNavigationRepresent && !_controller.isPresented) {
    _pendingNavigationRepresent = NO;
    [self representIfNeeded];
    return;
  }

  [self presentInitialIfNeeded];
}

// JS holds initialDetentIndex back one commit so effect-driven content (e.g. a
// navigation footer set via setOptions) commits together with it — by the time
// the prop lands the tree is final and the sheet presents at its final height.
// Called from didMoveToWindow (re-attach) and finalizeUpdates (the prop
// arriving after attach, which didMoveToWindow won't re-fire for).
- (void)presentInitialIfNeeded {
  if (_initialDetentIndex < 0 || _didInitiallyPresent)
    return;

  // Mounted suspended: open now, present once resumed
  if (self.isSuspended) {
    _didInitiallyPresent = YES;
    [self recordPresentAtIndex:_initialDetentIndex];
    return;
  }

  UIViewController *vc = [self findPresentingViewController];

  // Only present if the view controller is in the same window
  if (!vc || vc.view.window != self.window) {
    // Animate next time when sheet finally moves to the correct window
    _initialDetentAnimated = YES;
    return;
  }

  // A sheet still animating out of the presenter (e.g. our own controller,
  // recycled mid-dismissal) blocks presentation — retry once its transition ends.
  UIViewController *dismissing = vc.presentedViewController;
  if (dismissing && dismissing.isBeingDismissed) {
    _initialDetentAnimated = YES;

    __weak __typeof(self) weakSelf = self;
    TrueSheetRunAfterTransition(dismissing, ^{
      [weakSelf presentInitialIfNeeded];
    });
    return;
  }

  _didInitiallyPresent = YES;

  // Deferred a runloop turn so sibling mounts from the current transaction
  // (e.g. a footer committed alongside the prop) land before measuring.
  __weak __typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    __typeof(self) strongSelf = weakSelf;
    if (!strongSelf || strongSelf->_controller.isPresented || strongSelf->_controller.isBeingPresented)
      return;

    [strongSelf presentAtIndex:strongSelf->_initialDetentIndex
                      animated:strongSelf->_initialDetentAnimated
                    completion:^(BOOL success, NSError *_Nullable error) {
                      // Present can fail if the view detached during this turn —
                      // reset so the next attach/prop update retries.
                      if (!success) {
                        strongSelf->_didInitiallyPresent = NO;
                      }
                    }];
  });
}

- (void)dealloc {
  [_screensEventObserver stopObserving];
  _screensEventObserver = nil;

  [self cancelPendingPresentWithReason:@"deallocated"];

  // Scoped to this sheet's own presenter and non-animated — never the chain
  // root, which would also tear down unrelated modals and parent sheets.
  [self orphanController];

  _didInitiallyPresent = NO;
  _dismissedByNavigation = NO;
  _pendingNavigationRepresent = NO;

  _controller.delegate = nil;
  _controller = nil;

  [_snapshotView removeFromSuperview];
  _snapshotView = nil;
}

#pragma mark - RCTComponentViewProtocol

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<TrueSheetViewComponentDescriptor>();
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics {
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];

  // RN 0.88+ resets layout metrics on recycle, so the next mount force-applies
  // `hidden` from the display type and would reveal this host over the screen.
  self.hidden = YES;
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
  }

  if (_controller.isBeingPresented) {
    _pendingDetents = detents;
  } else {
    _controller.detents = detents;
  }

  // Background color
  _controller.backgroundColor = RCTUIColorFromSharedColor(newProps.backgroundColor);

  NSMutableArray<NSDictionary *> *detentBackgrounds = [NSMutableArray new];
  ContextContainer contextContainer;
  PropsParserContext parserContext{-1, contextContainer};
  for (const auto &entry : newProps.detentBackgrounds) {
    NSMutableDictionary *background = [NSMutableDictionary new];
    UIColor *color = RCTUIColorFromSharedColor(entry.color);
    if (color) {
      background[@"color"] = color;
    }
    if (!entry.blur.empty()) {
      auto blur = TrueSheetViewBackgroundBlur::None;
      fromRawValue(parserContext, RawValue(entry.blur), blur);
      background[@"blur"] = @(static_cast<int>(blur));
    }
    [detentBackgrounds addObject:background];
  }
  if (![_controller.detentBackgrounds isEqualToArray:detentBackgrounds]) {
    _controller.detentBackgrounds = detentBackgrounds;
  }

  // Blur tint
  _controller.backgroundBlur = newProps.backgroundBlur;

  // Corner radius
  _controller.cornerRadius = newProps.cornerRadius < 0 ? nil : @(newProps.cornerRadius);

  // Content height
  _controller.maxContentHeight = newProps.maxContentHeight != 0.0 ? @(newProps.maxContentHeight) : nil;

  // Content width
  _controller.maxContentWidth = newProps.maxContentWidth != 0.0 ? @(newProps.maxContentWidth) : nil;

  _controller.placement = newProps.placement;

  _controller.foldOptions = newProps.foldOptions;

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

  // Accessibility options - applied to the custom grabber
  _controller.accessibilityOptions = newProps.accessibilityOptions;

  _controller.presentation = newProps.presentation;
  _controller.dismissible = newProps.dismissible;
  _controller.draggable = newProps.draggable;
  _controller.dimmed = newProps.dimmed;
  _controller.dimOpacity = newProps.dimOpacity < 0 ? nil : @(newProps.dimOpacity);
  _controller.dimColor = RCTUIColorFromSharedColor(newProps.dimColor);

  if (newProps.dimmedDetentIndex >= 0) {
    _controller.dimmedDetentIndex = @(newProps.dimmedDetentIndex);
  }

  _initialDetentIndex = newProps.initialDetentIndex;
  _initialDetentAnimated = newProps.initialDetentAnimated;

  _scrollableHandle = newProps.scrollableHandle;

  const auto &scrollableOpts = newProps.scrollableOptions;
  ScrollableOptions *options = [[ScrollableOptions alloc] init];
  options.contentInsetAdjustment = scrollableOpts.contentInsetAdjustment;
  options.keyboardScrollOffset = scrollableOpts.keyboardScrollOffset;
  options.keyboardOffset = scrollableOpts.keyboardOffset;
  options.scrollingExpandsSheet = scrollableOpts.scrollingExpandsSheet;
  options.topScrollEdgeEffect = scrollableOpts.topScrollEdgeEffect;
  options.bottomScrollEdgeEffect = scrollableOpts.bottomScrollEdgeEffect;

  // nil while every option is at its default
  BOOL hasScrollableOptions = options.keyboardScrollOffset > 0 || options.keyboardOffset != 0 ||
                              !options.scrollingExpandsSheet ||
                              options.contentInsetAdjustment != TrueSheetViewContentInsetAdjustment::Automatic ||
                              options.topScrollEdgeEffect != TrueSheetViewTopScrollEdgeEffect::Hidden ||
                              options.bottomScrollEdgeEffect != TrueSheetViewBottomScrollEdgeEffect::Hidden;
  _scrollableOptions = hasScrollableOptions ? options : nil;

  _controller.scrollingExpandsSheet = options.scrollingExpandsSheet;

  _controller.absoluteHeader = newProps.headerOptions.position == TrueSheetViewPosition::Absolute;
  _controller.absoluteFooter = newProps.footerOptions.footerPosition == TrueSheetViewFooterPosition::Absolute;
  _controller.footerInsetAdjustment =
    options.footerInsetAdjustment && _controller.absoluteFooter && _scrollableHandle > 0;

  CGFloat footerKeyboardOffset = newProps.footerOptions.keyboardOffset;
  BOOL footerAvoidsKeyboard = newProps.footerOptions.avoidKeyboard;
  if (_controller.footerKeyboardOffset != footerKeyboardOffset ||
      _controller.footerAvoidsKeyboard != footerAvoidsKeyboard) {
    _controller.footerKeyboardOffset = footerKeyboardOffset;
    _controller.footerAvoidsKeyboard = footerAvoidsKeyboard;
    [_containerView updateFooterKeyboardOffset];
  }

  _insetAdjustment = newProps.insetAdjustment;
  _controller.insetAdjustment = _insetAdjustment;

  [self setupScrollable];
}

- (void)updateState:(const State::Shared &)state oldState:(const State::Shared &)oldState {
  _state = std::static_pointer_cast<TrueSheetViewShadowNode::ConcreteState const>(state);

  if (_controller && !_controller.isStackedBehindChild) {
    CGSize size = _controller.view.frame.size;
    if (size.width < 1 || size.height < 1) {
      // Pre-present the controller has no layout yet. Seed with screen
      // dimensions so content (e.g. a FlatList viewport) can lay out and
      // measure before the sheet presents (parity with Android).
      UIWindow *window = [WindowUtil keyWindow];
      size = window ? window.bounds.size : UIScreen.mainScreen.bounds.size;
    }
    [self viewControllerDidChangeSize:size];
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

  // RN 0.82+ processes immediate state updates in the same layout pass, so Yoga
  // resizes the container synchronously with the sheet (e.g. inside UIKit's
  // animation block during detent transitions).
  _state->updateState(std::move(stateData), facebook::react::EventQueue::UpdateMode::unstable_Immediate);
}

- (void)finalizeUpdates:(RNComponentViewUpdateMask)updateMask {
  [super finalizeUpdates:updateMask];

  // Before the mount event below, so a present() issued from onMount resolves the tag
  [self registerViewIfNeeded];

  // Emit pending mount event now that eventEmitter is available
  if (_pendingMountEvent && (updateMask & RNComponentViewUpdateMaskEventEmitter)) {
    _pendingMountEvent = NO;
    [TrueSheetLifecycleEvents emitMount:_eventEmitter];
  }

  if (!(updateMask & RNComponentViewUpdateMaskProps) || !_controller)
    return;

  BOOL suspended = std::static_pointer_cast<TrueSheetViewProps const>(_props)->suspended;
  if (suspended != _suspendedProp) {
    _suspendedProp = suspended;
    [self reconcileSuspension];
  }

  [self setupScrollable];

  if (_controller.isPresented) {
    _pendingPropsUpdate = YES;
    [self setupSheetDetentsForSizeChange];
  } else if (_controller.isBeingPresented) {
    _pendingPropsUpdate = YES;
  } else if (_initialDetentIndex >= 0) {
    _pendingLayoutUpdate = NO;
    if (self.window) {
      [self presentInitialIfNeeded];
    }
  }
}

- (void)prepareForRecycle {
  [super prepareForRecycle];

  [TrueSheetModule unregisterView:self withTag:@(_registeredTag)];
  _registeredTag = 0;

  [self cancelPendingPresentWithReason:@"recycled"];
  [_screensEventObserver stopObserving];

  // The pool defers dealloc indefinitely, so a controller still presented or
  // mid-transition would carry into the next mount. Detach it so its tail
  // (didBlur, didDismiss, position) can't reach that mount, let it tear itself
  // down, and start the next mount on a fresh controller.
  if ([self orphanController]) {
    // Owned by the orphan's view until it's torn down
    _snapshotView = nil;

    _controller = [[TrueSheetViewController alloc] init];
    _controller.delegate = self;
  }

  _controller.activeDetentIndex = -1;
  _controller.dismissedWithPresenter = NO;

  _lastStateSize = CGSizeZero;
  _didInitiallyPresent = NO;
  _dismissedByNavigation = NO;
  _dismissedByPresenterTeardown = NO;
  _pendingNavigationRepresent = NO;

  _logicallyOpen = NO;
  _resumeEmitsPresentEvents = NO;
  _suppressPresentEvents = NO;
  _visibilityHidden = NO;
  _hiddenByNavigation = NO;
  _suspendedProp = NO;
  _suspendedByModule = NO;
  _suspensionActive = NO;
  _dismissingForSuspension = NO;
  _applySuspendAfterPresent = NO;

  // Queued for the previous mount's presentation — the next mount would replay them
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
  [_controller.view bringSubviewToFront:_containerView];
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

  if ([_containerView footerHeight] > 0) {
    [self syncFooterMetrics];
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

  // Replayed next turn, once the rest of this mount transaction has landed
  if (_isPresentPendingContent) {
    [self flushPendingPresent];
  }
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
  [self presentAtIndex:index animated:animated silent:NO completion:completion];
}

// `silent` resurfaces a sheet JS already considers open, without present events.
- (void)presentAtIndex:(NSInteger)index
              animated:(BOOL)animated
                silent:(BOOL)silent
            completion:(nullable TrueSheetCompletionBlock)completion {
  if (self.isSuspended) {
    [self recordPresentAtIndex:index];
    RCTLogWarn(@"TrueSheet: sheet is suspended. It will present at index %ld when resumed.", (long)index);
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  // Already deferred: this request replaces it, and replays from the same trigger
  if (_isPresentPending) {
    [self parkPresentAtIndex:index
                    animated:animated
                      silent:silent
             awaitingContent:_isPresentPendingContent
                  completion:completion];
    return;
  }

  // isPresented stays YES while our own controller animates out — defer instead
  // of resolving through the guard below. Also covers a cancelled interactive
  // dismissal, which never reaches viewControllerDidDismiss.
  if (_controller.isBeingDismissed) {
    [self deferPresentAtIndex:index
                     animated:animated
                       silent:silent
            afterTransitionOf:_controller
                   completion:completion];
    return;
  }

  if (_controller.isBeingPresented || _controller.isPresented) {
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
    if (!self.window) {
      RCTLogWarn(
        @"TrueSheet: sheet is not in a window. Present it once its screen is visible, or use initialDetentIndex.");
    }

    if (completion) {
      completion(NO, TrueSheetError(TrueSheetErrorCodeNoPresenter, @"No presenting view controller found"));
    }
    return;
  }

  // A controller still animating out of the presenter (a sheet, an RN Modal, or a
  // navigation modal) makes UIKit queue this presentation — or drop it along with
  // its completion — and everything measured below goes stale. Present once that
  // transition ends.
  UIViewController *dismissing = presentingViewController.presentedViewController;
  if (dismissing) {
    [self deferPresentAtIndex:index animated:animated silent:silent afterTransitionOf:dismissing completion:completion];
    return;
  }

  // Never present without content: the sheet would show empty, then vanish once
  // the pending unmount settles.
  if (!_containerView) {
    [self parkPresentAtIndex:index animated:animated silent:silent awaitingContent:YES completion:completion];
    return;
  }

  _dismissedByPresenterTeardown = NO;
  _controller.dismissedWithPresenter = NO;
  _suppressPresentEvents = silent;

  [_controller setupAnchorViewInView:presentingViewController.view];
  [_controller setupSheetSizing];
  [_controller setupSheetProps];

  // Detect before measuring so a first-time detection doesn't shift sizes mid-animation.
  [self setupScrollable];

  // Measure synchronously so the presentation starts at the right height —
  // async size reports would otherwise land mid-animation and force a
  // detent retarget that snaps the presentation stack.
  if (_containerView) {
    _controller.contentHeight = @([_containerView contentHeight]);
    _controller.headerHeight = @([_containerView headerHeight]);
    [self syncFooterMetrics];
    _controller.peekContentHeight = @([_containerView peekContentHeight]);
  }
  _pendingSizeChange = NO;
  // Props queued while the previous presentation dismissed — applied above.
  _pendingPropsUpdate = NO;

  [self refreshFooterBottomInset];
  [_controller setupSheetDetents];
  [_controller setupActiveDetentWithIndex:index];

  [_screensEventObserver capturePresenterScreenFromView:self];
  [_screensEventObserver startObservingWithState:_state.get()->getData()];

  UIWindow *window = presentingViewController.view.window;
  [presentingViewController presentViewController:_controller
                                         animated:animated
                                       completion:^{
                                         [TrueSheetOverlayView bringOverlaysToFrontInWindow:window];
                                         if (completion) {
                                           completion(YES, nil);
                                         }
                                       }];

  // Presenting adds the sheet's transition view on top of the window once the
  // transition starts — re-front overlays alongside it so the first frame is
  // already ordered (and again on completion in case the transition was queued)
  id<UIViewControllerTransitionCoordinator> coordinator = _controller.transitionCoordinator;
  if (coordinator) {
    [coordinator
      animateAlongsideTransition:^(id<UIViewControllerTransitionCoordinatorContext> context) {
        [TrueSheetOverlayView bringOverlaysToFrontInWindow:window];
      }
                      completion:nil];
  } else {
    [TrueSheetOverlayView bringOverlaysToFrontInWindow:window];
  }
}

- (void)resizeToIndex:(NSInteger)index completion:(nullable TrueSheetCompletionBlock)completion {
  // Stepped aside: resurfaces at this detent
  if (_logicallyOpen && (!_controller.isPresented || _controller.isBeingDismissed)) {
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

/**
 * Drops a deferred present and resolves its caller. Returns whether one was pending.
 */
- (BOOL)cancelPendingPresent {
  if (!_isPresentPending) {
    return NO;
  }

  TrueSheetCompletionBlock pendingCompletion = [self takePendingPresent];
  if (pendingCompletion) {
    pendingCompletion(YES, nil);
  }
  return YES;
}

- (void)dismissAnimated:(BOOL)animated completion:(nullable TrueSheetCompletionBlock)completion {
  // Dismissing before a deferred present starts cancels it — nothing was presented.
  BOOL cancelledPresent = [self cancelPendingPresent];

  // Closed while its presenter's teardown carries it down: turn the silent hide
  // into a real close. Emit the will-dismiss it suppressed; didDismiss follows
  // from the in-flight dismissal.
  BOOL closedDuringTeardown = _dismissedByPresenterTeardown && !_dismissingForSuspension && !_dismissedByNavigation;
  if (closedDuringTeardown) {
    _dismissedByPresenterTeardown = NO;
    _controller.dismissedWithPresenter = NO;
    [self closeLogically];
    [TrueSheetLifecycleEvents emitWillDismiss:_eventEmitter];
  }

  // Still animating in (isPresented flips at viewDidAppear): dismiss once the presentation lands
  id<UIViewControllerTransitionCoordinator> presentCoordinator =
    _controller.isBeingPresented ? _controller.transitionCoordinator : nil;
  if (presentCoordinator) {
    __weak __typeof(self) weakSelf = self;
    [presentCoordinator animateAlongsideTransition:nil
                                        completion:^(id<UIViewControllerTransitionCoordinatorContext> context) {
                                          dispatch_async(dispatch_get_main_queue(), ^{
                                            [weakSelf dismissAnimated:animated completion:completion];
                                          });
                                        }];
    return;
  }

  // Stepped aside, so there's no presentation to take down — close it for real
  if (self.isHiddenWhileOpen) {
    [self closeLogically];
    [TrueSheetLifecycleEvents emitWillDismiss:_eventEmitter];
    [TrueSheetLifecycleEvents emitDidDismiss:_eventEmitter];
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  if (cancelledPresent) {
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  if (_controller.isBeingDismissed || !_controller.isPresented) {
    if (_controller.isBeingDismissed && _controller.dismissedWithPresenter && !_dismissedByPresenterTeardown) {
      // Beat the teardown's (deferred) classification: let the in-flight
      // dismissal report a normal close instead of resurfacing.
      _controller.dismissedWithPresenter = NO;
      [self closeLogically];
    } else if (_controller.isBeingDismissed && _dismissingForSuspension) {
      // The suspension hide is silent, so report the close here and keep the
      // sheet from resurfacing on resume.
      [self closeLogically];
      [TrueSheetLifecycleEvents emitWillDismiss:_eventEmitter];
      [TrueSheetLifecycleEvents emitDidDismiss:_eventEmitter];
    } else if (!closedDuringTeardown) {
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
  UIViewController *presented = _controller.presentedViewController;
  if (!presented) {
    if (completion) {
      completion(YES, nil);
    }
    return;
  }

  // A controller already animating out of this sheet (e.g. a navigation modal
  // closing) makes UIKit treat the dismiss below as dismissing this sheet
  // itself. Wait for that transition, then dismiss whatever is still on top.
  if (presented.isBeingDismissed) {
    __weak __typeof(self) weakSelf = self;
    TrueSheetRunAfterTransition(presented, ^{
      __typeof(self) strongSelf = weakSelf;
      // Dismissed while waiting: resolve without the already-dismissed warning
      if (strongSelf && strongSelf->_controller.isPresented && !strongSelf->_controller.isBeingDismissed) {
        [strongSelf dismissStackAnimated:animated completion:completion];
      } else if (completion) {
        completion(YES, nil);
      }
    });
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

#pragma mark - Deferred Present

// Returns NO when a replay ran out of retries — the caller was rejected with PRESENT_TIMEOUT.
- (BOOL)parkPresentAtIndex:(NSInteger)index
                  animated:(BOOL)animated
                    silent:(BOOL)silent
           awaitingContent:(BOOL)awaitingContent
                completion:(nullable TrueSheetCompletionBlock)completion {
  if (_isPresentPending) {
    _pendingPresentIndex = index;
    _pendingPresentAnimated = animated;
    _pendingPresentSilent = _pendingPresentSilent && silent;
    _pendingPresentCompletion = TrueSheetJoinCompletions(_pendingPresentCompletion, completion);
    return YES;
  }

  // Content mounting is a deterministic signal, so only transition waits are bounded
  NSUInteger attempts = 0;
  CFTimeInterval deferredAt = CACurrentMediaTime();
  if (_isReplayingPendingPresent && !awaitingContent) {
    attempts = _replayAttempts;
    deferredAt = _replayDeferredAt;

    if (attempts >= TrueSheetPresentMaxAttempts || CACurrentMediaTime() - deferredAt > TrueSheetPresentTimeout) {
      if (completion) {
        completion(NO, TrueSheetError(TrueSheetErrorCodePresentTimeout,
                         @"Presentation timed out waiting for an in-flight transition"));
      }
      return NO;
    }
  }

  _isPresentPending = YES;
  _isPresentPendingContent = awaitingContent;
  _pendingPresentIndex = index;
  _pendingPresentAnimated = animated;
  _pendingPresentSilent = silent;
  _pendingPresentCompletion = completion;
  _pendingPresentAttempts = attempts;
  _pendingPresentDeferredAt = deferredAt;
  _pendingPresentGeneration++;
  return YES;
}

- (void)deferPresentAtIndex:(NSInteger)index
                   animated:(BOOL)animated
                     silent:(BOOL)silent
          afterTransitionOf:(UIViewController *)controller
                 completion:(nullable TrueSheetCompletionBlock)completion {
  if (![self parkPresentAtIndex:index animated:animated silent:silent awaitingContent:NO completion:completion]) {
    return;
  }

  NSUInteger generation = _pendingPresentGeneration;
  __weak __typeof(self) weakSelf = self;
  TrueSheetRunAfterTransition(controller, ^{
    [weakSelf replayPendingPresentWithGeneration:generation];
  });
}

// Replays on the next turn — presenting from within UIKit's dismissal callbacks gets dropped.
- (void)flushPendingPresent {
  if (!_isPresentPending) {
    return;
  }

  NSUInteger generation = _pendingPresentGeneration;
  __weak __typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    [weakSelf replayPendingPresentWithGeneration:generation];
  });
}

// Several triggers can replay the same deferral; the first wins, and a stale one
// (from a cancelled or re-deferred present) finds a different generation.
- (void)replayPendingPresentWithGeneration:(NSUInteger)generation {
  if (!_isPresentPending || _pendingPresentGeneration != generation) {
    return;
  }

  NSInteger index = _pendingPresentIndex;
  BOOL animated = _pendingPresentAnimated;
  BOOL silent = _pendingPresentSilent;
  BOOL boundsRetries = !_isPresentPendingContent;
  NSUInteger attempts = _pendingPresentAttempts;
  CFTimeInterval deferredAt = _pendingPresentDeferredAt;
  TrueSheetCompletionBlock completion = [self takePendingPresent];

  _isReplayingPendingPresent = boundsRetries;
  _replayAttempts = attempts + 1;
  _replayDeferredAt = deferredAt;
  [self presentAtIndex:index animated:animated silent:silent completion:completion];
  _isReplayingPendingPresent = NO;
}

- (nullable TrueSheetCompletionBlock)takePendingPresent {
  TrueSheetCompletionBlock completion = _pendingPresentCompletion;
  _isPresentPending = NO;
  _isPresentPendingContent = NO;
  _pendingPresentCompletion = nil;
  return completion;
}

// The host is going away: reject rather than resolve, nothing will present.
- (void)cancelPendingPresentWithReason:(NSString *)reason {
  if (!_isPresentPending) {
    return;
  }

  TrueSheetCompletionBlock completion = [self takePendingPresent];
  if (completion) {
    completion(NO, TrueSheetError(TrueSheetErrorCodePresentCancelled,
                     [NSString stringWithFormat:@"Presentation cancelled: %@", reason]));
  }
}

#pragma mark - TrueSheetContainerViewDelegate

/**
 * Coalesces prop and size changes outside Fabric's mount transaction so
 * the footer's layout can mount inside UIKit's resize animation.
 */
- (void)setupSheetDetentsForSizeChange {
  // Keep the footer's absorbed inset in sync with the latest measured heights
  // even before presenting, so the sheet presents at its final size.
  [self refreshFooterBottomInset];

  // Retargeting the in-flight presentation makes UIKit snap the whole stack
  // (including the sheet behind) instead of animating. Defer to didPresent —
  // presentAtIndex measured synchronously, so this is usually a no-op.
  if (_controller.isBeingPresented) {
    _pendingSizeChange = YES;
    return;
  }

  // Not presented: presentAtIndex measures at present time.
  if (!_controller.isPresented || _isSheetUpdatePending)
    return;

  // Dismissing: the sheet is going away — touching detents perturbs the
  // presentation stack, visibly glitching the sheet behind. An interactive
  // dismiss can still cancel, so retry once the transition resolves.
  if (_controller.isBeingDismissed) {
    id<UIViewControllerTransitionCoordinator> coordinator = _controller.transitionCoordinator;
    if (coordinator) {
      _isSheetUpdatePending = YES;

      __weak __typeof(self) weakSelf = self;
      [coordinator animateAlongsideTransition:nil
                                   completion:^(id<UIViewControllerTransitionCoordinatorContext> context) {
                                     dispatch_async(dispatch_get_main_queue(), ^{
                                       __typeof(self) strongSelf = weakSelf;
                                       if (!strongSelf)
                                         return;

                                       strongSelf->_isSheetUpdatePending = NO;
                                       [strongSelf setupSheetDetentsForSizeChange];
                                     });
                                   }];
    }
    return;
  }

  _isSheetUpdatePending = YES;

  dispatch_async(dispatch_get_main_queue(), ^{
    self->_isSheetUpdatePending = NO;
    if (!self->_containerView || !self->_controller.isPresented || self->_controller.isBeingDismissed)
      return;

    // Refresh here (not just on peek size events) since the peek's offset
    // within the content can change without its own size changing.
    self->_controller.peekContentHeight = @([self->_containerView peekContentHeight]);
    [self refreshFooterBottomInset];

    // Size first: the props rebuild refreshes the heights itself, hiding the
    // change from the controller and skipping its post-resize settle.
    [self->_controller setupSheetDetentsForSizeChange];
    if (self->_pendingPropsUpdate) {
      self->_pendingPropsUpdate = NO;
      [self applySheetPropsUpdate];
    }
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
  [self syncFooterMetrics];
  [self setupSheetDetentsForSizeChange];
  [_controller refreshAccessibilityContainer];
}

- (void)containerViewDidMountTransaction {
  [_controller refreshAccessibilityContainerIfFooterChanged];
}

- (void)containerViewPeekDidChangeSize:(CGSize)newSize {
  [self setupSheetDetentsForSizeChange];
}

// When the ScrollView changes (e.g. conditional remount), re-detect the new ScrollView.
- (void)containerViewScrollViewDidChange {
  [self setupScrollable];
}

#pragma mark - TrueSheetViewControllerDelegate

- (void)viewControllerWillPresentAtIndex:(NSInteger)index position:(CGFloat)position detent:(CGFloat)detent {
  _controller.activeDetentIndex = index;
  // Before emitting, so an input focused in onWillPresent raises a tracked keyboard
  [_containerView setupKeyboardObserverWithViewController:_controller];
  if (!_suppressPresentEvents) {
    [TrueSheetLifecycleEvents emitWillPresent:_eventEmitter index:index position:position detent:detent];
  }
}

- (void)viewControllerDidPresentAtIndex:(NSInteger)index position:(CGFloat)position detent:(CGFloat)detent {
  if (!_suppressPresentEvents) {
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

  _suppressPresentEvents = NO;
  _logicallyOpen = NO;
  _resumeEmitsPresentEvents = NO;
  [self emitVisibilityChange:YES];

  // Suspended while presenting — step aside now that the presentation landed
  if (_applySuspendAfterPresent) {
    _applySuspendAfterPresent = NO;
    [self reconcileSuspension];
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

// The sheet is going down only because its presenter (a closing modal route, an
// RN Modal, …) is being dismissed beneath it. Nobody closed it: keep it open,
// stay silent, and resurface it once the teardown settles.
- (void)markPresenterTeardownIfNeeded {
  if (_dismissedByPresenterTeardown || _dismissedByNavigation || _dismissingForSuspension ||
      !_controller.dismissedWithPresenter) {
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

- (void)viewControllerDidAttemptDismiss {
  [TrueSheetLifecycleEvents emitDismissAttempt:_eventEmitter];
}

- (void)viewControllerDidDismiss {
  [self markPresenterTeardownIfNeeded];
  [_containerView cleanupKeyboardObserver];
  _suppressPresentEvents = NO;

  if (_dismissedByPresenterTeardown) {
    _dismissedByPresenterTeardown = NO;
    _controller.dismissedWithPresenter = NO;

    // An explicit present parked behind the teardown wins over the silent resurface
    if (_isPresentPending) {
      [self flushPendingPresent];
      return;
    }

    // Once the presenter's teardown fully settles — the present gates absorb
    // anything still in flight
    __weak __typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{
      [weakSelf representWhenAttached];
    });
    return;
  }

  if (!_dismissedByNavigation && !_dismissingForSuspension) {
    _dismissedByNavigation = NO;
    _pendingNavigationRepresent = NO;

    _controller.activeDetentIndex = -1;
    [TrueSheetLifecycleEvents emitDidDismiss:_eventEmitter];
  }

  _dismissingForSuspension = NO;

  // Replay a present parked behind this dismissal, whatever caused it
  [self flushPendingPresent];

  // Unsuspended (or its screen reappeared) while the hide was still animating
  if (_logicallyOpen) {
    __weak __typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{
      [weakSelf representIfNeeded];
    });
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
  // JS still sees the sheet at rest while it steps aside or resurfaces
  if (_dismissingForSuspension || _suppressPresentEvents) {
    return;
  }
  [TrueSheetStateEvents emitPositionChange:_eventEmitter index:index position:position detent:detent realtime:realtime];
}

- (void)viewControllerDidChangeSize:(CGSize)size {
  [self updateStateWithSize:size];
}

- (void)viewControllerSafeAreaInsetsDidChange {
  [self refreshFooterBottomInset];
  [_containerView updateFooterKeyboardOffset];
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
    _hiddenByNavigation = YES;
    _dismissedByNavigation = YES;
    _logicallyOpen = YES;
    _resumeEmitsPresentEvents = YES;
    [self dismissAnimated:YES completion:nil];
  } else if (_logicallyOpen) {
    _hiddenByNavigation = YES;
  }
}

- (void)presenterScreenWillAppear {
  _hiddenByNavigation = NO;

  // A navigation dismissal still animating out stays silent — didDismiss resurfaces it
  if (!_controller.isBeingDismissed) {
    _dismissedByNavigation = NO;
  }

  [self representWhenAttached];
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

#pragma mark - Suspension

- (BOOL)isSuspended {
  return _suspendedProp || _suspendedByModule;
}

- (BOOL)isHiddenWhileOpen {
  return _logicallyOpen && !_controller.isPresented && !_controller.isBeingPresented;
}

- (BOOL)isSteppedAside {
  return self.isHiddenWhileOpen && (self.isSuspended || !_hiddenByNavigation);
}

- (BOOL)suspendFromModule {
  if (_suspendedByModule) {
    return YES;
  }

  // isPresented stays YES while a close animates out — capturing it would
  // resurrect a sheet the app just dismissed. Structural hides (navigation,
  // presenter teardown) stay open and remain capturable.
  if (_controller.isBeingDismissed && !_logicallyOpen && !_isPresentPending && !_controller.dismissedWithPresenter) {
    return NO;
  }

  // Only sheets open in some form, so ones presented afterwards (e.g. by the flow
  // that suspended these) are unaffected
  if (!_controller.isPresented && !_controller.isBeingPresented && !_isPresentPending && !_logicallyOpen) {
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

// The prop and module sources are independent — only the edge between "either
// holds it" and "neither does" touches the native presentation.
- (void)reconcileSuspension {
  BOOL suspended = self.isSuspended;
  if (suspended == _suspensionActive) {
    return;
  }
  _suspensionActive = suspended;

  if (!suspended) {
    [self representWhenAttached];
    return;
  }

  // A deferred present becomes the detent to resurface at
  if (_isPresentPending) {
    [self recordPresentAtIndex:_pendingPresentIndex];
    [self cancelPendingPresent];
  }

  // Re-run once the presentation lands
  if (_controller.isBeingPresented) {
    _suspensionActive = NO;
    _applySuspendAfterPresent = YES;
    return;
  }

  // Not presented (or already closing for real): nothing to step aside from
  if (!_controller.isPresented || _controller.isBeingDismissed) {
    return;
  }

  _logicallyOpen = YES;
  _resumeEmitsPresentEvents = NO;
  _dismissingForSuspension = YES;
  [self emitVisibilityChange:NO];
  [_controller.presentingViewController dismissViewControllerAnimated:YES completion:nil];
}

// Opens the sheet without presenting it. Its resurface emits present events
// unless JS already saw it open.
- (void)recordPresentAtIndex:(NSInteger)index {
  if (!_logicallyOpen) {
    _logicallyOpen = YES;
    _resumeEmitsPresentEvents = !_controller.isPresented || _controller.isBeingDismissed;
  }
  _controller.activeDetentIndex = index;
}

- (void)closeLogically {
  _logicallyOpen = NO;
  _resumeEmitsPresentEvents = NO;
  _visibilityHidden = NO;
  _pendingNavigationRepresent = NO;
  _controller.activeDetentIndex = -1;
}

- (void)representIfNeeded {
  if (!_logicallyOpen || self.isSuspended || _hiddenByNavigation || _controller.isPresented ||
      _controller.isBeingPresented || !self.window) {
    return;
  }

  NSInteger index = _controller.activeDetentIndex >= 0 ? _controller.activeDetentIndex : MAX(_initialDetentIndex, 0);

  __weak __typeof(self) weakSelf = self;
  [self presentAtIndex:index
              animated:YES
                silent:!_resumeEmitsPresentEvents
            completion:^(BOOL success, NSError *_Nullable error) {
              // Still open after a timed-out wait — try again
              if (!success && error.code == TrueSheetErrorCodePresentTimeout) {
                dispatch_async(dispatch_get_main_queue(), ^{
                  [weakSelf representIfNeeded];
                });
              }
            }];
}

// A full-screen modal over the host's screen detaches it from the window;
// didMoveToWindow resurfaces the sheet once UIKit restores it.
- (void)representWhenAttached {
  if (self.window) {
    [self representIfNeeded];
  } else if (_logicallyOpen) {
    _pendingNavigationRepresent = YES;
  }
}

- (void)emitVisibilityChange:(BOOL)visible {
  if (_visibilityHidden == !visible) {
    return;
  }

  _visibilityHidden = !visible;
  [TrueSheetStateEvents emitVisibilityChange:_eventEmitter visible:visible];
}

#pragma mark - Private Helpers

// Hands a controller that is still presented or mid-transition to its own
// teardown, detached from this host. Returns whether it did.
- (BOOL)orphanController {
  TrueSheetViewController *controller = _controller;
  if (!controller.isPresented && !controller.isBeingPresented && !controller.isBeingDismissed &&
      !controller.presentingViewController) {
    return NO;
  }

  controller.delegate = nil;
  controller.accessibilityContentView = nil;
  controller.orphanedAfterUnmount = YES;
  [controller attemptOrphanTeardown];
  return YES;
}

- (void)setupScrollable {
  if (!_containerView)
    return;

  _containerView.scrollableOptions = _scrollableOptions;
  _containerView.scrollableHandle = _scrollableHandle;
  _containerView.safeAreaInsetAdjustment = (_scrollableOptions ? _scrollableOptions.safeAreaInsetAdjustment : YES) &&
                                           _insetAdjustment == TrueSheetViewInsetAdjustment::Automatic;
  _containerView.footerInsetAdjustment = _controller.footerInsetAdjustment;
  [self refreshFooterBottomInset];
  [_containerView setupScrollable];
}

// footerHeight and appliedFooterBottomInset must stay paired — detent math
// subtracts exactly the inset baked into the measured footer height (see
// autoDetentBottomInset/peekDetentBottomInset).
- (void)syncFooterMetrics {
  _controller.footerHeight = @([_containerView footerHeight]);
  _controller.appliedFooterBottomInset = [_containerView footerAppliedBottomInset];
}

// Recomputes the inset the footer absorbs and pushes it down. The inset
// depends on measured heights and detents (see maxNaturalDetentHeight), so
// this runs on size and detent changes — not just prop updates.
- (void)refreshFooterBottomInset {
  if (!_containerView)
    return;

  // appliedFooterBottomInset is NOT set here — it tracks what's actually
  // baked into the footer's measured height (reported with its layout), not
  // what was just pushed. Setting it at push time desyncs the pair and lets
  // a seeded inset read as natural content height (see maxNaturalDetentHeight).
  CGFloat inset = _controller.footerBottomInset;
  _containerView.footerBottomInset = inset;

  // Publish the inset so a footer set later (e.g. navigation setOptions) is
  // padded on its very first layout instead of resizing the sheet twice.
  if (_insetAdjustment == TrueSheetViewInsetAdjustment::Automatic) {
    TrueSheetInsets::setBottomSafeArea(inset);
  }
}

- (void)applySheetPropsUpdate {
  BOOL pendingLayoutUpdate = _pendingLayoutUpdate;
  _pendingLayoutUpdate = NO;

  if (_pendingDetents) {
    _controller.detents = _pendingDetents;
    _pendingDetents = nil;
    [self refreshFooterBottomInset];
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
  // Windowless while a full-screen modal covers the host's screen (UIKit removes
  // the presenter's view) and briefly while it dismisses. The sheet's content
  // lives in the controller, so present from the key window — the present gates
  // absorb any transition still in flight.
  UIWindow *window = self.window ?: [WindowUtil keyWindow];
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
