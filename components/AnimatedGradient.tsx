import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Center hue made more distinct/darker to make the glass effect pop
const COLOR_SETS = [
  ['#f0f4ef', '#9ebf9c', '#eaf0e8'],
  ['#eaf0e8', '#8cac8a', '#f0f4ef'],
  ['#f0f4ef', '#7b9f7a', '#eaf0e8'],
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
        duration: 12000,
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
      start={{ x: 0.1, y: 0.1 }}
      end={{ x: 0.9, y: 0.9 }}
      locations={[0, 0.45, 1]}
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
