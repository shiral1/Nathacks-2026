import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    Pressable,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import {
    clearPantry,
    daysLeft,
    deleteReceipt,
    getStatus,
    isPerishable,
    loadPantry,
    loadReceipts,
    PantryItem,
    Receipt,
    removeFromPantry,
    updatePantryItem,
} from '../lib/pantry';

type Filter = 'all' | 'perishables' | 'out' | 'receipts';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'perishables', label: 'Perishables' },
  { key: 'out', label: 'Out of stock' },
  { key: 'receipts', label: 'Receipts' },
];

const CATEGORY_ORDER = ['produce', 'meat', 'seafood', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'other'];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function freshnessLabel(item: PantryItem): { text: string; color: string } | null {
  const status = getStatus(item);
  if (status === 'out') return { text: 'Out of stock', color: '#C62828' };
  const d = daysLeft(item);
  if (status === 'expired') return { text: `Likely expired · ${-d} day${d === -1 ? '' : 's'} past`, color: '#C62828' };
  if (status === 'soon') return { text: d === 0 ? 'Use today' : `Use soon · ${d} day${d === 1 ? '' : 's'} left`, color: '#EF6C00' };
  if (isPerishable(item)) return { text: `${d} days left`, color: '#2E7D32' };
  return null;
}

export default function PantryScreen() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadPantry().then(setItems);
      loadReceipts().then(setReceipts);
      return () => setEditing(false); // leave edit mode when switching tabs
    }, [])
  );

  const groupByCategory = (list: PantryItem[]) => {
    const groups: Record<string, PantryItem[]> = {};
    for (const it of list) (groups[it.category] ??= []).push(it);
    return Object.keys(groups)
      .sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map((cat) => ({ title: cat, data: groups[cat].sort((a, b) => a.name.localeCompare(b.name)) }));
  };

  const allSections = useMemo(() => groupByCategory(items), [items]);
  const outSections = useMemo(() => groupByCategory(items.filter((it) => getStatus(it) === 'out')), [items]);
  const perishables = useMemo(
    () =>
      items
        .filter((it) => isPerishable(it) && it.quantity > 0)
        .sort((a, b) => daysLeft(a) - daysLeft(b)),
    [items]
  );

  const changeQty = async (item: PantryItem, delta: number) => {
    const quantity = Math.max(0, Math.round((item.quantity + delta) * 100) / 100);
    await updatePantryItem(item.id, { quantity });
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, quantity } : it)));
  };

  const remove = async (id: string) => {
    await removeFromPantry(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Two-step confirmation
  const confirmClearAll = () =>
    Alert.alert('Clear entire pantry?', `This removes all ${items.length} items.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Are you absolutely sure?', "This can't be undone. Your receipts will be kept.", [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete everything',
              style: 'destructive',
              onPress: async () => {
                await clearPantry();
                setItems([]);
                setEditing(false);
              },
            },
          ]),
      },
    ]);

  const confirmDeleteReceipt = (r: Receipt) =>
    Alert.alert('Delete receipt?', 'This removes the receipt record. Pantry items stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReceipt(r.id);
          setReceipts((prev) => prev.filter((x) => x.id !== r.id));
        },
      },
    ]);

  const count = (f: Filter) => {
    if (f === 'all') return items.length;
    if (f === 'perishables') return perishables.length;
    if (f === 'out') return items.filter((it) => getStatus(it) === 'out').length;
    return receipts.length;
  };

  // ---------- Shared pieces ----------
  const topBar = (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label} ({count(f.key)})
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filter !== 'receipts' && items.length > 0 && (
        <View style={styles.editBar}>
          <Text style={styles.editHint}>{editing ? 'Editing pantry' : ''}</Text>
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={10}>
            <Text style={styles.editToggle}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderRow = (item: PantryItem) => {
    const label = freshnessLabel(item);
    const out = getStatus(item) === 'out';
    return (
      <View style={[styles.row, out && styles.rowOut]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            Added {new Date(item.addedAt).toLocaleDateString()}
            {label && (
              <Text style={{ color: label.color, fontWeight: '600' }}>
                {'  '}• {label.text}
              </Text>
            )}
          </Text>
        </View>

        {editing ? (
          <>
            <View style={styles.qtyBox}>
              <Pressable onPress={() => changeQty(item, -1)} hitSlop={8} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={styles.qty}>
                {item.quantity} {item.unit === 'item' ? '' : item.unit}
              </Text>
              <Pressable onPress={() => changeQty(item, 1)} hitSlop={8} style={styles.qtyBtn}>
                <Text style={styles.qtyBtnText}>+</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => remove(item.id)} hitSlop={10}>
              <Text style={styles.delete}>✕</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.qtyRead}>
            {item.quantity} {item.unit === 'item' ? '' : item.unit}
          </Text>
        )}
      </View>
    );
  };

  const clearAllFooter =
    editing && items.length > 0 ? (
      <Pressable onPress={confirmClearAll} style={styles.clearAll}>
        <Text style={styles.clearAllText}>Clear entire pantry</Text>
      </Pressable>
    ) : null;

  const empty = (text: string) => <Text style={[styles.hint, { marginTop: 40 }]}>{text}</Text>;

  // ---------- Receipts ----------
  if (filter === 'receipts') {
    return (
      <View style={styles.container}>
        {topBar}
        <FlatList
          data={receipts}
          keyExtractor={(r) => r.id}
          ListEmptyComponent={empty('No receipts yet. Scan one to see it here.')}
          renderItem={({ item: r }) => {
            const open = openReceipt === r.id;
            return (
              <View style={styles.receipt}>
                <Pressable style={styles.receiptHeader} onPress={() => setOpenReceipt(open ? null : r.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.receiptTitle}>{formatDate(r.scannedAt)}</Text>
                    <Text style={styles.meta}>
                      {formatTime(r.scannedAt)} · {r.items.length} items
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
                </Pressable>
                {open && (
                  <View style={styles.receiptBody}>
                    {r.items.map((line, i) => (
                      <View key={i} style={styles.receiptLine}>
                        <Text style={styles.lineName}>{line.name}</Text>
                        <Text style={styles.lineQty}>
                          {line.quantity} {line.unit === 'item' ? '' : line.unit}
                        </Text>
                        <Text style={styles.lineCat}>{line.category}</Text>
                      </View>
                    ))}
                    <Pressable onPress={() => confirmDeleteReceipt(r)} style={styles.deleteReceipt}>
                      <Text style={styles.deleteReceiptText}>Delete receipt</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
        />
      </View>
    );
  }

  // ---------- Perishables (soonest to expire first) ----------
  if (filter === 'perishables') {
    return (
      <View style={styles.container}>
        {topBar}
        <FlatList
          data={perishables}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={empty('No perishables in your pantry.')}
          ListFooterComponent={clearAllFooter}
        />
      </View>
    );
  }

  // ---------- All / Out of stock (grouped by category) ----------
  const sections = filter === 'out' ? outSections : allSections;
  return (
    <View style={styles.container}>
      {topBar}
      <SectionList
        sections={sections}
        keyExtractor={(it) => it.id}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>
            {section.title} · {section.data.length}
          </Text>
        )}
        renderItem={({ item }) => renderRow(item)}
        ListEmptyComponent={empty(
          items.length === 0 ? 'Your pantry is empty. Scan a receipt to add items.' : 'Nothing here.'
        )}
        ListFooterComponent={clearAllFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  hint: { color: '#666', textAlign: 'center', paddingHorizontal: 20 },

  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, alignItems: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: '#ccc' },
  chipActive: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  chipText: { color: '#333', fontWeight: '600', fontSize: 15, lineHeight: 20 },
  chipTextActive: { color: '#fff' },

  editBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  editHint: { color: '#EF6C00', fontWeight: '600', fontSize: 13 },
  editToggle: { color: '#2E7D32', fontWeight: '700', fontSize: 16 },

  sectionHeader: {
    backgroundColor: '#F1F8E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
    textTransform: 'capitalize',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowOut: { opacity: 0.55 },
  name: { fontSize: 17, fontWeight: '600', textTransform: 'capitalize' },
  meta: { color: '#666', marginTop: 2, fontSize: 13 },
  qtyRead: { fontWeight: '600', color: '#333', minWidth: 40, textAlign: 'right' },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { fontSize: 18, fontWeight: '700', color: '#333' },
  qty: { minWidth: 36, textAlign: 'center', fontWeight: '600' },
  delete: { fontSize: 18, color: '#C62828', paddingHorizontal: 4 },

  clearAll: { margin: 20, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#C62828', alignItems: 'center' },
  clearAllText: { color: '#C62828', fontWeight: '700', fontSize: 16 },

  receipt: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, overflow: 'hidden' },
  receiptHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#fafafa' },
  receiptTitle: { fontSize: 16, fontWeight: '700' },
  chevron: { fontSize: 20, color: '#2E7D32', paddingLeft: 8 },
  receiptBody: { paddingHorizontal: 14, paddingBottom: 10 },
  receiptLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  lineName: { flex: 1, fontSize: 15, textTransform: 'capitalize' },
  lineQty: { width: 60, textAlign: 'right', color: '#333', fontWeight: '600' },
  lineCat: { width: 80, textAlign: 'right', color: '#888', fontSize: 12, textTransform: 'capitalize' },
  deleteReceipt: { paddingTop: 12, alignItems: 'center' },
  deleteReceiptText: { color: '#C62828', fontWeight: '600' },
});