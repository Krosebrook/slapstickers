import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import Colors from '@/constants/colors';
import { useSessions } from '@/lib/session-context';
import ActionButton from '@/components/ActionButton';

export default function NewSessionScreen() {
  const insets = useSafeAreaInsets();
  const { createSession } = useSessions();
  const [sessionName, setSessionName] = useState('');
  const [designUri, setDesignUri] = useState('');
  const [designName, setDesignName] = useState('');
  const [bodyImageUri, setBodyImageUri] = useState('');
  const [faceFreeConfirmed, setFaceFreeConfirmed] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [contentConsent, setContentConsent] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const toggleFaceFree = () => {
    setFaceFreeConfirmed(!faceFreeConfirmed);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const toggleAge = () => {
    setAgeVerified(!ageVerified);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  const toggleConsent = () => {
    setContentConsent(!contentConsent);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const pickDesign = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        setDesignUri(result.assets[0].uri);
        const fileName = result.assets[0].fileName || 'design.png';
        setDesignName(fileName);
        if (!sessionName) {
          setSessionName(fileName.replace(/\.[^.]+$/, ''));
        }
      }
    } catch (err) {
      console.error('Failed to pick design:', err);
    }
  };

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
      }
    } catch (err) {
      console.error('Failed to pick body image:', err);
    }
  };

  const captureBodyImage = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take a photo.');
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
      }
    } catch (err) {
      console.error('Failed to capture body image:', err);
    }
  };

  const handleCreate = async () => {
    if (!designUri || !sessionName.trim()) return;

    setIsCreating(true);
    try {
      const consent = {
        faceFreeConfirmed,
        ageVerified,
        contentConsent,
        timestamp: new Date().toISOString(),
      };
      const session = await createSession(
        sessionName.trim(),
        designUri,
        designName,
        bodyImageUri || undefined,
        { consent },
      );
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace({ pathname: '/editor', params: { id: session.id } });
    } catch (err) {
      console.error('Create session failed:', err);
      Alert.alert('Error', 'Failed to create session.');
    } finally {
      setIsCreating(false);
    }
  };

  const canCreate = designUri && sessionName.trim() && faceFreeConfirmed && ageVerified && contentConsent;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>New Preview</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Session Name</Text>
            <TextInput
              style={styles.input}
              value={sessionName}
              onChangeText={setSessionName}
              placeholder="e.g. Arm Sleeve Design"
              placeholderTextColor={Colors.dark.textTertiary}
              maxLength={50}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Body Photo</Text>
            <Text style={styles.sectionDesc}>
              Take or import a photo of the body area where you want the tattoo. Keep face out of frame.
            </Text>

            {bodyImageUri ? (
              <View style={styles.designPreview}>
                <Image source={{ uri: bodyImageUri }} style={styles.bodyImage} contentFit="cover" />
                <View style={styles.changeRow}>
                  <Pressable onPress={pickBodyImage} style={styles.changeBtn}>
                    <Ionicons name="swap-horizontal" size={16} color={Colors.dark.tint} />
                    <Text style={styles.changeBtnText}>Change</Text>
                  </Pressable>
                  <Pressable onPress={() => setBodyImageUri('')} style={styles.changeBtn}>
                    <Ionicons name="close-circle" size={16} color={Colors.dark.danger} />
                    <Text style={[styles.changeBtnText, { color: Colors.dark.danger }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.videoButtons}>
                <Pressable onPress={captureBodyImage} style={styles.videoOption}>
                  <Ionicons name="camera-outline" size={28} color={Colors.dark.tint} />
                  <Text style={styles.videoOptionText}>Take Photo</Text>
                </Pressable>
                <Pressable onPress={pickBodyImage} style={styles.videoOption}>
                  <Ionicons name="images-outline" size={28} color={Colors.dark.tint} />
                  <Text style={styles.videoOptionText}>From Gallery</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tattoo Design</Text>
            <Text style={styles.sectionDesc}>Upload your design (PNG, SVG, JPG, max 10MB)</Text>

            {designUri ? (
              <View style={styles.designPreview}>
                <Image source={{ uri: designUri }} style={styles.designImage} contentFit="contain" />
                <Pressable onPress={pickDesign} style={styles.changeBtn}>
                  <Ionicons name="swap-horizontal" size={16} color={Colors.dark.tint} />
                  <Text style={styles.changeBtnText}>Change</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={pickDesign} style={styles.uploadArea}>
                <MaterialCommunityIcons name="image-plus" size={36} color={Colors.dark.textTertiary} />
                <Text style={styles.uploadText}>Tap to upload design</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Safety & Consent</Text>
            <Text style={styles.sectionDesc}>Required before processing</Text>

            <Pressable onPress={toggleAge} style={styles.checkboxRow}>
              <View style={[styles.checkbox, ageVerified && styles.checkboxChecked]}>
                {ageVerified && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </View>
              <Text style={styles.checkboxLabel}>I confirm I am 18 years or older</Text>
            </Pressable>

            <Pressable onPress={toggleConsent} style={[styles.checkboxRow, { marginTop: 10 }]}>
              <View style={[styles.checkbox, contentConsent && styles.checkboxChecked]}>
                {contentConsent && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </View>
              <Text style={styles.checkboxLabel}>I consent to processing my media for tattoo preview</Text>
            </Pressable>

            <Pressable onPress={toggleFaceFree} style={[styles.checkboxRow, { marginTop: 10 }]}>
              <View style={[styles.checkbox, faceFreeConfirmed && styles.checkboxChecked]}>
                {faceFreeConfirmed && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </View>
              <Text style={styles.checkboxLabel}>I confirm no faces are visible in my photos</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 16 }]}>
          <ActionButton
            title="Start Editing"
            icon="brush-outline"
            onPress={handleCreate}
            loading={isCreating}
            disabled={!canCreate}
            style={styles.createButton}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
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
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.text,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.text,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.textSecondary,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginTop: 8,
  },
  uploadArea: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    borderStyle: 'dashed',
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.textSecondary,
  },
  designPreview: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  designImage: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  bodyImage: {
    width: '100%',
    height: 240,
    backgroundColor: Colors.dark.surfaceElevated,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  changeBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.tint,
  },
  videoButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  videoOption: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  videoOptionText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.dark.textSecondary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: 'rgba(13, 13, 13, 0.95)',
  },
  createButton: {
    width: '100%',
  },
});
