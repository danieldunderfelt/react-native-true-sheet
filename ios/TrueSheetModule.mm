//
//  TrueSheetModule.mm
//  TrueSheet
//
//  Created by Jovanni Lo (@lodev09)
//  Copyright (c) 2024-present. All rights reserved.
//
//  This source code is licensed under the MIT license found in the
//  LICENSE file in the root directory of this source tree.
//

#ifdef RCT_NEW_ARCH_ENABLED

#import "TrueSheetModule.h"
#import <React/RCTUtils.h>
#import "TrueSheetView.h"
#import "TrueSheetViewController.h"

#import <TrueSheetSpec/TrueSheetSpec.h>

// Static registry to store view references by tag
static NSMutableDictionary<NSNumber *, TrueSheetView *> *viewRegistry;

@interface TrueSheetModule () <NativeTrueSheetModuleSpec>
@end

@implementation TrueSheetModule

RCT_EXPORT_MODULE(TrueSheetModule)

+ (void)initialize {
  if (self == [TrueSheetModule class]) {
    viewRegistry = [NSMutableDictionary new];
  }
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
  (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeTrueSheetModuleSpecJSI>(params);
}

#pragma mark - TurboModule Methods

- (void)presentByRef:(double)viewTag
               index:(double)index
            animated:(BOOL)animated
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject {
  RCTExecuteOnMainQueue(^{
    TrueSheetView *trueSheetView = [TrueSheetModule getTrueSheetViewByTag:@((NSInteger)viewTag)];

    if (!trueSheetView) {
      reject(@"SHEET_NOT_FOUND", [NSString stringWithFormat:@"No sheet found with tag %d", (int)viewTag], nil);
      return;
    }

    [trueSheetView presentAtIndex:(NSInteger)index
                         animated:animated
                       completion:^(BOOL success, NSError *_Nullable error) {
                         if (success) {
                           resolve(nil);
                         } else {
                           NSString *code = @"PRESENT_FAILED";
                           if (error.code == 1002) {
                             code = @"PRESENT_TIMEOUT";
                           } else if (error.code == 1003) {
                             code = @"PRESENT_CANCELLED";
                           }
                           reject(code, error.localizedDescription ?: @"Failed to present sheet", error);
                         }
                       }];
  });
}

- (void)dismissByRef:(double)viewTag
            animated:(BOOL)animated
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject {
  RCTExecuteOnMainQueue(^{
    TrueSheetView *trueSheetView = [TrueSheetModule getTrueSheetViewByTag:@((NSInteger)viewTag)];

    if (!trueSheetView) {
      // The view was already recycled/unregistered (e.g. its route was torn down). Dismissing a
      // sheet that no longer exists is a no-op success, not an error — resolving here avoids a
      // flood of uncaught SHEET_NOT_FOUND rejections during navigation teardown.
      resolve(nil);
      return;
    }

    [trueSheetView dismissAnimated:animated
                        completion:^(BOOL success, NSError *_Nullable error) {
                          if (success) {
                            resolve(nil);
                          } else {
                            reject(@"DISMISS_FAILED", error.localizedDescription ?: @"Failed to dismiss sheet", error);
                          }
                        }];
  });
}

- (void)dismissStackByRef:(double)viewTag
                 animated:(BOOL)animated
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject {
  RCTExecuteOnMainQueue(^{
    TrueSheetView *trueSheetView = [TrueSheetModule getTrueSheetViewByTag:@((NSInteger)viewTag)];

    if (!trueSheetView) {
      // No sheet (already gone) means nothing is stacked on top of it — no-op success.
      resolve(nil);
      return;
    }

    [trueSheetView
      dismissStackAnimated:animated
                completion:^(BOOL success, NSError *_Nullable error) {
                  if (success) {
                    resolve(nil);
                  } else {
                    reject(@"DISMISS_FAILED", error.localizedDescription ?: @"Failed to dismiss stack", error);
                  }
                }];
  });
}

- (void)resizeByRef:(double)viewTag
              index:(double)index
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject {
  RCTExecuteOnMainQueue(^{
    TrueSheetView *trueSheetView = [TrueSheetModule getTrueSheetViewByTag:@((NSInteger)viewTag)];

    if (!trueSheetView) {
      reject(@"SHEET_NOT_FOUND", [NSString stringWithFormat:@"No sheet found with tag %d", (int)viewTag], nil);
      return;
    }

    [trueSheetView resizeToIndex:(NSInteger)index
                      completion:^(BOOL success, NSError *_Nullable error) {
                        if (success) {
                          resolve(nil);
                        } else {
                          reject(@"RESIZE_FAILED", error.localizedDescription ?: @"Failed to resize sheet", error);
                        }
                      }];
  });
}

- (void)handleBackPress:(double)viewTag resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  // No-op on iOS — no hardware back button
  resolve(nil);
}

- (void)suspendAll:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  RCTExecuteOnMainQueue(^{
    @synchronized(viewRegistry) {
      // Captures only sheets that are currently open; each captured view flags itself so
      // unsuspendAll can resume exactly that set. Sheets presented afterwards are unaffected.
      for (TrueSheetView *view in viewRegistry.allValues) {
        [view suspendFromModule];
      }
    }
    resolve(nil);
  });
}

- (void)unsuspendAll:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  RCTExecuteOnMainQueue(^{
    @synchronized(viewRegistry) {
      for (TrueSheetView *view in viewRegistry.allValues) {
        [view resumeFromModule];
      }
    }
    resolve(nil);
  });
}

- (void)dismissAll:(BOOL)animated resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  RCTExecuteOnMainQueue(^{
    @synchronized(viewRegistry) {
      // No parked present may resurrect a sheet mid-dismissAll.
      for (TrueSheetView *view in viewRegistry.allValues) {
        [view cancelPendingPresentWithReason:@"dismissAll"];
      }

      // Close logically-open suspended sheets — they hold no native presentation, so the
      // root-sheet dismissal below would otherwise leave them to resurface on resume.
      for (TrueSheetView *view in viewRegistry.allValues) {
        if ([view isLogicallyOpenWhileSuspended]) {
          [view dismissAnimated:NO completion:nil];
        }
      }

      // Find the root presented sheet (one without a parent TrueSheet)
      TrueSheetView *rootSheet = nil;

      for (TrueSheetView *view in viewRegistry.allValues) {
        if (!view.viewController.isPresented) {
          continue;
        }

        UIViewController *presenter = view.viewController.presentingViewController;
        BOOL hasParentSheet = [presenter isKindOfClass:[TrueSheetViewController class]];

        if (!hasParentSheet) {
          rootSheet = view;
          break;
        }
      }

      if (!rootSheet) {
        resolve(nil);
        return;
      }

      [rootSheet emitDismissedPosition];
      [rootSheet dismissAnimated:animated
                      completion:^(BOOL success, NSError *_Nullable error) {
                        if (success) {
                          resolve(nil);
                        } else {
                          reject(@"DISMISS_FAILED", error.localizedDescription ?: @"Failed to dismiss sheets", error);
                        }
                      }];
    }
  });
}

#pragma mark - Helper Methods

+ (nullable TrueSheetView *)getTrueSheetViewByTag:(NSNumber *)reactTag {
  if (!reactTag) {
    return nil;
  }

  @synchronized(viewRegistry) {
    return viewRegistry[reactTag];
  }
}

+ (void)registerView:(TrueSheetView *)view withTag:(NSNumber *)tag {
  if (!tag || !view) {
    return;
  }

  @synchronized(viewRegistry) {
    // Drop any stale keys still pointing at this reused view (Fabric recycles the instance across
    // tags). Without this a previous incarnation's tag would keep resolving to the new sheet.
    NSArray<NSNumber *> *staleTags = [viewRegistry allKeysForObject:view];
    for (NSNumber *staleTag in staleTags) {
      [viewRegistry removeObjectForKey:staleTag];
    }
    viewRegistry[tag] = view;
  }
}

+ (void)unregisterViewWithTag:(NSNumber *)tag {
  if (!tag) {
    return;
  }

  @synchronized(viewRegistry) {
    [viewRegistry removeObjectForKey:tag];
  }
}

@end

#endif  // RCT_NEW_ARCH_ENABLED
