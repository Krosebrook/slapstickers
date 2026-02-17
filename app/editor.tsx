import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { useSessions } from '@/lib/session-context';
import ActionButton from '@/components/ActionButton';
import EditorSlider from '@/components/EditorSlider';
import { apiRequest } from '@/lib/query-client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - 40;

type BlendMode = 'normal' | 'multiply' | 'overlay' | 'screen';

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'screen', label: 'Screen' },
];

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; videoUri?: string; faceFree?: string }>();
  const { getSession, updateSession } = useSessions();
  const session = getSession(params.id || '');

  const [opacity, setOpacity] = useState(session?.placement.opacity ?? 0.85);
  const [blendMode, setBlendMode] = useState<BlendMode>(session?.placement.blendMode ?? 'multiply');
  const [warpIntensity, setWarpIntensity] = useState(session?.placement.warpIntensity ?? 0.2);
  const [scale, setScale] = useState(session?.placement.scale ?? 1.0);
  const [rotation, setRotation] = useState(session?.placement.rotationDeg ?? 0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotes, setAiNotes] = useState('');
  const [showControls, setShowControls] = useState(true);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const animScale = useSharedValue(scale);
  const savedScale = useSharedValue(scale);
  const animRotation = useSharedValue(rotation);
  const savedRotation = useSharedValue(rotation);

  useEffect(() => {
    if (session) {
      updateSession(session.id, { status: 'editing' });
    }
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = animScale.value;
    })
    .onUpdate((e) => {
      animScale.value = Math.max(0.3, Math.min(5, savedScale.value * e.scale));
    })
    .onEnd(() => {
      setScale(animScale.value);
    });

  const rotateGesture = Gesture.Rotation()
    .onStart(() => {
      savedRotation.value = animRotation.value;
    })
    .onUpdate((e) => {
      animRotation.value = savedRotation.value + (e.rotation * 180) / Math.PI;
    })
    .onEnd(() => {
      setRotation(animRotation.value);
    });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture, rotateGesture);

  const tattooStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: animScale.value },
      { rotate: `${animRotation.value}deg` },
    ],
    opacity: opacity,
  }));

  const handleAiSuggest = async () => {
    if (!session) return;
    setAiLoading(true);
    try {
      const res = await apiRequest('POST', '/api/v1/ai/placement-suggest', {
        frames: [],
        designDescription: session.designName,
        bodyPart: 'general',
      });
      const data = await res.json();
      if (data.placementNotes) {
        setAiNotes(data.placementNotes);
        if (data.suggestedPlacements?.[0]) {
          const sug = data.suggestedPlacements[0];
          setScale(sug.scale);
          setRotation(sug.rotationDeg);
          animScale.value = withSpring(sug.scale);
          animRotation.value = withSpring(sug.rotationDeg);
          translateX.value = withSpring((sug.anchorX - 0.5) * CANVAS_SIZE);
          translateY.value = withSpring((sug.anchorY - 0.5) * CANVAS_SIZE);
        }
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
      if (data.warnings?.length) {
        setAiNotes(prev => prev + '\n\nWarnings: ' + data.warnings.join(', '));
      }
    } catch (err) {
      console.error('AI suggest failed:', err);
      setAiNotes('AI suggestions are currently unavailable. Adjust placement manually.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiRemix = async () => {
    if (!session) return;
    setAiLoading(true);
    try {
      const res = await apiRequest('POST', '/api/v1/ai/design-remix', {
        designImage: '',
        style: 'realistic ink on skin',
      });
      const data = await res.json();
      if (data.suggestions?.[0]) {
        const sug = data.suggestions[0];
        setBlendMode(sug.recommendedBlendMode);
        setOpacity(sug.recommendedOpacity);
        setWarpIntensity(sug.recommendedWarpIntensity);
        setAiNotes(data.overallNotes || '');
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (err) {
      console.error('AI remix failed:', err);
      setAiNotes('AI realism suggestions unavailable. Adjust manually.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleExport = () => {
    if (!session) return;
    const anchorX = 0.5 + translateX.value / CANVAS_SIZE;
    const anchorY = 0.5 + translateY.value / CANVAS_SIZE;

    updateSession(session.id, {
      placement: {
        anchorX: Math.max(0, Math.min(1, anchorX)),
        anchorY: Math.max(0, Math.min(1, anchorY)),
        scale,
        rotationDeg: rotation,
        opacity,
        blendMode,
        warpIntensity,
      },
      aiNotes: aiNotes || undefined,
      status: 'editing',
    });

    router.push({ pathname: '/session-detail', params: { id: session.id, fromEditor: '1' } });
  };

  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <Text style={styles.errorText}>Session not found</Text>
        <ActionButton title="Go Back" icon="arrow-back" onPress={() => router.back()} variant="outline" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{session.name}</Text>
        <Pressable
          onPress={() => setShowControls(!showControls)}
          hitSlop={12}
          style={styles.toggleBtn}
        >
          <Ionicons
            name={showControls ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color={Colors.dark.textSecondary}
          />
        </Pressable>
      </View>

      <View style={styles.canvasContainer}>
        <View style={[styles.canvas, { width: CANVAS_SIZE, height: CANVAS_SIZE }]}>
          <View style={styles.canvasGrid}>
            <View style={styles.gridLineH} />
            <View style={styles.gridLineV} />
          </View>

          <GestureDetector gesture={composed}>
            <Animated.View style={[styles.tattooOverlay, tattooStyle]}>
              <Image
                source={{ uri: session.designUri }}
                style={styles.tattooImage}
                contentFit="contain"
              />
            </Animated.View>
          </GestureDetector>
        </View>
      </View>

      {showControls && (
        <ScrollView
          style={styles.controlsPanel}
          contentContainerStyle={[styles.controlsContent, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.aiSection}>
            <ActionButton
              title="Suggest Placement"
              icon="sparkles-outline"
              onPress={handleAiSuggest}
              variant="secondary"
              size="small"
              loading={aiLoading}
              style={{ flex: 1 }}
            />
            <ActionButton
              title="Improve Realism"
              icon="color-wand-outline"
              onPress={handleAiRemix}
              variant="secondary"
              size="small"
              loading={aiLoading}
              style={{ flex: 1 }}
            />
          </View>

          {!!aiNotes && (
            <View style={styles.aiNotesBox}>
              <Ionicons name="sparkles" size={14} color={Colors.dark.tint} />
              <Text style={styles.aiNotesText}>{aiNotes}</Text>
            </View>
          )}

          <EditorSlider
            label="Opacity"
            value={opacity}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={setOpacity}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />

          <EditorSlider
            label="Scale"
            value={scale}
            min={0.3}
            max={3.0}
            step={0.1}
            onChange={(v) => {
              setScale(v);
              animScale.value = v;
            }}
            formatValue={(v) => `${v.toFixed(1)}x`}
          />

          <EditorSlider
            label="Rotation"
            value={rotation}
            min={-180}
            max={180}
            step={1}
            onChange={(v) => {
              setRotation(v);
              animRotation.value = v;
            }}
            formatValue={(v) => `${Math.round(v)}\u00B0`}
          />

          <EditorSlider
            label="Warp"
            value={warpIntensity}
            min={0}
            max={1.0}
            step={0.05}
            onChange={setWarpIntensity}
            formatValue={(v) => `${Math.round(v * 100)}%`}
          />

          <View style={styles.blendSection}>
            <Text style={styles.blendLabel}>Blend Mode</Text>
            <View style={styles.blendRow}>
              {BLEND_MODES.map((mode) => (
                <Pressable
                  key={mode.value}
                  onPress={() => {
                    setBlendMode(mode.value);
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                  }}
                  style={[
                    styles.blendChip,
                    blendMode === mode.value && styles.blendChipActive,
                  ]}
                >
                  <Text style={[
                    styles.blendChipText,
                    blendMode === mode.value && styles.blendChipTextActive,
                  ]}>
                    {mode.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.exportSection}>
            <ActionButton
              title="Export Preview"
              icon="download-outline"
              onPress={handleExport}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.text,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  toggleBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  canvas: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  canvasGrid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLineH: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(212, 168, 83, 0.1)',
  },
  gridLineV: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(212, 168, 83, 0.1)',
  },
  tattooOverlay: {
    position: 'absolute',
    top: '25%',
    left: '25%',
    width: '50%',
    height: '50%',
  },
  tattooImage: {
    width: '100%',
    height: '100%',
  },
  controlsPanel: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 4,
  },
  controlsContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  aiSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  aiNotesBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.dark.accentSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  aiNotesText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.tintLight,
    lineHeight: 18,
  },
  blendSection: {
    marginBottom: 20,
  },
  blendLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  blendRow: {
    flexDirection: 'row',
    gap: 8,
  },
  blendChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: Colors.dark.surfaceElevated,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  blendChipActive: {
    backgroundColor: Colors.dark.accentSoft,
    borderColor: Colors.dark.tint,
  },
  blendChipText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.textSecondary,
  },
  blendChipTextActive: {
    color: Colors.dark.tint,
  },
  exportSection: {
    flexDirection: 'row',
    marginTop: 4,
  },
  errorText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 100,
  },
});
