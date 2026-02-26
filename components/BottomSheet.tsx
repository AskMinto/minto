import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { ChevronUp } from 'lucide-react-native';

interface BottomSheetProps {
  children: React.ReactNode;
}

export default function BottomSheet({ children }: BottomSheetProps) {
  const { height: screenHeight } = useWindowDimensions();

  const COLLAPSED = screenHeight * 0.92;   // almost off-screen, just a peek handle
  const EXPANDED = screenHeight * 0.10;    // 90 % visible

  const translateY = useRef(new Animated.Value(COLLAPSED)).current;
  const lastSnap = useRef(COLLAPSED);
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const snapTo = (dest: number) => {
    lastSnap.current = dest;
    Animated.spring(translateY, {
      toValue: dest,
      useNativeDriver: true,
      damping: 22,
      stiffness: 200,
    }).start();
    Animated.timing(overlayOpacity, {
      toValue: dest === EXPANDED ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderMove: (_, g) => {
        const next = lastSnap.current + g.dy;
        const clamped = Math.max(EXPANDED, Math.min(COLLAPSED, next));
        translateY.setValue(clamped);

        const progress = 1 - (clamped - EXPANDED) / (COLLAPSED - EXPANDED);
        overlayOpacity.setValue(Math.max(0, Math.min(1, progress)));
      },
      onPanResponderRelease: (_, g) => {
        const mid = (COLLAPSED + EXPANDED) / 2;
        const current = lastSnap.current + g.dy;
        if (g.vy > 0.5 || current > mid) {
          snapTo(COLLAPSED);
        } else {
          snapTo(EXPANDED);
        }
      },
    }),
  ).current;

  const toggle = () => {
    snapTo(lastSnap.current === COLLAPSED ? EXPANDED : COLLAPSED);
  };

  return (
    <>
      {/* Overlay */}
      <Animated.View
        pointerEvents={lastSnap.current === EXPANDED ? 'auto' : 'none'}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0,0,0,0.35)', opacity: overlayOpacity },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => snapTo(COLLAPSED)} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: screenHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.handleZone}>
          <Pressable onPress={toggle} style={styles.handleTouchable}>
            <View style={styles.handlePill} />
            <ChevronUp color="rgba(255,255,255,0.45)" size={18} style={{ marginTop: 4 }} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>{children}</View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#1C211E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleZone: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handleTouchable: {
    alignItems: 'center',
  },
  handlePill: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  content: {
    flex: 1,
  },
});
