import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const blue = '#168FD0';
const dark = '#34424B';
const muted = '#7E8A92';
const border = '#DDE3E7';

export function AuthScreen() {
  const { signIn } = useAuth();
  const [registering, setRegistering] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError('');
    setSuccessMessage('');
    setSubmitting(true);
    try {
      if (registering) {
        await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ displayName: displayName.trim(), email: email.trim(), password }),
        });
        setRegistering(false);
        setPassword('');
        setSuccessMessage('Account created successfully! Please sign in with your password.');
      } else {
        await signIn(email.trim(), password);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>R</Text></View>
            <Text style={styles.brandName}>RELAY</Text>
          </View>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>WHATSAPP + VOICE</Text>
            <Text style={styles.title}>{registering ? 'Create your account' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>{registering ? 'Set up your Relay workspace access.' : 'Your customer conversations, all in one place.'}</Text>
          </View>

          <View style={styles.form}>
            {registering && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>FULL NAME</Text>
                <TextInput
                  accessibilityLabel="Display name"
                  autoCapitalize="words"
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  placeholderTextColor="#8794AE"
                  style={styles.input}
                  value={displayName}
                />
              </View>
            )}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
              <TextInput
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="name@company.com"
                placeholderTextColor="#8794AE"
                style={styles.input}
                value={email}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  accessibilityLabel="Password"
                  autoCapitalize="none"
                  autoComplete={registering ? 'new-password' : 'current-password'}
                  onChangeText={setPassword}
                  onSubmitEditing={submit}
                  placeholder="Enter your password"
                  placeholderTextColor="#8794AE"
                  secureTextEntry={!showPassword}
                  style={[styles.input, styles.passwordInput]}
                  value={password}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((value) => !value)} style={styles.passwordToggle}>
                  <Text style={styles.passwordToggleText}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
                </Pressable>
              </View>
            </View>
            {registering && <Text style={styles.helper}>Use at least 12 characters.</Text>}
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            {!!successMessage && <Text accessibilityRole="alert" style={styles.success}>{successMessage}</Text>}
            <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={[styles.submit, submitting && styles.disabled]}>
              <Text style={styles.submitText}>{submitting ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</Text>
              {!submitting && <Text style={styles.submitArrow}>→</Text>}
            </Pressable>
            <Pressable onPress={() => { setError(''); setSuccessMessage(''); setRegistering((value) => !value); }} style={styles.modeToggle}>
              <Text style={styles.modeText}>{registering ? 'Already on the team? ' : 'New to Relay? '}</Text>
              <Text style={styles.modeAction}>{registering ? 'Sign in' : 'Create account'}</Text>
            </Pressable>
          </View>
          <Text style={styles.footer}>SECURE TEAM ACCESS <Text style={styles.footerDot}>·</Text> RELAY WORKSPACE</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    minHeight: (Platform.OS === 'web' ? '100vh' : '100%') as any,
    backgroundColor: '#050916',
    backgroundImage: 'linear-gradient(148deg, #46CFFF 0%, #3479ED 19%, #142C68 43%, #080F26 68%, #03050B 100%)',
  },
  keyboard: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 34 },
  shell: { width: '100%', maxWidth: 450, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 54 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.38)', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFFFFF', fontSize: 21, fontWeight: '700' },
  brandName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  intro: { gap: 10, marginBottom: 30 },
  eyebrow: { color: '#8EEBFF', fontSize: 11, fontWeight: '700' },
  title: { color: '#FFFFFF', fontSize: 38, lineHeight: 44, fontWeight: '700' },
  subtitle: { maxWidth: 350, color: '#D5E0F5', fontSize: 15, lineHeight: 23 },
  form: { gap: 19 },
  fieldGroup: { gap: 8 },
  fieldLabel: { color: '#C3D0E8', fontSize: 10, fontWeight: '700' },
  input: { height: 56, borderWidth: 1, borderColor: 'rgba(194,216,255,0.18)', borderRadius: 14, backgroundColor: 'rgba(3,8,21,0.54)', paddingHorizontal: 17, color: '#FFFFFF', fontSize: 15 },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 76 },
  passwordToggle: { position: 'absolute', right: 12, minWidth: 48, height: 40, alignItems: 'center', justifyContent: 'center' },
  passwordToggleText: { color: '#9CCFFF', fontSize: 10, fontWeight: '700' },
  helper: { color: '#B9C9E5', fontSize: 12 },
  error: { color: '#FFD4D4', fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,130,130,0.35)', backgroundColor: 'rgba(102,18,40,0.4)' },
  success: { color: '#E0FFE8', fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(80,220,120,0.4)', backgroundColor: 'rgba(12,80,32,0.5)' },
  submit: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: '#68DDF5',
    backgroundImage: 'linear-gradient(105deg, #4D74F5 0%, #77DEEE 58%, #66E9E0 100%)',
  },
  disabled: { opacity: 0.7 },
  submitText: { color: '#071126', fontSize: 15, fontWeight: '700' },
  submitArrow: { color: '#071126', fontSize: 18, fontWeight: '700' },
  modeToggle: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 7 },
  modeText: { color: '#B8C6DF', fontSize: 13 },
  modeAction: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  footer: { color: 'rgba(192,207,230,0.62)', fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 38 },
  footerDot: { color: '#6EE5E8' },
});