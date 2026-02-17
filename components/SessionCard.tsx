import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import type { TattooSession } from '@shared/schema';

interface SessionCardProps {
  session: TattooSession;
  onPress: () => void;
  onDelete: () => void;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'exported': return Colors.dark.success;
    case 'editing': return Colors.dark.tint;
    default: return Colors.dark.textTertiary;
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'exported': return 'Exported';
    case 'editing': return 'In Progress';
    default: return 'Draft';
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function SessionCard({ session, onPress, onDelete }: SessionCardProps) {
  const handleDelete = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDelete();
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.thumbnailContainer}>
        {session.designUri ? (
          <Image
            source={{ uri: session.designUri }}
            style={styles.thumbnail}
            contentFit="cover"
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons name="color-palette-outline" size={28} color={Colors.dark.textTertiary} />
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{session.name}</Text>
        <Text style={styles.designFile} numberOfLines={1}>{session.designName}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(session.status) + '22' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(session.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(session.status) }]}>
              {getStatusLabel(session.status)}
            </Text>
          </View>
          <Text style={styles.date}>{formatDate(session.updatedAt)}</Text>
        </View>
      </View>

      <Pressable onPress={handleDelete} hitSlop={12} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color={Colors.dark.danger} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  thumbnailContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.dark.surfaceElevated,
  },
  thumbnail: {
    width: 56,
    height: 56,
  },
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  name: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.text,
    marginBottom: 2,
  },
  designFile: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.textSecondary,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  date: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.textTertiary,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
