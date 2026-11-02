import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { Card } from './ui';
import { computeDurationDays, computeEndDate, formatDateRange, formatINR } from '../utils';

const BUDGET_PRESETS = [10000, 25000, 50000, 100000];
const DURATION_PRESETS = [7, 14, 21, 30];

/** Whole-number field that can be typed into; commits when editing ends, so clearing it to retype works. */
function NumberInput({ value, min = 1, onCommit, style }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const commit = () => {
    setFocused(false);
    const n = parseInt(text, 10);
    if (Number.isFinite(n) && n >= min) onCommit(n);
    else setText(String(value));
  };
  return (
    <TextInput
      style={style}
      keyboardType="number-pad"
      value={text}
      onFocus={() => setFocused(true)}
      onChangeText={(t) => setText(t.replace(/\D/g, ''))}
      onEndEditing={commit}
      onSubmitEditing={commit}
      selectTextOnFocus
    />
  );
}

/**
 * CampaignPlanner: the brand enters Budget, Riders and Duration independently; nothing is auto-calculated.
 * The rider payout per day is not the brand's to set: FlexRiders' team sets it when approving the campaign.
 */
export default function CampaignPlanner({
  budget = 10000,
  riders = 1,
  duration = 1,
  startDate,
  endDate,
  onBudgetChange,
  onRidersChange,
  onDurationChange,
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  // Minimum budget from the backend's planner config.
  const [minBudget, setMinBudget] = useState(10000);

  useEffect(() => {
    let mounted = true;
    mobileApi
      .getCustomerPlannerConfig()
      .then((cfg) => {
        if (mounted && cfg?.minimum_budget) setMinBudget(Number(cfg.minimum_budget));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Ensure whole positive integers
  const curBudget = Math.max(0, Math.round(Number(budget) || 0));
  const curRiders = Math.max(1, Math.round(Number(riders) || 1));
  const curDuration = Math.max(1, Math.round(Number(duration) || 1));

  const isBudgetValid = curBudget >= minBudget;
  const riderDays = curRiders * curDuration;

  const handleBudgetInput = (text) => {
    const rawVal = text.replace(/\D/g, '');
    onBudgetChange(rawVal ? parseInt(rawVal, 10) : 0);
  };

  const handleDurationChange = (newDur) => {
    const validDur = Math.max(1, Math.round(newDur));
    onDurationChange(validDur, computeEndDate(startDate, validDur));
  };

  const handleRidersChange = (newRiders) => {
    onRidersChange(Math.max(1, Math.round(newRiders)));
  };

  return (
    <View style={styles.container}>
      {/* Title & Subtitle */}
      <View style={styles.header}>
        <View style={styles.headerBadge}>
          <Ionicons name="calculator-outline" size={14} color={colors.primary} />
          <Text style={styles.headerBadgeText}>CAMPAIGN PLANNER</Text>
        </View>
        <Text style={styles.title}>Plan Budget & Fleet</Text>
        <Text style={styles.subtitle}>
          Enter your budget, the number of riders and how many days the campaign runs.
        </Text>
      </View>

      {/* Minimum budget error banner if below minBudget */}
      {!isBudgetValid && (
        <View style={styles.alertBox}>
          <Ionicons name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.alertText}>
            Minimum campaign budget is {formatINR(minBudget)}.
          </Text>
        </View>
      )}

      {/* 1. CAMPAIGN BUDGET CARD */}
      <Card style={[styles.card, !isBudgetValid && styles.cardError]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>CAMPAIGN BUDGET</Text>
          <View style={styles.activeDriverBadge}>
            <Text style={styles.activeDriverText}>Total Spend Target</Text>
          </View>
        </View>

        <View style={styles.budgetInputRow}>
          <Text style={styles.currencySymbol}>₹</Text>
          <TextInput
            style={styles.budgetInput}
            keyboardType="number-pad"
            value={curBudget ? String(curBudget) : ''}
            onChangeText={handleBudgetInput}
            placeholder="10000"
            placeholderTextColor={colors.textSubtle}
          />
        </View>

        {/* Quick Budget Chips */}
        <View style={styles.presetRow}>
          {BUDGET_PRESETS.map((amt) => {
            const selected = curBudget === amt;
            return (
              <TouchableOpacity
                key={amt}
                style={[styles.presetChip, selected && styles.presetChipActive]}
                onPress={() => onBudgetChange(amt)}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, selected && styles.presetChipTextActive]}>
                  {formatINR(amt)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* 2. RIDERS CARD */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.fieldTitleRow}>
            <Ionicons name="people" size={18} color={colors.primary} />
            <Text style={styles.cardLabel}>RIDERS</Text>
          </View>
        </View>

        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={[styles.stepperBtn, curRiders <= 1 && styles.stepperBtnDisabled]}
            disabled={curRiders <= 1}
            onPress={() => handleRidersChange(curRiders - 1)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="remove"
              size={22}
              color={curRiders <= 1 ? colors.textSubtle : colors.primary}
            />
          </TouchableOpacity>

          <View style={styles.valueDisplay}>
            <NumberInput style={styles.valueNumber} value={curRiders} onCommit={handleRidersChange} />
            <Text style={styles.valueUnit}>Riders</Text>
          </View>

          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => handleRidersChange(curRiders + 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.cardHint}>
          Riders working each day, split across your selected locations.
        </Text>
      </Card>

      {/* 3. CAMPAIGN DURATION CARD */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.fieldTitleRow}>
            <Ionicons name="calendar" size={18} color={colors.primary} />
            <Text style={styles.cardLabel}>CAMPAIGN DURATION</Text>
          </View>
        </View>

        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={[styles.stepperBtn, curDuration <= 1 && styles.stepperBtnDisabled]}
            disabled={curDuration <= 1}
            onPress={() => handleDurationChange(curDuration - 1)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="remove"
              size={22}
              color={curDuration <= 1 ? colors.textSubtle : colors.primary}
            />
          </TouchableOpacity>

          <View style={styles.valueDisplay}>
            <NumberInput style={styles.valueNumber} value={curDuration} onCommit={handleDurationChange} />
            <Text style={styles.valueUnit}>Days Active</Text>
          </View>

          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => handleDurationChange(curDuration + 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Quick Duration Chips */}
        <View style={[styles.presetRow, { marginTop: 12 }]}>
          {DURATION_PRESETS.map((d) => {
            const selected = curDuration === d;
            return (
              <TouchableOpacity
                key={d}
                style={[styles.presetChip, selected && styles.presetChipActive]}
                onPress={() => handleDurationChange(d)}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetChipText, selected && styles.presetChipTextActive]}>
                  {d} Days
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {startDate && endDate && (
          <View style={styles.dateSyncRow}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={styles.dateSyncText}>
              Campaign dates: {formatDateRange(startDate, endDate)}
            </Text>
          </View>
        )}
      </Card>

      {/* 4. LIVE CAMPAIGN SUMMARY */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Ionicons name="flash-outline" size={16} color={colors.primary} />
          <Text style={styles.summaryTitle}>LIVE CAMPAIGN SUMMARY</Text>
        </View>

        <View style={styles.summaryDivider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Riders</Text>
          <Text style={styles.summaryVal}>{curRiders} Riders</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Duration</Text>
          <Text style={styles.summaryVal}>{curDuration} Days</Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Rider-Days</Text>
          <Text style={styles.summaryVal}>{riderDays} Days</Text>
        </View>

        <View style={[styles.summaryRow, styles.summaryRowTotal]}>
          <Text style={styles.summaryKeyBold}>Campaign Budget</Text>
          <Text style={styles.summaryValBold}>{formatINR(curBudget)}</Text>
        </View>
      </Card>

      <View style={styles.rateNotice}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rateNoticeSub}>
            The rider payout per day is set by FlexRiders when we approve your campaign. Our team confirms the final terms with you.
          </Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      gap: 12,
    },
    header: {
      marginBottom: 4,
    },
    headerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginBottom: 6,
    },
    headerBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 0.6,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 18,
    },
    alertBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.dangerSoft,
      borderColor: colors.danger,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    alertText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '700',
      flex: 1,
    },
    card: {
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    cardError: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    fieldTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardLabel: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.textSubtle,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    activeDriverBadge: {
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    activeDriverText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    budgetInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      gap: 4,
    },
    currencySymbol: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.primary,
    },
    budgetInput: {
      fontSize: 34,
      fontWeight: '800',
      color: colors.text,
      minWidth: 150,
      textAlign: 'center',
      paddingVertical: 0,
    },
    presetRow: {
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'center',
      marginTop: 8,
      flexWrap: 'wrap',
    },
    presetChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    presetChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    presetChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
    },
    presetChipTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    stepperContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    stepperBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepperBtnDisabled: {
      opacity: 0.4,
    },
    valueDisplay: {
      alignItems: 'center',
      flex: 1,
    },
    valueNumber: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      minWidth: 72,
      paddingVertical: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    valueUnit: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
      marginTop: 2,
    },
    cardHint: {
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 8,
      textAlign: 'center',
    },
    dateSyncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    dateSyncText: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: '600',
    },
    summaryCard: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 6,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    summaryTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.8,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 10,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 4,
    },
    summaryRowTotal: {
      paddingTop: 8,
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    summaryKey: {
      fontSize: 13,
      color: colors.textMuted,
    },
    summaryVal: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    summaryValPrimary: {
      color: colors.primary,
      fontWeight: '700',
    },
    summaryKeyBold: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
    },
    summaryValBold: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.primary,
    },
    rateNotice: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    rateNoticeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      lineHeight: 16,
    },
    rateNoticeSub: {
      fontSize: 10,
      color: colors.textSubtle,
      marginTop: 2,
      lineHeight: 14,
    },
  });
