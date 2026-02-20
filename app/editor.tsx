import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
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
const CANVAS_WIDTH = SCREEN_WIDTH - 32;
const CANVAS_HEIGHT = CANVAS_WIDTH * 1.33;

type BlendMode = 'normal' | 'multiply' | 'overlay' | 'screen';

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'screen', label: 'Screen' },
];

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
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
  const [bodyImageUri, setBodyImageUri] = useState(session?.bodyImageUri || '');
  const [pinMode, setPinMode] = useState(false);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<'fresh' | 'healed'>(session?.previewMode ?? 'fresh');

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
      animScale.value = Math.max(0.2, Math.min(5, savedScale.value * e.scale));
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

  const composed = pinMode
    ? Gesture.Simultaneous(pinchGesture, rotateGesture)
    : Gesture.Simultaneous(panGesture, pinchGesture, rotateGesture);

  const tattooStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: animScale.value },
      { rotate: `${animRotation.value}deg` },
    ],
    opacity: previewMode === 'healed' ? opacity * 0.75 : opacity,
  }));

  const pickBodyImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
        aspect: [3, 4],
      });
      if (!result.canceled && result.assets[0]) {
        setBodyImageUri(result.assets[0].uri);
        if (session) {
          updateSession(session.id, { bodyImageUri: result.assets[0].uri });
        }
      }
    } catch (err) {
      console.error('Failed to pick body image:', err);
    }
  };

  const captureBodyImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
        aspect: [3, 4],
      });
      if (!result.canceled && result.assets[0]) {
        setBodyImageUri(result.assets[0].uri);
        if (session) {
          updateSession(session.id, { bodyImageUri: result.assets[0].uri });
        }
      }
    } catch (err) {
      console.error('Failed to capture body image:', err);
    }
  };

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
          translateX.value = withSpring((sug.anchorX - 0.5) * CANVAS_WIDTH);
          translateY.value = withSpring((sug.anchorY - 0.5) * CANVAS_HEIGHT);
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

  const handleSubmitPremiumJob = async () => {
    if (!session) return;
    setPremiumLoading(true);
    try {
      const anchorX = 0.5 + translateX.value / CANVAS_WIDTH;
      const anchorY = 0.5 + translateY.value / CANVAS_HEIGHT;
      const currentPlacement = {
        anchorX: Math.max(0, Math.min(1, anchorX)),
        anchorY: Math.max(0, Math.min(1, anchorY)),
        scale,
        rotationDeg: rotation,
        opacity,
        blendMode,
        warpIntensity,
      };

      const res = await apiRequest('POST', '/api/v1/jobs/submit', {
        type: 'premium_still',
        sessionId: session.id,
        inputData: {
          placement: currentPlacement,
          previewMode,
        },
      });
      const data = await res.json();
      if (data.id) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setAiNotes(`Premium render submitted! Job ID: ${data.id.slice(0, 8)}... Status: ${data.status}`);

        updateSession(session.id, {
          jobIds: [...(session.jobIds || []), data.id],
          previewMode,
        });
      }
    } catch (err) {
      console.error('Premium job submit failed:', err);
      setAiNotes('Premium render unavailable. Continue with real-time preview.');
    } finally {
      setPremiumLoading(false);
    }
  };

  const handleExport = () => {
    if (!session) return;
    const anchorX = 0.5 + translateX.value / CANVAS_WIDTH;
    const anchorY = 0.5 + translateY.value / CANVAS_HEIGHT;

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
      bodyImageUri: bodyImageUri || undefined,
      aiNotes: aiNotes || undefined,
      status: 'editing',
      previewMode,
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
          onPress={() => {
            setPinMode(!pinMode);
            if (Platform.OS !== 'web') Haptics.selectionAsync();
          }}
          hitSlop={12}
          style={styles.pinBtn}
        >
          <Ionicons
            name={pinMode ? 'pin' : 'pin-outline'}
            size={20}
            color={pinMode ? Colors.dark.tint : Colors.dark.textSecondary}
          />
        </Pressable>
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
        <View style={[styles.canvas, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }]}>
          {bodyImageUri ? (
            <Image
              source={{ uri: bodyImageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={styles.noBodyPlaceholder}>
              <Ionicons name="body-outline" size={40} color={Colors.dark.textTertiary} />
              <Text style={styles.noBodyText}>Add a body photo</Text>
              <View style={styles.bodyBtnRow}>
                <Pressable onPress={captureBodyImage} style={styles.bodyMiniBtn}>
                  <Ionicons name="camera-outline" size={18} color={Colors.dark.tint} />
                </Pressable>
                <Pressable onPress={pickBodyImage} style={styles.bodyMiniBtn}>
                  <Ionicons name="images-outline" size={18} color={Colors.dark.tint} />
                </Pressable>
              </View>
            </View>
          )}

          {bodyImageUri && (
            <Pressable
              style={styles.changeBodyBtn}
              onPress={pickBodyImage}
              hitSlop={8}
            >
              <Ionicons name="camera-reverse-outline" size={16} color="#FFF" />
            </Pressable>
          )}

          <GestureDetector gesture={composed}>
            <Animated.View
              style={[
                styles.tattooOverlay,
                tattooStyle,
                Platform.OS === 'web' && blendMode !== 'normal'
                  ? { mixBlendMode: blendMode } as any
                  : undefined,
              ]}
            >
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
              title="AI Placement"
              icon="sparkles-outline"
              onPress={handleAiSuggest}
              variant="secondary"
              size="small"
              loading={aiLoading}
              style={{ flex: 1 }}
            />
            <ActionButton
              title="AI Realism"
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
            min={0.2}
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

          <View style={styles.toggleSection}>
            <Text style={styles.blendLabel}>Preview Mode</Text>
            <View style={styles.blendRow}>
              <Pressable
                onPress={() => {
                  setPreviewMode('fresh');
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                }}
                style={[styles.blendChip, previewMode === 'fresh' && styles.blendChipActive]}
              >
                <Text style={[styles.blendChipText, previewMode === 'fresh' && styles.blendChipTextActive]}>Fresh Ink</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setPreviewMode('healed');
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                }}
                style={[styles.blendChip, previewMode === 'healed' && styles.blendChipActive]}
              >
                <Text style={[styles.blendChipText, previewMode === 'healed' && styles.blendChipTextActive]}>Healed</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.premiumSection}>
            <Text style={styles.blendLabel}>Premium Render</Text>
            <Text style={styles.premiumDesc}>AI-enhanced tattoo within mask only. Takes ~2 minutes.</Text>
            <ActionButton
              title="Premium Still"
              icon="diamond-outline"
              onPress={handleSubmitPremiumJob}
              variant="secondary"
              size="small"
              loading={premiumLoading}
            />
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
    paddingVertical: 8,
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
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  canvas: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  noBodyPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  noBodyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.textTertiary,
  },
  bodyBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  bodyMiniBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  changeBodyBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  tattooOverlay: {
    position: 'absolute',
    top: '20%',
    left: '20%',
    width: '60%',
    height: '60%',
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
  toggleSection: {
    marginBottom: 20,
  },
  premiumSection: {
    marginBottom: 20,
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  premiumDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.textSecondary,
    marginBottom: 10,
    lineHeight: 17,
  },
  pinBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
