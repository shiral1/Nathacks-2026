import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export default function ScanScreen() {
  const [uri, setUri] = useState<string | null>(null);

  const uploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) setUri(result.assets[0].uri);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CookLab</Text>

      {uri ? (
        <Image source={{ uri }} style={styles.preview} />
      ) : (
        <Text style={styles.hint}>Upload a grocery receipt to fill your pantry</Text>
      )}

      <Pressable style={styles.button} onPress={uploadPhoto}>
        <Text style={styles.buttonText}>{uri ? 'Choose another' : 'Upload receipt'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  hint: { textAlign: 'center', color: '#666', marginBottom: 16 },
  preview: { width: '100%', height: 400, resizeMode: 'contain', marginBottom: 16 },
  button: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});