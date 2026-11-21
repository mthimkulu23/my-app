import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '@/lib/auth';

const blue = '#168FD0';
const dark = '#34424B';
const muted = '#7E8A92';
const border = '#DDE3E7';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      if (registering) await signUp(displayName.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.form}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>R</Text></View>
            <Text style={styles.brandName}>Relay</Text>
          </View>
          <Text style={styles.title}>{registering ? 'Create your account' : 'Sign in'}</Text>
          <Text style={styles.subtitle}>Sign in to continue to your workspace.</Text>

          {registering && (
            <TextInput
              accessibilityLabel="Display name"
              autoCapitalize="words"
              onChangeText={setDisplayName}
              placeholder="Full name"
              placeholderTextColor="#97A2A9"
              style={styles.input}
              value={displayName}
            />
          )}
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor="#97A2A9"
            style={styles.input}
            value={email}
          />
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete={registering ? 'new-password' : 'current-password'}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            placeholder="Password"
            placeholderTextColor="#97A2A9"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {registering && <Text style={styles.helper}>Use at least 12 characters.</Text>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={[styles.submit, submitting && styles.disabled]}>
            <Text style={styles.submitText}>{submitting ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</Text>
          </Pressable>
          <Pressable onPress={() => { setError(''); setRegistering((value) => !value); }} style={styles.modeToggle}>
            <Text style={styles.modeText}>{registering ? 'Already have an account? ' : 'New to Relay? '}</Text>
            <Text style={styles.modeAction}>{registering ? 'Sign in' : 'Create account'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F7F9' },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  form: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  brandMark: { width: 36, height: 36, borderRadius: 8, backgroundColor: blue, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  brandName: { color: dark, fontSize: 17, fontWeight: '700' },
  title: { color: dark, fontSize: 26, fontWeight: '700' },
  subtitle: { color: muted, fontSize: 14, marginBottom: 10 },
  input: { height: 48, borderWidth: 1, borderColor: border, borderRadius: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 13, color: dark, fontSize: 15 },
  helper: { color: muted, fontSize: 12 },
  error: { color: '#B42318', fontSize: 13 },
  submit: { minHeight: 48, borderRadius: 6, backgroundColor: blue, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  disabled: { opacity: 0.65 },
  submitText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  modeToggle: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 8 },
  modeText: { color: muted, fontSize: 13 },
  modeAction: { color: blue, fontSize: 13, fontWeight: '600' },
});