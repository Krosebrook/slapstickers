import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import Colors from '@/constants/colors';
import { useSessions } from '@/lib/session-context';
import ActionButton from '@/components/ActionButton';
import type { ApprovalPacket } from '@shared/schema';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EXPORT_SIZE = SCREEN_WIDTH - 48;

export default function SessionDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; fromEditor?: string }>();
  const { getSession, updateSession, deleteSession } = useSessions();
  const session = getSession(params.id || '');
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);
  const previewRef = useRef<View>(null);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const handleSaveToGallery = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow access to save to your gallery.');
        setSaving(false);
        return;
      }

      if (previewRef.current) {
        const uri = await captureRef(previewRef, {
          format: 'png',
          quality: 1,
        });

        await MediaLibrary.saveToLibraryAsync(uri);

        const stills = [...(session.stills || []), uri];
        const packet: ApprovalPacket = {
          sessionId: session.id,
          createdAt: session.createdAt,
          design: {
            originalName: session.designName,
            mimeType: 'image/png',
            localUri: session.designUri,
          },
          media: {
            sourceVideoUri: session.videoUri,
            stills,
          },
          placement: session.placement,
          ai: session.aiNotes ? {
            provider: 'gemini',
            placementNotes: session.aiNotes,
          } : undefined,
          consent: { faceFreeConfirmed: true },
        };

        await updateSession(session.id, {
          stills,
          status: 'exported',
          approvalPacket: packet,
        });

        setSaved(true);
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (err) {
      console.error('Save failed:', err);
      Alert.alert('Error', 'Failed to save to gallery.');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!session) return;
    setSharing(true);
    try {
      if (previewRef.current) {
        const uri = await captureRef(previewRef, {
          format: 'png',
          quality: 1,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Tattoo Preview - ${session.name}`,
          });
        }
      }
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = () => {
    if (!session) return;
    if (Platform.OS === 'web') {
      if (confirm('Delete this session permanently?')) {
        deleteSession(session.id);
        router.replace('/');
      }
    } else {
      Alert.alert(
        'Delete Session',
        'Delete this session permanently? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteSession(session.id);
              router.replace('/');
            },
          },
        ],
      );
    }
  };

  const handleEdit = () => {
    if (session) {
      router.push({ pathname: '/editor', params: { id: session.id } });
    }
  };

  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <Text style={styles.errorText}>Session not found</Text>
        <ActionButton title="Go Home" icon="home-outline" onPress={() => router.replace('/')} variant="outline" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{session.name}</Text>
        <Pressable onPress={handleDelete} hitSlop={12} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={20} color={Colors.dark.danger} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewSection}>
          <View
            ref={previewRef}
            collapsable={false}
            style={[styles.previewCanvas, { width: EXPORT_SIZE, height: EXPORT_SIZE }]}
          >
            <View style={styles.previewBg}>
              <Image
                source={{ uri: session.designUri }}
                style={[
                  styles.previewTattoo,
                  {
                    opacity: session.placement.opacity,
                    transform: [
                      { translateX: (session.placement.anchorX - 0.5) * EXPORT_SIZE },
                      { translateY: (session.placement.anchorY - 0.5) * EXPORT_SIZE },
                      { scale: session.placement.scale },
                      { rotate: `${session.placement.rotationDeg}deg` },
                    ],
                  },
                ]}
                contentFit="contain"
              />
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: session.status === 'exported' ? Colors.dark.successSoft : Colors.dark.accentSoft }]}>
              <Ionicons
                name={session.status === 'exported' ? 'checkmark-circle' : 'pencil'}
                size={14}
                color={session.status === 'exported' ? Colors.dark.success : Colors.dark.tint}
              />
              <Text style={[styles.statusText, { color: session.status === 'exported' ? Colors.dark.success : Colors.dark.tint }]}>
                {session.status === 'exported' ? 'Exported' : 'In Progress'}
              </Text>
            </View>
            <Text style={styles.dateText}>
              {new Date(session.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <ActionButton
            title="Save"
            icon={saved ? 'checkmark-circle' : 'download-outline'}
            onPress={handleSaveToGallery}
            loading={saving}
            variant={saved ? 'secondary' : 'primary'}
            size="small"
            style={{ flex: 1 }}
          />
          <ActionButton
            title="Share"
            icon="share-outline"
            onPress={handleShare}
            loading={sharing}
            variant="secondary"
            size="small"
            style={{ flex: 1 }}
          />
          <ActionButton
            title="Edit"
            icon="brush-outline"
            onPress={handleEdit}
            variant="outline"
            size="small"
            style={{ flex: 1 }}
          />
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.sectionTitle}>Placement Details</Text>
          <View style={styles.detailGrid}>
            <DetailItem label="Position" value={`${(session.placement.anchorX * 100).toFixed(0)}%, ${(session.placement.anchorY * 100).toFixed(0)}%`} />
            <DetailItem label="Scale" value={`${session.placement.scale.toFixed(1)}x`} />
            <DetailItem label="Rotation" value={`${session.placement.rotationDeg.toFixed(0)}\u00B0`} />
            <DetailItem label="Opacity" value={`${(session.placement.opacity * 100).toFixed(0)}%`} />
            <DetailItem label="Blend" value={session.placement.blendMode} />
            <DetailItem label="Warp" value={`${(session.placement.warpIntensity * 100).toFixed(0)}%`} />
          </View>
        </View>

        {session.aiNotes && (
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>AI Notes</Text>
            <View style={styles.aiNotesCard}>
              <Ionicons name="sparkles" size={16} color={Colors.dark.tint} />
              <Text style={styles.aiNotesText}>{session.aiNotes}</Text>
            </View>
          </View>
        )}

        <View style={styles.detailSection}>
          <Text style={styles.sectionTitle}>Design File</Text>
          <View style={styles.fileCard}>
            <Ionicons name="document-outline" size={20} color={Colors.dark.textSecondary} />
            <Text style={styles.fileCardText}>{session.designName}</Text>
          </View>
        </View>

        {session.stills.length > 0 && (
          <View style={styles.detailSection}>
            <Text style={styles.sectionTitle}>Exported Stills ({session.stills.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {session.stills.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.stillThumb} contentFit="cover" />
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.item}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  item: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: '30%',
  },
  label: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.text,
  },
});

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
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  previewSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  previewCanvas: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  previewBg: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewTattoo: {
    width: '50%',
    height: '50%',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  dateText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.textTertiary,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  detailSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aiNotesCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.dark.accentSoft,
    borderRadius: 12,
    padding: 14,
    alignItems: 'flex-start',
  },
  aiNotesText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.tintLight,
    lineHeight: 19,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  fileCardText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.textSecondary,
  },
  stillThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: Colors.dark.surfaceElevated,
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
