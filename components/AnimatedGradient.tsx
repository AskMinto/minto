import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const COLOR_SETS = [
  ['#c8d5c0', '#b5c9a8', '#d4dcc8'],
  ['#b5c9a8', '#d4dcc8', '#c8d5c0'],
  ['#d4dcc8', '#c8d5c0', '#b5c9a8'],
];

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

interface AnimatedGradientProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export default function AnimatedGradient({ children, style }: AnimatedGradientProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 2,
        duration: 14000,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const color0 = progress.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [COLOR_SETS[0][0], COLOR_SETS[1][0], COLOR_SETS[2][0]],
  });

  const color1 = progress.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [COLOR_SETS[0][1], COLOR_SETS[1][1], COLOR_SETS[2][1]],
  });

  const color2 = progress.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [COLOR_SETS[0][2], COLOR_SETS[1][2], COLOR_SETS[2][2]],
  });

  return (
    <AnimatedLinearGradient
      colors={[color0, color1, color2] as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradient, style]}
    >
      {children}
    </AnimatedLinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
});
