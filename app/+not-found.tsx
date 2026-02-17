import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import ActionButton from '@/components/ActionButton';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Page Not Found</Text>
      <ActionButton
        title="Go Home"
        icon="home-outline"
        onPress={() => router.replace('/')}
        variant="outline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.dark.text,
  },
});
