import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';

export default function AnimatedGradient() {
  const { width, height } = useWindowDimensions();

  const blob1Opacity = useRef(new Animated.Value(0.10)).current;
  const blob1TranslateY = useRef(new Animated.Value(0)).current;
  const blob2Opacity = useRef(new Animated.Value(0.16)).current;
  const blob2TranslateY = useRef(new Animated.Value(0)).current;
  const blob3Opacity = useRef(new Animated.Value(0.08)).current;
  const blob3TranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (
      node: Animated.Value,
      from: number,
      to: number,
      duration: number,
    ) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(node, { toValue: to, duration, useNativeDriver: true }),
          Animated.timing(node, { toValue: from, duration, useNativeDriver: true }),
        ]),
      );

    Animated.stagger(800, [
      Animated.parallel([
        loop(blob1Opacity, 0.10, 0.22, 4000),
        loop(blob1TranslateY, 0, -18, 6000),
      ]),
      Animated.parallel([
        loop(blob2Opacity, 0.16, 0.24, 5000),
        loop(blob2TranslateY, 0, 14, 7000),
      ]),
      Animated.parallel([
        loop(blob3Opacity, 0.08, 0.18, 4500),
        loop(blob3TranslateY, 0, -12, 8000),
      ]),
    ]).start();
  }, []);

  return (
    <>
      {/* Base cream fill */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#f5f0e8' }]} />

      {/* Blob 1 – large, center-bottom */}
      <Animated.View
        style={[
          styles.blob,
          {
            width: width * 1.1,
            height: width * 1.1,
            borderRadius: width * 0.55,
            bottom: -width * 0.25,
            left: -width * 0.05,
            opacity: blob1Opacity,
            transform: [{ translateY: blob1TranslateY }],
          },
        ]}
      />

      {/* Blob 2 – medium, bottom-right */}
      <Animated.View
        style={[
          styles.blob,
          {
            width: width * 0.8,
            height: width * 0.8,
            borderRadius: width * 0.4,
            bottom: -width * 0.1,
            right: -width * 0.15,
            opacity: blob2Opacity,
            transform: [{ translateY: blob2TranslateY }],
          },
        ]}
      />

      {/* Blob 3 – small, bottom-left */}
      <Animated.View
        style={[
          styles.blob,
          {
            width: width * 0.6,
            height: width * 0.6,
            borderRadius: width * 0.3,
            bottom: height * 0.05,
            left: -width * 0.1,
            opacity: blob3Opacity,
            transform: [{ translateY: blob3TranslateY }],
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: 'absolute',
    backgroundColor: '#a2b082',
  },
});
