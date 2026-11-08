import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { parseReceipt } from '../lib/gemini';
import { addToPantry } from '../lib/pantry';

type EditItem = {
  key: string;
  scanId: string; // which receipt this item came from
  name: string;
  quantity: string;
  unit: string;
  category: string;
};

const newKey = () => Math.random().toString(36).slice(2, 10);

const CATEGORIES = ['produce', 'meat', 'seafood', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other'];

const DONE_BAR = 'doneBar';

export default function ScanScreen() {
  const router = useRouter();
  const [uri, setUri] = useState<string | null>(null);
  const [items, setItems] = useState<EditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Each upload = its own receipt (scanId)
  const uploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const scanId = newKey();
    setUri(asset.uri);
    setError(null);
    setLoading(true);

    try {
      const parsed = await parseReceipt(asset.base64!, asset.mimeType ?? 'image/jpeg');
      if (parsed.length === 0) setError('No grocery items found. Try a clearer photo.');
      setItems((prev) => [
        ...prev,
        ...parsed.map((p) => ({ ...p, quantity: String(p.quantity), key: newKey(), scanId })),
      ]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (key: string, field: keyof EditItem, value: string) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)));

  const deleteItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
    if (expanded === key) setExpanded(null);
  };

  const addItem = () => {
    const key = newKey();
    const scanId = items[items.length - 1]?.scanId ?? newKey();
    setItems((prev) => [
      ...prev,
      { key, scanId, name: '', quantity: '1', unit: 'item', category: 'other' },
    ]);
    setExpanded(key);
  };

  const reset = () => {
    setUri(null);
    setItems([]);
    setError(null);
    setExpanded(null);
  };

  // Group review items by receipt, in scan order
  const sections = useMemo(() => {
    const order: string[] = [];
    const groups: Record<string, EditItem[]> = {};
    for (const it of items) {
      if (!groups[it.scanId]) {
        groups[it.scanId] = [];
        order.push(it.scanId);
      }
      groups[it.scanId].push(it);
    }
    return order.map((id, i) => ({ title: `Receipt ${i + 1}`, key: id, data: groups[id] }));
  }, [items]);

  const saveToPantry = async () => {
    Keyboard.dismiss();
    const receipts = sections
      .map((s) =>
        s.data
          .filter((it) => it.name.trim())
          .map(({ key, scanId, ...it }) => ({
            ...it,
            name: it.name.trim().toLowerCase(),
            unit: it.unit.trim() || 'item',
            quantity: parseFloat(it.quantity) || 1,
          }))
      )
      .filter((r) => r.length > 0);

    if (receipts.length === 0) return Alert.alert('Nothing to save', 'Add at least one item.');

    for (const r of receipts) await addToPantry(r); // each saved as its own receipt
    reset();
    router.push('/pantry');
  };

  // ---------- Review mode ----------
  if (items.length > 0) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.heading}>Review items ({items.length})</Text>
        <Text style={styles.subhint}>Tap Edit on any item to fix it.</Text>

        <SectionList
          sections={sections}
          keyExtractor={(it) => it.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>
              {section.title} · {section.data.length} items
            </Text>
          )}
          renderItem={({ item }) => {
            const open = expanded === item.key;
            return (
              <View style={styles.itemBlock}>
                <View style={styles.summaryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, !item.name && styles.placeholder]}>
                      {item.name || 'New item'}
                    </Text>
                    <Text style={styles.meta}>
                      {item.quantity} {item.unit} · {item.category}
                    </Text>
                  </View>
                  <Pressable onPress={() => setExpanded(open ? null : item.key)} hitSlop={10}>
                    <Text style={styles.editLink}>{open ? 'Close' : 'Edit'}</Text>
                  </Pressable>
                </View>

                {open && (
                  <View style={styles.editor}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                      style={styles.input}
                      value={item.name}
                      placeholder="e.g. green onion"
                      returnKeyType="done"
                      inputAccessoryViewID={DONE_BAR}
                      onChangeText={(v) => updateItem(item.key, 'name', v)}
                    />

                    <View style={styles.inlineFields}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Quantity</Text>
                        <TextInput
                          style={styles.input}
                          value={item.quantity}
                          keyboardType="decimal-pad"
                          inputAccessoryViewID={DONE_BAR}
                          onChangeText={(v) => updateItem(item.key, 'quantity', v)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Unit</Text>
                        <TextInput
                          style={styles.input}
                          value={item.unit}
                          autoCapitalize="none"
                          returnKeyType="done"
                          inputAccessoryViewID={DONE_BAR}
                          onChangeText={(v) => updateItem(item.key, 'unit', v)}
                        />
                      </View>
                    </View>

                    <Text style={styles.label}>Category</Text>
                    <View style={styles.catWrap}>
                      {CATEGORIES.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => updateItem(item.key, 'category', c)}
                          style={[styles.catChip, item.category === c && styles.catChipActive]}
                        >
                          <Text style={[styles.catText, item.category === c && styles.catTextActive]}>
                            {c}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.editorActions}>
                      <Pressable onPress={() => deleteItem(item.key)} hitSlop={8}>
                        <Text style={styles.removeText}>Remove item</Text>
                      </Pressable>
                      <Pressable
                        style={styles.doneBtn}
                        onPress={() => {
                          Keyboard.dismiss();
                          setExpanded(null);
                        }}
                      >
                        <Text style={styles.doneBtnText}>Done</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            );
          }}
          ListFooterComponent={
            <View>
              <Pressable onPress={addItem} style={styles.linkRow}>
                <Text style={styles.linkText}>+ Add item</Text>
              </Pressable>
              {loading ? (
                <View style={styles.loading}>
                  <ActivityIndicator color="#2E7D32" />
                  <Text style={styles.hint}>Reading receipt…</Text>
                </View>
              ) : (
                <Pressable onPress={uploadPhoto} style={styles.linkRow}>
                  <Text style={styles.linkText}>+ Scan another receipt</Text>
                </Pressable>
              )}
              {error && <Text style={styles.error}>{error}</Text>}
            </View>
          }
        />

        <Pressable
          style={[styles.button, loading && styles.disabled]}
          onPress={saveToPantry}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            Save {sections.length > 1 ? `${sections.length} receipts` : 'to pantry'}
          </Text>
        </Pressable>
        <Pressable onPress={reset}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>

        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID={DONE_BAR}>
            <View style={styles.doneBar}>
              <Button title="Done" onPress={Keyboard.dismiss} />
            </View>
          </InputAccessoryView>
        )}
      </KeyboardAvoidingView>
    );
  }

  // ---------- Upload mode ----------
  return (
    <View style={[styles.container, styles.centered]}>
      <Text style={styles.title}>CookLab</Text>

      {!uri && <Text style={styles.hint}>Upload a grocery receipt to fill your pantry</Text>}
      {uri && <Image source={{ uri }} style={styles.preview} />}

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#2E7D32" />
          <Text style={styles.hint}>Reading your receipt…</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

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
  container: { flex: 1, padding: 20, gap: 8, backgroundColor: '#fff' },
  centered: { justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  heading: { fontSize: 24, fontWeight: '700' },
  hint: { textAlign: 'center', color: '#666' },
  subhint: { color: '#666' },
  preview: { width: '100%', height: 350, resizeMode: 'contain' },
  loading: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  error: { color: '#C62828', textAlign: 'center' },

  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#2E7D32', textTransform: 'uppercase', paddingTop: 14, paddingBottom: 4 },

  itemBlock: { borderBottomWidth: 1, borderBottomColor: '#eee' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  name: { fontSize: 17, fontWeight: '600', textTransform: 'capitalize' },
  placeholder: { color: '#aaa' },
  meta: { color: '#666', marginTop: 2, fontSize: 13 },
  editLink: { color: '#2E7D32', fontWeight: '600', fontSize: 15 },

  editor: { backgroundColor: '#F7F9F7', borderRadius: 12, padding: 12, marginBottom: 12, gap: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15 },
  inlineFields: { flexDirection: 'row', gap: 10 },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff' },
  catChipActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  catText: { fontSize: 13, color: '#333', textTransform: 'capitalize' },
  catTextActive: { color: '#fff', fontWeight: '600' },
  editorActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  removeText: { color: '#C62828', fontWeight: '600' },
  doneBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },
  doneBtnText: { color: '#fff', fontWeight: '600' },

  linkRow: { paddingVertical: 12, alignItems: 'center' },
  linkText: { color: '#2E7D32', fontSize: 16, fontWeight: '600' },

  button: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666', paddingVertical: 8 },

  doneBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: '#f2f2f2',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
});