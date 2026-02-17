import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import Colors from '@/constants/colors';

interface EditorSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

const TRACK_WIDTH = 220;
const THUMB_SIZE = 24;

export default function EditorSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  formatValue,
}: EditorSliderProps) {
  const fraction = (value - min) / (max - min);
  const translateX = useSharedValue(fraction * TRACK_WIDTH);

  const updateValue = (x: number) => {
    const clamped = Math.max(0, Math.min(x, TRACK_WIDTH));
    const raw = min + (clamped / TRACK_WIDTH) * (max - min);
    const stepped = Math.round(raw / step) * step;
    const finalVal = Math.max(min, Math.min(max, stepped));
    onChange(finalVal);
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      const newX = Math.max(0, Math.min(e.x, TRACK_WIDTH));
      translateX.value = newX;
      runOnJS(updateValue)(newX);
    })
    .hitSlop({ top: 10, bottom: 10, left: 10, right: 10 });

  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      const newX = Math.max(0, Math.min(e.x, TRACK_WIDTH));
      translateX.value = newX;
      runOnJS(updateValue)(newX);
    });

  const composed = Gesture.Race(panGesture, tapGesture);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value - THUMB_SIZE / 2 }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value,
  }));

  const display = formatValue ? formatValue(value) : value.toFixed(2);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.valueText}>{display}</Text>
      </View>
      <GestureDetector gesture={composed}>
        <View style={styles.trackContainer}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </View>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.tint,
  },
  trackContainer: {
    width: TRACK_WIDTH + THUMB_SIZE,
    height: THUMB_SIZE + 8,
    justifyContent: 'center',
    paddingHorizontal: THUMB_SIZE / 2,
  },
  track: {
    width: TRACK_WIDTH,
    height: 4,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    backgroundColor: Colors.dark.tint,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    left: THUMB_SIZE / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Colors.dark.tint,
    borderWidth: 3,
    borderColor: Colors.dark.background,
  },
});
