//
//  TrueSheetModule.h
//  TrueSheet
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

NS_ASSUME_NONNULL_BEGIN

@class TrueSheetView;

/**
 * TurboModule for TrueSheet imperative API
 * Provides promise-based async operations using view references
 */
@interface TrueSheetModule : NSObject <RCTBridgeModule>

/**
 * Register a sheet component view with its React tag
 * Called automatically by TrueSheetView during its mount transaction.
 * The registry holds views weakly, so deallocated hosts drop out on their own.
 */
+ (void)registerView:(TrueSheetView *)view withTag:(NSNumber *)tag;

/**
 * Unregister a recycled host, which stays alive in the pool and would
 * otherwise keep resolving its previous tag. No-op if the tag maps elsewhere.
 */
+ (void)unregisterView:(TrueSheetView *)view withTag:(NSNumber *)tag;

@end

NS_ASSUME_NONNULL_END

#endif  // RCT_NEW_ARCH_ENABLED
