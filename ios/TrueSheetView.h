//
//  Created by Jovanni Lo (@lodev09)
//  Copyright (c) 2024-present. All rights reserved.
//
//  This source code is licensed under the MIT license found in the
//  LICENSE file in the root directory of this source tree.
//

#pragma once

#ifdef RCT_NEW_ARCH_ENABLED

#import <React/RCTBridgeModule.h>
#import <React/RCTViewComponentView.h>
#import <UIKit/UIKit.h>

@class TrueSheetViewController;

NS_ASSUME_NONNULL_BEGIN

// Completion block for async operations
typedef void (^TrueSheetCompletionBlock)(BOOL success, NSError *_Nullable error);

typedef NS_ENUM(NSInteger, TrueSheetErrorCode) {
  TrueSheetErrorCodeNoPresenter = 1001,
  // A deferred present still blocked after its bounded retries
  TrueSheetErrorCodePresentTimeout = 1002,
  // A deferred present dropped because its host was recycled or deallocated
  TrueSheetErrorCodePresentCancelled = 1003,
};

@interface TrueSheetView : RCTViewComponentView

@property (nonatomic, readonly) TrueSheetViewController *viewController;

/**
 * YES while the sheet is open from JS's point of view but stepped aside
 * natively by suspension or a presenter teardown. A sheet hidden only by
 * navigation doesn't count — it comes back with its screen.
 */
@property (nonatomic, readonly) BOOL isSteppedAside;

// TurboModule methods
- (void)presentAtIndex:(NSInteger)index
              animated:(BOOL)animated
            completion:(nullable TrueSheetCompletionBlock)completion;

- (void)dismissAnimated:(BOOL)animated completion:(nullable TrueSheetCompletionBlock)completion;

- (void)emitDismissedPosition;

- (BOOL)cancelPendingPresent;

- (void)resizeToIndex:(NSInteger)index completion:(nullable TrueSheetCompletionBlock)completion;

- (void)dismissStackAnimated:(BOOL)animated completion:(nullable TrueSheetCompletionBlock)completion;

/**
 * Imperative suspension (suspendAll/unsuspendAll), independent of the
 * `suspended` prop — the sheet stays suspended while either holds it.
 * Only captures an open sheet; returns whether it did.
 */
- (BOOL)suspendFromModule;
- (void)resumeFromModule;

@end

NS_ASSUME_NONNULL_END

#endif  // RCT_NEW_ARCH_ENABLED
