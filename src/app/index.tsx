import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { parseReceipt, ReceiptItem } from '../lib/gemini';

export default function ScanScreen() {
  const [uri, setUri] = useState<string | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true, // needed to send the image to Gemini
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    setUri(asset.uri);
    setItems([]);
    setError(null);
    setLoading(true);

    try {
      const parsed = await parseReceipt(asset.base64!, asset.mimeType ?? 'image/jpeg');
      setItems(parsed);
      if (parsed.length === 0) setError('No grocery items found. Try a clearer photo.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CookLab</Text>

      {!uri && <Text style={styles.hint}>Upload a grocery receipt to fill your pantry</Text>}

      {uri && items.length === 0 && <Image source={{ uri }} style={styles.preview} />}

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.hint}>Reading your receipt…</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {items.length > 0 && (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.qty}>
                {item.quantity} {item.unit} · {item.category}
              </Text>
            </View>
          )}
        />
      )}

      <Pressable
        style={[styles.button, loading && styles.disabled]}
        onPress={uploadPhoto}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{uri ? 'Choose another' : 'Upload receipt'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  hint: { textAlign: 'center', color: '#666', marginBottom: 16 },
  preview: { width: '100%', height: 350, resizeMode: 'contain' },
  center: { alignItems: 'center', gap: 8 },
  error: { color: '#C62828', textAlign: 'center' },
  list: { flexGrow: 0, maxHeight: '65%' },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  name: { fontSize: 17, fontWeight: '600', textTransform: 'capitalize' },
  qty: { color: '#666', marginTop: 2 },
  button: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});