import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useI18n } from '../i18n';

function toIsoDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIsoDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export default function DateField({
  value,
  onChange,
  theme,
  placeholder = 'YYYY-MM-DD',
  disabled = false,
  minimumDate,
  maximumDate
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [iosDraftDate, setIosDraftDate] = useState(new Date());

  const pickerDate = useMemo(() => fromIsoDate(value) || new Date(), [value]);

  const openPicker = () => {
    if (disabled) return;
    setIosDraftDate(pickerDate);
    setVisible(true);
  };

  const handleAndroidChange = (_event, selectedDate) => {
    setVisible(false);
    if (!selectedDate) return;
    onChange?.(toIsoDate(selectedDate));
  };

  const commitIos = () => {
    onChange?.(toIsoDate(iosDraftDate));
    setVisible(false);
  };

  const shownValue = String(value || '').trim();

  return (
    <>
      <Pressable
        style={[
          styles.input,
          {
            borderColor: theme.border,
            backgroundColor: disabled ? theme.background : theme.inputBg
          }
        ]}
        onPress={openPicker}
        disabled={disabled}
      >
        <Text style={[styles.valueText, { color: shownValue ? theme.inputText : theme.muted }]}>
          {shownValue || t(placeholder)}
        </Text>
        <Text style={[styles.actionText, { color: theme.accent }]}>{t('Pick Date')}</Text>
      </Pressable>

      {visible && Platform.OS === 'android' ? (
        <DateTimePicker
          mode="date"
          value={pickerDate}
          display="default"
          onChange={handleAndroidChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      ) : null}

      {visible && Platform.OS === 'ios' ? (
        <Modal transparent animationType="fade" visible={visible}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{t('Pick Date')}</Text>
              <DateTimePicker
                mode="date"
                value={iosDraftDate}
                display="spinner"
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setIosDraftDate(selectedDate);
                }}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
              />
              <View style={styles.actionsRow}>
                <Pressable onPress={() => setVisible(false)}>
                  <Text style={[styles.btnText, { color: theme.muted }]}>{t('Cancel')}</Text>
                </Pressable>
                <Pressable onPress={commitIos}>
                  <Text style={[styles.btnText, { color: theme.accent }]}>{t('Done')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  valueText: {
    fontWeight: '700'
  },
  actionText: {
    fontWeight: '700',
    fontSize: 12
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  modalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12
  },
  modalTitle: {
    fontWeight: '800',
    marginBottom: 4
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 8,
    paddingHorizontal: 6,
    paddingBottom: 4
  },
  btnText: {
    fontWeight: '700'
  }
});
