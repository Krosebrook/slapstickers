import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface ActionButtonProps {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: 'normal' | 'small';
}

export default function ActionButton({
  title,
  icon,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  size = 'normal',
}: ActionButtonProps) {
  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  const bgColor = variant === 'primary' ? Colors.dark.tint
    : variant === 'secondary' ? Colors.dark.surfaceElevated
    : variant === 'danger' ? Colors.dark.danger
    : 'transparent';

  const textColor = variant === 'outline' ? Colors.dark.tint
    : variant === 'secondary' ? Colors.dark.text
    : '#FFFFFF';

  const borderColor = variant === 'outline' ? Colors.dark.tint : 'transparent';

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        size === 'small' && styles.buttonSmall,
        {
          backgroundColor: bgColor,
          borderColor: borderColor,
          borderWidth: variant === 'outline' ? 1.5 : 0,
          opacity: (disabled || loading) ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'small' ? 16 : 20} color={textColor} />}
          <Text style={[
            styles.text,
            size === 'small' && styles.textSmall,
            { color: textColor },
          ]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 8,
  },
  buttonSmall: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  text: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  textSmall: {
    fontSize: 13,
  },
});
