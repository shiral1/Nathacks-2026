import { StyleSheet, Text, View } from 'react-native';

export default function PantryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Your pantry is empty</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  text: { fontSize: 17, color: '#666' },
});