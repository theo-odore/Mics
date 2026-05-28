/**
 * @file reanimated.ts
 * @description React Native Reanimated v3 Animation Stubs for Mics Mobile.
 * Maps timing and easing tokens to mobile-friendly animators like useSharedValue and useAnimatedStyle.
 */

import { Duration, Ease } from "./tokens.ts";

/**
 * Stub of mobile shared value initialiser.
 */
export const useSharedValueMock = <T>(initialValue: T) => {
  return { value: initialValue };
};

/**
 * Stub of mobile spring animator using tokens.
 */
export const withSpringMock = (
  targetValue: number,
  config = Ease.spring
) => {
  return {
    type: "spring",
    target: targetValue,
    config,
  };
};

/**
 * Stub of mobile timing animator using tokens.
 */
export const withTimingMock = (
  targetValue: number,
  duration = Duration.base
) => {
  return {
    type: "timing",
    target: targetValue,
    duration,
  };
};

/**
 * Mobile equivalent card animation variant mapping.
 * Uses shared Reanimated 3 animated styles concept.
 */
export const useMobileCardStyle = (isHovered: { value: boolean }) => {
  return {
    transform: [
      { scale: isHovered.value ? withSpringMock(1.03, Ease.springGentle) : withSpringMock(1) }
    ],
    shadowOpacity: isHovered.value ? withTimingMock(0.5, Duration.fast) : withTimingMock(0, Duration.fast)
  };
};

/**
 * Mobile equivalent speed dial wobble animation mapping.
 * Uses shared Reanimated loop animation patterns.
 */
export const useMobileWobbleStyle = (isEditing: { value: boolean }) => {
  return {
    transform: [
      {
        rotate: isEditing.value 
          ? `${withSpringMock(0.5, Ease.springSnappy)}deg`
          : "0deg"
      }
    ]
  };
};
