import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import FeedbackBanner from '../components/FeedbackBanner';
import { api } from '../api/client';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const ROLE_OPTIONS = [
  { key: 'read', label: 'Read' },
  { key: 'write', label: 'Write' },
  { key: 'admin', label: 'Admin' }
];

const INVITE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'expired', label: 'Expired' },
  { key: 'canceled', label: 'Canceled' }
];
const MAX_FAMILY_MEMBERS = 2;

function toInitials(value = '') {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]{1,2}$/.test(raw)) return raw.toUpperCase();
  const parts = raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase());
  if (parts.length) return parts.join('');
  const letters = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length >= 2) return letters.slice(0, 2);
  return letters || 'NA';
}

function maskMobile(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length <= 4) return `${'*'.repeat(Math.max(0, digits.length - 1))}${digits.slice(-1)}`;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export default function FamilyScreen({
  premiumActive = false,
  accessRole = 'read',
  isAccountOwner = false,
  onOpenSubscription,
  onClose,
  onRequestScrollTo = () => {}
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const isDark = theme.key === 'worthio' || theme.key === 'dark';
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [audit, setAudit] = useState([]);
  const [owner, setOwner] = useState(null);
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('read');
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState('info');
  const [formMessage, setFormMessage] = useState('');
  const [formMessageKind, setFormMessageKind] = useState('info');
  const [loading, setLoading] = useState(false);
  const [inviteFilter, setInviteFilter] = useState('pending');
  const fieldOffsetsRef = useRef({});
  const pendingInvitesCount = invites.filter((row) => row.status === 'pending').length;
  const totalUsed = members.length + pendingInvitesCount;
  const slotsLeft = Math.max(0, MAX_FAMILY_MEMBERS - totalUsed);
  const addDisabled = loading || slotsLeft === 0;

  const loadMembers = async () => {
    if (!premiumActive) return;
    if (!isAccountOwner && accessRole !== 'admin') return;
    try {
      setLoading(true);
      const data = await api.getFamilyMembers();
      setOwner(data?.owner || null);
      setMembers(Array.isArray(data?.members) ? data.members : []);
      setInvites(Array.isArray(data?.invites) ? data.invites : []);
      setMessage('');
      setMessageKind('info');
    } catch (e) {
      setMessage(e.message);
      setMessageKind('error');
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async () => {
    if (!premiumActive) return;
    if (!isAccountOwner && accessRole !== 'admin') return;
    try {
      setLoading(true);
      const data = await api.getFamilyAudit();
      setAudit(Array.isArray(data?.audit) ? data.audit : []);
    } catch (e) {
      setMessage(e.message);
      setMessageKind('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
    loadAudit();
  }, [premiumActive]);

  const setFieldOffset = useCallback((key, layoutY) => {
    const y = Number(layoutY);
    fieldOffsetsRef.current[key] = Number.isFinite(y) ? Math.max(0, y - 18) : 0;
  }, []);

  const scrollToField = useCallback(
    (key) => {
      if (typeof onRequestScrollTo !== 'function') return;
      const targetY = fieldOffsetsRef.current[key];
      onRequestScrollTo(Number.isFinite(targetY) ? targetY : 0);
    },
    [onRequestScrollTo]
  );

  const handleAdd = async () => {
    if (slotsLeft === 0) {
      setFormMessage(t('Family limit reached. You can add up to {count} members.', { count: MAX_FAMILY_MEMBERS }));
      setFormMessageKind('error');
      return;
    }
    if (!mobile.trim()) {
      setFormMessage(t('Mobile number is required.'));
      setFormMessageKind('error');
      return;
    }
    try {
      setLoading(true);
      const result = await api.addFamilyMember({ mobile: mobile.trim(), role });
      if (result?.member) {
        setMembers((prev) => [...prev, result]);
      } else if (result?.invite) {
        setInvites((prev) => [result.invite, ...prev]);
      }
      setMobile('');
      setFormMessage(result?.invite ? t('Invite sent.') : t('Family member added.'));
      setFormMessageKind('success');
      setMessage('');
      setMessageKind('info');
    } catch (e) {
      setFormMessage(e.message);
      setFormMessageKind('error');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (id, nextRole) => {
    try {
      setLoading(true);
      const updated = await api.updateFamilyMember(id, { role: nextRole });
      setMembers((prev) => prev.map((row) => (row.id === id ? updated : row)));
      setMessage(t('Role updated.'));
      setMessageKind('success');
    } catch (e) {
      setMessage(e.message);
      setMessageKind('error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      setLoading(true);
      await api.removeFamilyMember(id);
      setMembers((prev) => prev.filter((row) => row.id !== id));
      setMessage(t('Family member removed.'));
      setMessageKind('success');
    } catch (e) {
      setMessage(e.message);
      setMessageKind('error');
    } finally {
      setLoading(false);
    }
  };

  const confirmRemove = (id) => {
    Alert.alert(
      t('Family Access'),
      t('Are you sure you want to remove this family member?'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Remove'),
          style: 'destructive',
          onPress: () => {
            handleRemove(id).catch((e) => {
              setMessage(e.message);
              setMessageKind('error');
            });
          }
        }
      ]
    );
  };

  const handleCancelInvite = async (id) => {
    try {
      setLoading(true);
      await api.cancelFamilyInvite(id);
      setInvites((prev) => prev.filter((row) => row.id !== id));
      const successMessage = t('Invite canceled.');
      setMessage(successMessage);
      setMessageKind('success');
      Alert.alert(t('Family Access'), successMessage);
    } catch (e) {
      setMessage(e.message);
      setMessageKind('error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendInvite = async (id) => {
    try {
      setLoading(true);
      const result = await api.resendFamilyInvite(id);
      setInvites((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, expires_at: result?.expires_at || row.expires_at } : row
        )
      );
      const updatedExpiry = String(result?.expires_at || '').slice(0, 10);
      const successMessage = updatedExpiry
        ? t('Invite resent. New expiry: {date}.', { date: updatedExpiry })
        : t('Invite resent.');
      setMessage(successMessage);
      setMessageKind('success');
      Alert.alert(t('Family Access'), successMessage);
    } catch (e) {
      setMessage(e.message);
      setMessageKind('error');
    } finally {
      setLoading(false);
    }
  };

  const filteredInvites =
    inviteFilter === 'all' ? invites : invites.filter((row) => row.status === inviteFilter);
  const selectorButtonStyle = useCallback(
    (selected) => [
      styles.selectorButton,
      {
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected
          ? (isDark ? 'rgba(36,178,214,0.18)' : theme.accentSoft)
          : (isDark ? 'rgba(255,255,255,0.06)' : (theme.cardAlt || '#F8FAFC'))
      }
    ],
    [isDark, theme.accent, theme.accentSoft, theme.border, theme.cardAlt]
  );
  const selectorTextStyle = useCallback(
    (selected) => [
      styles.selectorButtonText,
      { color: selected ? theme.accent : theme.text }
    ],
    [theme.accent, theme.text]
  );
  const compactSelectorButtonStyle = useCallback(
    (selected) => [
      ...selectorButtonStyle(selected),
      styles.compactSelectorButton
    ],
    [selectorButtonStyle]
  );
  const compactSelectorTextStyle = useCallback(
    (selected) => [
      ...selectorTextStyle(selected),
      styles.compactSelectorText
    ],
    [selectorTextStyle]
  );
  const filterSelectorButtonStyle = useCallback(
    (selected) => [
      ...selectorButtonStyle(selected),
      styles.filterSelectorButton
    ],
    [selectorButtonStyle]
  );
  const filterSelectorTextStyle = useCallback(
    (selected) => [
      ...selectorTextStyle(selected),
      styles.filterSelectorText
    ],
    [selectorTextStyle]
  );

  return (
    <View style={styles.container}>
      <SectionCard title={t('Family Access')}>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Add family members and set their access level. Admins can manage access.')}
        </Text>
        <FeedbackBanner message={message} kind={messageKind} />

        {!premiumActive ? (
          <>
            <Text style={[styles.lockedText, { color: theme.warn }]}>
              {t('Premium required to enable family access.')}
            </Text>
            <PillButton label={t('Upgrade to Premium')} kind="primary" onPress={onOpenSubscription} />
          </>
        ) : !isAccountOwner && accessRole !== 'admin' ? (
          <Text style={[styles.lockedText, { color: theme.warn }]}>
            {t('Admin access required to manage family members.')}
          </Text>
        ) : (
          <>
            {owner ? (
              <View style={styles.ownerCard}>
                <Text style={[styles.ownerLabel, { color: theme.muted }]}>{t('Account Owner')}</Text>
                <Text style={[styles.ownerName, { color: theme.text }]}>{toInitials(owner.full_name)}</Text>
                <Text style={[styles.ownerMeta, { color: theme.muted }]}>{maskMobile(owner.mobile)}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: theme.muted }]}>{t('Add Family Member')}</Text>
            <View style={styles.limitRow}>
              <Text style={[styles.limitText, { color: theme.muted }]}>
                {t('{used}/{total} used · {left} left', { used: totalUsed, total: MAX_FAMILY_MEMBERS, left: slotsLeft })}
              </Text>
              {slotsLeft === 0 ? (
                <Text style={[styles.limitBadge, { backgroundColor: theme.accentSoft, color: theme.accent }]}>
                  {t('Limit reached')}
                </Text>
              ) : null}
            </View>
            <View style={[styles.phoneWrap, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={[styles.phonePrefix, { color: theme.text }]}>+91</Text>
              <TextInput
                onLayout={(event) => setFieldOffset('mobile', event.nativeEvent.layout.y)}
                onFocus={() => scrollToField('mobile')}
                style={[styles.phoneInput, { color: theme.inputText }]}
                value={mobile}
                onChangeText={(text) => {
                  setMobile(String(text || '').replace(/\D/g, '').slice(0, 10));
                  if (formMessage) {
                    setFormMessage('');
                    setFormMessageKind('info');
                  }
                }}
                placeholder={t('10-digit mobile number')}
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.compactRoleRow}>
              {ROLE_OPTIONS.map((opt) => (
                <PillButton
                  key={opt.key}
                  label={t(opt.label)}
                  kind="ghost"
                  style={compactSelectorButtonStyle(role === opt.key)}
                  textStyle={compactSelectorTextStyle(role === opt.key)}
                  onPress={() => setRole(opt.key)}
                />
              ))}
            </View>
            <PillButton
              label={loading ? t('Please wait...') : t('Add Member')}
              kind="primary"
              onPress={handleAdd}
              disabled={addDisabled}
            />
            <FeedbackBanner message={formMessage} kind={formMessageKind} />

            <Text style={[styles.label, { color: theme.muted }]}>{t('Members')}</Text>
            {members.length ? (
              members.map((row) => (
                <View key={row.id} style={[styles.memberCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={styles.memberHeader}>
                    <View>
                      <Text style={[styles.memberName, { color: theme.text }]}>{toInitials(row.member.full_name)}</Text>
                      <Text style={[styles.memberMeta, { color: theme.muted }]}>{maskMobile(row.member.mobile)}</Text>
                    </View>
                    <Text style={[styles.memberRole, { color: theme.accent }]}>{row.role.toUpperCase()}</Text>
                  </View>
                  <View style={styles.compactRoleRow}>
                    {ROLE_OPTIONS.map((opt) => (
                      <PillButton
                        key={`${row.id}-${opt.key}`}
                        label={t(opt.label)}
                        kind="ghost"
                        style={compactSelectorButtonStyle(row.role === opt.key)}
                        textStyle={compactSelectorTextStyle(row.role === opt.key)}
                        onPress={() => handleRoleChange(row.id, opt.key)}
                      />
                    ))}
                  </View>
                  <View style={styles.actionsRow}>
                    <Pressable onPress={() => confirmRemove(row.id)}>
                      <Text style={[styles.removeText, { color: theme.danger }]}>{t('Remove')}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>{t('No family members yet.')}</Text>
            )}

            <Text style={[styles.label, { color: theme.muted }]}>{t('Pending Invites')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {INVITE_FILTERS.map((opt) => (
                <PillButton
                  key={opt.key}
                  label={t(opt.label)}
                  kind="ghost"
                  style={filterSelectorButtonStyle(inviteFilter === opt.key)}
                  textStyle={filterSelectorTextStyle(inviteFilter === opt.key)}
                  onPress={() => setInviteFilter(opt.key)}
                />
              ))}
            </ScrollView>
            {filteredInvites.length ? (
              filteredInvites.map((row) => (
                <View key={row.id} style={[styles.inviteCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={styles.memberHeader}>
                    <View>
                      <Text style={[styles.memberName, { color: theme.text }]}>{maskMobile(row.mobile)}</Text>
                      <Text style={[styles.memberMeta, { color: theme.muted }]}>
                        {t('Status: {value}', { value: t(row.status.toUpperCase()) })} · {t('Expires: {date}', { date: String(row.expires_at || '').slice(0, 10) })}
                      </Text>
                    </View>
                    <Text style={[styles.memberRole, { color: theme.accent }]}>{row.role.toUpperCase()}</Text>
                  </View>
                  <View style={styles.actionsRow}>
                    {row.status === 'pending' ? (
                      <>
                        <Pressable onPress={() => handleResendInvite(row.id)}>
                          <Text style={[styles.actionText, { color: theme.accent }]}>{t('Resend')}</Text>
                        </Pressable>
                        <Pressable onPress={() => handleCancelInvite(row.id)}>
                          <Text style={[styles.removeText, { color: theme.danger }]}>{t('Cancel')}</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>{t('No invites found.')}</Text>
            )}

            <Text style={[styles.label, { color: theme.muted }]}>{t('Audit Log')}</Text>
            {audit.length ? (
              audit.map((row) => (
                <View key={row.id} style={styles.auditRow}>
                  <Text style={[styles.auditAction, { color: theme.text }]}>{t(row.action.replace(/_/g, ' '))}</Text>
                  <Text style={[styles.auditMeta, { color: theme.muted }]}>
                    {row.actor ? toInitials(row.actor.full_name) : t('System')} · {String(row.created_at || '').replace('T', ' ').slice(0, 19)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.helper, { color: theme.muted }]}>{t('No audit events yet.')}</Text>
            )}
          </>
        )}
      </SectionCard>

      <View style={styles.footerRow}>
        <PillButton label={t('Back')} kind="ghost" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20
  },
  helper: {
    marginBottom: 10,
    lineHeight: 19
  },
  lockedText: {
    fontWeight: '700',
    marginBottom: 12
  },
  label: {
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  phoneWrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  phonePrefix: {
    fontWeight: '800',
    fontSize: 15
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 10
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 10
  },
  compactRoleRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 10
  },
  filterRow: {
    gap: 6,
    paddingRight: 8,
    marginTop: 10,
    marginBottom: 10
  },
  selectorButton: {
    minWidth: 96
  },
  compactSelectorButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 38,
    borderRadius: 14
  },
  compactSelectorText: {
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0,
    textAlign: 'center'
  },
  filterSelectorButton: {
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: 14
  },
  filterSelectorText: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
    textAlign: 'center'
  },
  selectorButtonText: {
    fontWeight: '900'
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  limitText: {
    fontSize: 12,
    fontWeight: '600'
  },
  limitBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden'
  },
  memberCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  inviteCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  memberName: {
    fontWeight: '800',
    fontSize: 14
  },
  memberMeta: {
    fontSize: 12
  },
  memberRole: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1
  },
  actionsRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 12
  },
  removeText: {
    fontWeight: '700'
  },
  actionText: {
    fontWeight: '700'
  },
  ownerCard: {
    marginBottom: 12
  },
  ownerLabel: {
    fontSize: 12,
    fontWeight: '700'
  },
  ownerName: {
    fontSize: 14,
    fontWeight: '800'
  },
  ownerMeta: {
    fontSize: 12
  },
  message: {
    marginTop: 12,
    fontWeight: '600'
  },
  auditRow: {
    marginBottom: 10
  },
  auditAction: {
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  auditMeta: {
    fontSize: 12
  },
  footerRow: {
    marginTop: 12
  }
});
