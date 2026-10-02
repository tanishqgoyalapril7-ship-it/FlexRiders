import React, { useEffect, useState } from 'react';
import { DatePickerField, TimePickerField, parseDate, toISODate } from '../../components/PickerFields';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { mobileApi } from '../../services/api';
import TargetAreaField from '../../components/TargetAreaField';
import { useStyles, useTheme } from '../../theme';
import { Card } from '../../components/ui';
import { Button, Header } from '../../components/ds';
import CampaignPlanner from '../../components/CampaignPlanner';
import { computeDurationDays, computeEndDate, formatINR } from '../../utils';

// Same choices as the admin's campaign form.
const VEHICLES = [
  { key: 'TWO_WHEELER', label: 'Bike / Two Wheeler', icon: 'bicycle-outline', sub: 'Highest reach & speed' },
  { key: 'CYCLE', label: 'Cycle', icon: 'bicycle', sub: 'Eco-friendly & hyper-local' },
  { key: 'AUTO', label: 'Auto Rickshaw', icon: 'car-sport-outline', sub: 'Prominent city branding' },
  { key: 'THREE_WHEELER', label: 'Three Wheeler', icon: 'car-outline', sub: 'High visibility transit' },
];
const CATEGORIES = [
  ['STANDARD', 'Standard'],
  ['BIKE', 'Bike'],
  ['CYCLE', 'Cycle'],
  ['AUTO', 'Auto'],
  ['TV', 'TV'],
  ['GOOGLE', 'Google'],
  ['BRAND_PARTNERSHIP', 'Brand Partnership'],
  ['OTHER', 'Other'],
];
const SLOTS = [
  ['MORNING', 'Morning'],
  ['EVENING', 'Evening'],
  ['NIGHT', 'Night'],
];
const DEFAULT_SLOTS = { MORNING: ['06:00', '11:00'], EVENING: ['12:00', '15:00'], NIGHT: ['17:00', '21:00'] };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function CustomerCreateWizardScreen({
  initialCampaign,
  onBack,
  onCampaignCreated,
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState(initialCampaign?.name || '');
  const [category, setCategory] = useState(initialCampaign?.campaign_category || 'STANDARD');
  const [objective, setObjective] = useState(initialCampaign?.campaign_objective || '');
  const [description, setDescription] = useState(initialCampaign?.description || '');

  // Locations array
  const [locations, setLocations] = useState(
    initialCampaign?.locations?.length
      ? initialCampaign.locations
      : [{ city: '', area: '', address: '', riders_count: initialCampaign?.required_riders || 1 }]
  );

  // Dates & Times
  // Local dates (IST on Indian phones), not UTC: just after midnight UTC is still "yesterday".
  const [startDate, setStartDate] = useState(initialCampaign?.start_date || toISODate(new Date()));
  const [endDate, setEndDate] = useState(initialCampaign?.end_date || toISODate(new Date(Date.now() + 14 * 86400000)));
  const [dailyStartTime, setDailyStartTime] = useState(initialCampaign?.daily_start_time || '09:00 AM');
  const [dailyEndTime, setDailyEndTime] = useState(initialCampaign?.daily_end_time || '06:00 PM');

  // Rider Requirements: eligible vehicle types (none selected = any vehicle), as in the admin form
  const [vehicles, setVehicles] = useState(() => {
    if (initialCampaign?.eligible_vehicle_categories) return initialCampaign.eligible_vehicle_categories;
    const one = initialCampaign?.rider_requirements?.vehicle_type;
    return one && one !== 'ANY' ? [one] : initialCampaign ? [] : ['TWO_WHEELER'];
  });
  const toggleVehicle = (key) => setVehicles((v) => (v.includes(key) ? v.filter((x) => x !== key) : [...v, key]));
  const [slots, setSlots] = useState(initialCampaign?.photo_slot_windows || DEFAULT_SLOTS);
  const setSlot = (slot, i, value) => setSlots((prev) => ({ ...prev, [slot]: prev[slot].map((t, j) => (j === i ? value : t)) }));
  const [banner, setBanner] = useState(null); // New banner picked here (uploaded after saving)
  const [drivingLicense, setDrivingLicense] = useState(initialCampaign?.rider_requirements?.driving_license_required !== false);
  const [experience, setExperience] = useState(initialCampaign?.rider_requirements?.experience || 'ANY');
  const [languages, setLanguages] = useState(initialCampaign?.rider_requirements?.languages || []);

  // Budget & Planner Configuration (Centralized single source of truth)
  const [minBudget, setMinBudget] = useState(10000);
  const [planningRate, setPlanningRate] = useState(500);
  const [budgetType, setBudgetType] = useState(initialCampaign?.budget_type || 'PER_DAY');
  const [expectedRate, setExpectedRate] = useState(String(initialCampaign?.expected_rider_rate || 500));
  const [estimatedBudget, setEstimatedBudget] = useState(String(initialCampaign?.estimated_budget || 10000));

  // Rules / requirements shown to riders (one per line), as in the admin form
  const [instructions, setInstructions] = useState(initialCampaign?.rules || initialCampaign?.instructions || '');

  // Geo target (a real place from the area search) and radius expansion settings.
  const g = initialCampaign?.geo;
  const [target, setTarget] = useState(g && g.targeted ? { label: g.target_label, lat: g.target_lat, lng: g.target_lng } : null);
  const [radius, setRadius] = useState({
    initial: g && g.targeted ? String(g.initial_radius_km ?? '') : '',
    max: g && g.targeted ? String(g.max_radius_km ?? '') : '',
    step: g && g.targeted ? String(g.expansion_step_km ?? '') : '',
    every: g && g.targeted ? String(g.expansion_interval_min ?? '') : '',
  });
  const pickTarget = async (place) => {
    setTarget(place);
    if (place && !radius.initial) {
      const d = await mobileApi.getGeoDefaults().catch(() => null);
      if (d) {
        setRadius({
          initial: String(d.initial_radius_km),
          max: String(d.max_radius_km),
          step: String(d.expansion_step_km),
          every: String(d.expansion_interval_min),
        });
      }
    }
  };
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const pickBanner = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [16, 9] });
    if (!result.canceled && result.assets && result.assets[0]) setBanner(result.assets[0]);
  };

  // Load centralized configuration from backend
  useEffect(() => {
    let mounted = true;
    mobileApi
      .getCustomerPlannerConfig()
      .then((cfg) => {
        if (mounted && cfg) {
          if (cfg.minimum_budget) setMinBudget(Number(cfg.minimum_budget));
          if (cfg.default_planning_rate) {
            setPlanningRate(Number(cfg.default_planning_rate));
            if (!initialCampaign?.expected_rider_rate) {
              setExpectedRate(String(cfg.default_planning_rate));
            }
          }
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const totalRiders = locations.reduce((sum, l) => sum + (Number(l.riders_count) || 0), 0);

  // Location helpers
  const updateLocation = (index, field, val) => {
    setLocations((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const addLocation = () => {
    setLocations((prev) => [...prev, { city: locations[0]?.city || '', area: '', address: '', riders_count: 1 }]);
  };

  const removeLocation = (index) => {
    if (locations.length === 1) return;
    setLocations((prev) => prev.filter((_, i) => i !== index));
  };

  // Synchronize planner's rider count with location distribution preserving proportions
  const updateRidersFromPlanner = (newTotalRiders) => {
    setLocations((prev) => {
      const validTotal = Math.max(1, Math.round(newTotalRiders));
      if (prev.length <= 1) {
        return [{ ...prev[0], riders_count: validTotal }];
      }
      const oldTotal = prev.reduce((sum, l) => sum + (Number(l.riders_count) || 0), 0);
      if (oldTotal <= 0) {
        const perLoc = Math.max(1, Math.floor(validTotal / prev.length));
        let allocated = 0;
        return prev.map((loc, idx) => {
          if (idx === prev.length - 1) {
            return { ...loc, riders_count: Math.max(1, validTotal - allocated) };
          }
          allocated += perLoc;
          return { ...loc, riders_count: perLoc };
        });
      }

      let allocated = 0;
      return prev.map((loc, idx) => {
        if (idx === prev.length - 1) {
          const remaining = Math.max(1, validTotal - allocated);
          return { ...loc, riders_count: remaining };
        }
        const proportional = Math.max(
          1,
          Math.round(((Number(loc.riders_count) || 1) / oldTotal) * validTotal)
        );
        allocated += proportional;
        return { ...loc, riders_count: proportional };
      });
    });
  };

  // Validation
  const validateStep = (s) => {
    if (s === 1) {
      if (!name.trim()) {
        Alert.alert('Required', 'Please enter a campaign name.');
        return false;
      }
      return true;
    }
    if (s === 2) {
      if (!target) {
        Alert.alert('Target area', 'Search and choose the campaign target area.');
        return false;
      }
      if (!(num(radius.initial) > 0)) {
        Alert.alert('Radius', 'Enter the initial radius in km.');
        return false;
      }
      if (num(radius.max) != null && num(radius.max) < num(radius.initial)) {
        Alert.alert('Radius', "Maximum radius can't be smaller than the initial radius.");
        return false;
      }
      if ((num(radius.step) == null) !== (num(radius.every) == null)) {
        Alert.alert('Radius', 'Set both the expansion step and how often it expands, or leave both empty.');
        return false;
      }
      if (locations.some((l) => (l.city.trim() || l.area.trim() || l.address.trim()) && (!l.city.trim() || !l.area.trim()))) {
        Alert.alert('Incomplete Location', 'Please provide city and area for each extra location, or remove it.');
        return false;
      }
      if (totalRiders <= 0) {
        Alert.alert('Required', 'Total rider count must be at least 1.');
        return false;
      }
      return true;
    }
    if (s === 3) {
      for (const [key, label] of SLOTS) {
        const [from, to] = slots[key];
        if (!HHMM.test(from) || !HHMM.test(to)) {
          Alert.alert('Photo slots', `Enter the ${label} slot as 24-hour times, e.g. 06:00 and 11:00.`);
          return false;
        }
        if (from >= to) {
          Alert.alert('Photo slots', `The ${label} slot must end after it starts.`);
          return false;
        }
      }
      if (slots.EVENING[0] < slots.MORNING[1] || slots.NIGHT[0] < slots.EVENING[1]) {
        Alert.alert('Photo slots', "Photo slots can't overlap: Morning, then Evening, then Night.");
        return false;
      }
      if (!startDate || !endDate) {
        Alert.alert('Required', 'Please specify start and end dates.');
        return false;
      }
      if (endDate < startDate) {
        Alert.alert('Invalid Date', 'End date must be on or after start date.');
        return false;
      }
      return true;
    }
    if (s === 5) {
      if (!(Number(expectedRate) > 0)) {
        Alert.alert('Rider payout', 'Enter the payout per rider per day (₹).');
        return false;
      }
      const budgetNum = Number(estimatedBudget) || 0;
      if (budgetNum < minBudget) {
        Alert.alert('Minimum Budget', `Minimum campaign budget is ${formatINR(minBudget)}.`);
        return false;
      }
      if (totalRiders <= 0) {
        Alert.alert('Required', 'Total rider count must be at least 1.');
        return false;
      }
      const dur = computeDurationDays(startDate, endDate);
      if (dur <= 0) {
        Alert.alert('Required', 'Campaign duration must be at least 1 day.');
        return false;
      }
      return true;
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep((prev) => Math.min(prev + 1, 7));
    }
  };

  const prevStep = () => {
    if (step > 1) setStep((prev) => prev - 1);
    else onBack();
  };

  const handleSave = async (submitNow = false) => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || (submitNow && !validateStep(5))) return;
    const onlyVehicle = vehicles.length === 1 ? vehicles[0] : 'ANY';

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        campaign_category: category,
        eligible_vehicle_categories: vehicles,
        photo_slot_windows: slots,
        campaign_objective: objective.trim() || undefined,
        description: description.trim() || undefined,
        start_date: startDate,
        end_date: endDate,
        daily_start_time: dailyStartTime,
        daily_end_time: dailyEndTime,
        total_riders: totalRiders,
        target_label: target ? target.label : undefined,
        target_lat: target ? target.lat : null,
        target_lng: target ? target.lng : null,
        initial_radius_km: target ? num(radius.initial) : null,
        max_radius_km: target ? num(radius.max) : null,
        expansion_step_km: target ? num(radius.step) : null,
        expansion_interval_min: target ? num(radius.every) : null,
        locations: locations.filter((l) => l.city.trim() && l.area.trim()).map((l) => ({
          city: l.city.trim(),
          area: l.area.trim(),
          address: l.address.trim() || undefined,
          riders_count: Number(l.riders_count) || 1,
        })),
        rider_requirements: {
          vehicle_type: onlyVehicle,
          driving_license_required: drivingLicense,
          experience,
          languages,
        },
        budget_type: budgetType,
        expected_rider_rate: Number(expectedRate) || undefined,
        estimated_budget: Number(estimatedBudget) || undefined,
        rules: instructions.trim(),
        instructions: instructions.trim() || undefined,
        submit: submitNow,
      };

      let result;
      if (initialCampaign?.id) {
        result = await mobileApi.updateCustomerCampaign(initialCampaign.id, payload);
      } else {
        result = await mobileApi.createCustomerCampaign(payload);
      }
      let bannerNote = '';
      if (banner && result?.id) {
        await mobileApi.uploadCustomerCampaignBanner(result.id, banner).catch((err) => {
          bannerNote = `\n\nThe banner didn't upload (${err.message}). You can add it by editing the campaign.`;
        });
      }

      Alert.alert(
        submitNow ? 'Campaign Submitted!' : 'Draft Saved',
        (submitNow
          ? `Campaign "${name}" has been submitted for review. Our team will verify specifications and confirm commercial terms.`
          : `Campaign draft "${name}" has been saved.`) + bannerNote,
        [{ text: 'OK', onPress: () => onCampaignCreated(result) }]
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save campaign');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={styles.headerWrap}>
        <Header
          title={initialCampaign ? 'Edit Campaign' : 'Create Campaign'}
          onBack={prevStep}
          right={<Text style={styles.stepBadge}>Step {step} of 7</Text>}
        />
        {/* Progress bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${(step / 7) * 100}%` }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* STEP 1: CAMPAIGN DETAILS */}
        {step === 1 && (
          <View>
            <Text style={styles.stepHeading}>Step 1: Campaign Details</Text>
            <Text style={styles.stepDesc}>Give your campaign a title, objective, and type.</Text>

            <Text style={styles.label}>Campaign Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Summer Soda City Blitz 2026"
              placeholderTextColor={colors.textSubtle}
            />

            <Text style={styles.label}>Campaign Category</Text>
            <View style={styles.chipsRow}>
              {CATEGORIES.map(([key, label]) => (
                <TouchableOpacity key={key} style={[styles.chip, category === key && styles.chipActive]} onPress={() => setCategory(key)}>
                  <Text style={[styles.chipText, category === key && styles.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Campaign Objective</Text>
            <TextInput
              style={styles.input}
              value={objective}
              onChangeText={setObjective}
              placeholder="e.g. Drive 10,000 product trial impressions"
              placeholderTextColor={colors.textSubtle}
            />

            <Text style={styles.label}>Detailed Description</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your promotion goals, target customer demographic, etc."
              placeholderTextColor={colors.textSubtle}
            />
          </View>
        )}

        {/* STEP 2: LOCATIONS */}
        {step === 2 && (
          <View>
            <Text style={styles.stepHeading}>Step 2: Target Area & Riders</Text>
            <Text style={styles.stepDesc}>Choose where the campaign runs. Riders nearest this area are offered it first; the radius grows if slots stay open.</Text>

            <Card style={styles.locCard}>
              <Text style={styles.label}>Campaign target location *</Text>
              <TargetAreaField value={target} onChange={pickTarget} />
              {target ? (
                <View style={styles.radiusGrid}>
                  {[
                    ['initial', 'Initial radius (km) *'],
                    ['max', 'Maximum radius (km)'],
                    ['step', 'Expand by (km)'],
                    ['every', 'Every (minutes)'],
                  ].map(([key, label]) => (
                    <View key={key} style={styles.radiusCell}>
                      <Text style={styles.label}>{label}</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="decimal-pad"
                        value={radius[key]}
                        onChangeText={(v) => setRadius((r) => ({ ...r, [key]: v.replace(/[^0-9.]/g, '') }))}
                        placeholderTextColor={colors.textSubtle}
                      />
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
            <Text style={[styles.stepDesc, { marginTop: 8 }]}>Riders needed per area:</Text>

            {locations.map((loc, idx) => (
              <Card key={idx} style={styles.locCard}>
                <View style={styles.locCardHeader}>
                  <Text style={styles.locNum}>Location #{idx + 1}</Text>
                  {locations.length > 1 && (
                    <TouchableOpacity onPress={() => removeLocation(idx)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.label}>City *</Text>
                <TextInput
                  style={styles.input}
                  value={loc.city}
                  onChangeText={(v) => updateLocation(idx, 'city', v)}
                  placeholder="e.g. Delhi, Gurugram, Mumbai"
                  placeholderTextColor={colors.textSubtle}
                />

                <Text style={styles.label}>Area / Zone *</Text>
                <TextInput
                  style={styles.input}
                  value={loc.area}
                  onChangeText={(v) => updateLocation(idx, 'area', v)}
                  placeholder="e.g. Connaught Place, Cyber City, Bandra"
                  placeholderTextColor={colors.textSubtle}
                />

                <Text style={styles.label}>Landmark / Focus Corridor</Text>
                <TextInput
                  style={styles.input}
                  value={loc.address || ''}
                  onChangeText={(v) => updateLocation(idx, 'address', v)}
                  placeholder="e.g. Metro Station, Market Road"
                  placeholderTextColor={colors.textSubtle}
                />

                <Text style={styles.label}>Riders Needed</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={String(loc.riders_count || 1)}
                  onChangeText={(v) => updateLocation(idx, 'riders_count', v.replace(/\D/g, ''))}
                  placeholder="e.g. 5"
                  placeholderTextColor={colors.textSubtle}
                />
              </Card>
            ))}

            <TouchableOpacity style={styles.addBtn} onPress={addLocation}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.addBtnText}>+ Add Another Location</Text>
            </TouchableOpacity>

            <View style={styles.summaryBar}>
              <Text style={styles.summaryBarLabel}>Total Required Riders:</Text>
              <Text style={styles.summaryBarValue}>{totalRiders} Riders</Text>
            </View>
          </View>
        )}

        {/* STEP 3: SCHEDULE */}
        {step === 3 && (
          <View>
            <Text style={styles.stepHeading}>Step 3: Campaign Schedule</Text>
            <Text style={styles.stepDesc}>Set running dates and daily operating time windows.</Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <DatePickerField
                  label="Start Date"
                  required
                  value={startDate}
                  minimumDate={new Date(new Date().setHours(0, 0, 0, 0))}
                  onChange={(d) => {
                    setStartDate(d);
                    if (!endDate || endDate < d) setEndDate(d); // The end can't be before the start
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DatePickerField label="End Date" required value={endDate} minimumDate={parseDate(startDate) || undefined} onChange={setEndDate} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <TimePickerField label="Daily Start Time" value={dailyStartTime} onChange={setDailyStartTime} placeholder="09:00 AM" />
              </View>
              <View style={{ flex: 1 }}>
                <TimePickerField label="Daily End Time" value={dailyEndTime} onChange={setDailyEndTime} placeholder="06:00 PM" />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Daily Photo Slots (IST)</Text>
            <Text style={styles.stepDesc}>Riders upload one photo in each window every day. Tap a time to change it.</Text>
            {SLOTS.map(([key, label]) => (
              <View key={key} style={styles.slotRow}>
                <Text style={styles.slotName}>{label}</Text>
                {[0, 1].map((i) => (
                  <View key={i} style={styles.slotInput}>
                    <TimePickerField
                      compact
                      label={i === 0 ? `${label} from` : `${label} until`}
                      hideLabel
                      format="24h"
                      value={slots[key][i]}
                      onChange={(v) => setSlot(key, i, v)}
                      placeholder={DEFAULT_SLOTS[key][i]}
                    />
                  </View>
                ))}
              </View>
            ))}

            <View style={[styles.summaryBar, { marginTop: 16 }]}>
              <Text style={styles.summaryBarLabel}>Campaign Duration:</Text>
              <Text style={styles.summaryBarValue}>
                {computeDurationDays(startDate, endDate)} Days
              </Text>
            </View>
          </View>
        )}

        {/* STEP 4: RIDER REQUIREMENTS (Canonical vehicles only) */}
        {step === 4 && (
          <View>
            <Text style={styles.stepHeading}>Step 4: Fleet & Rider Criteria</Text>
            <Text style={styles.stepDesc}>Select allowable vehicle categories and rider requirements.</Text>

            <Text style={styles.label}>Eligible Vehicle Types</Text>
            <Text style={styles.stepDesc}>Choose one or more. Leave all unticked to allow any vehicle.</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              {VEHICLES.map((v) => {
                const selected = vehicles.includes(v.key);
                return (
                  <TouchableOpacity
                    key={v.key}
                    style={[styles.vehicleCard, selected && styles.vehicleCardActive]}
                    onPress={() => toggleVehicle(v.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={v.icon} size={22} color={selected ? colors.primary : colors.textMuted} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.vehicleTitle, selected && { color: colors.primary }]}>{v.label}</Text>
                      <Text style={styles.vehicleSub}>{v.sub}</Text>
                    </View>
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? colors.primary : colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Driving License</Text>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setDrivingLicense(!drivingLicense)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={drivingLicense ? 'checkbox' : 'square-outline'}
                size={22}
                color={drivingLicense ? colors.primary : colors.textMuted}
              />
              <Text style={styles.checkText}>Rider must hold a valid Driving Licence (DL)</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { marginTop: 16 }]}>Rider Experience Level</Text>
            <View style={styles.chipsRow}>
              {[
                { key: 'ANY', label: 'Any Experience' },
                { key: 'FRESHER', label: 'Freshers Ok' },
                { key: '6_MONTHS', label: '6+ Months' },
                { key: '1_YEAR', label: '1+ Year' },
              ].map((exp) => (
                <TouchableOpacity
                  key={exp.key}
                  style={[styles.chip, experience === exp.key && styles.chipActive]}
                  onPress={() => setExperience(exp.key)}
                >
                  <Text style={[styles.chipText, experience === exp.key && styles.chipTextActive]}>{exp.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* STEP 5: CAMPAIGN PLANNER */}
        {step === 5 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.label}>Daily Rider Payout (₹) *</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={expectedRate}
              onChangeText={(v) => setExpectedRate(v.replace(/\D/g, ''))}
              placeholder="e.g. 500"
              placeholderTextColor={colors.textSubtle}
            />
            <Text style={styles.stepDesc}>What each rider earns per approved day. FlexRiders confirms it when approving your campaign.</Text>
          </View>
        )}
        {step === 5 && (
          <CampaignPlanner
            budget={Number(estimatedBudget) || 10000}
            riders={totalRiders || 2}
            duration={computeDurationDays(startDate, endDate)}
            startDate={startDate}
            endDate={endDate}
            onBudgetChange={(b) => setEstimatedBudget(String(b))}
            onRidersChange={(r) => updateRidersFromPlanner(r)}
            onDurationChange={(d, newEnd) => {
              if (newEnd) setEndDate(newEnd);
            }}
            onSync={({ budget: b, riders: r, duration: d, endDate: newEnd }) => {
              setEstimatedBudget(String(b));
              updateRidersFromPlanner(r);
              if (newEnd) setEndDate(newEnd);
            }}
          />
        )}

        {/* STEP 6: INSTRUCTIONS */}
        {step === 6 && (
          <View>
            <Text style={styles.stepHeading}>Step 6: Rules & Banner</Text>
            <Text style={styles.stepDesc}>Riders see these rules before they join. Put one rule on each line.</Text>

            <Text style={styles.label}>Rules / Requirements</Text>
            <TextInput
              style={[styles.input, { height: 140, textAlignVertical: 'top', paddingTop: 10 }]}
              multiline
              value={instructions}
              onChangeText={setInstructions}
              placeholder={'e.g. Wear the campaign T-shirt\nRide at least 4 hours a day\nFocus on market areas'}
              placeholderTextColor={colors.textSubtle}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Campaign Banner (optional)</Text>
            <TouchableOpacity style={styles.bannerBox} onPress={pickBanner} activeOpacity={0.85}>
              {banner || initialCampaign?.image_url ? (
                <Image source={{ uri: banner ? banner.uri : initialCampaign.image_url }} style={styles.bannerImg} resizeMode="cover" />
              ) : (
                <>
                  <Ionicons name="image-outline" size={28} color={colors.primary} />
                  <Text style={styles.addBtnText}>Add a banner image</Text>
                  <Text style={styles.vehicleSub}>JPG or PNG, up to 8 MB</Text>
                </>
              )}
            </TouchableOpacity>
            {banner || initialCampaign?.image_url ? (
              <TouchableOpacity onPress={pickBanner} style={{ alignSelf: 'center', marginTop: 8 }}>
                <Text style={styles.addBtnText}>Change banner</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* STEP 7: REVIEW & SUBMIT */}
        {step === 7 && (
          <View>
            <Text style={styles.stepHeading}>Step 7: Review & Confirm</Text>
            <Text style={styles.stepDesc}>Review your campaign details before submitting.</Text>

            <Card style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>{name}</Text>
              <Text style={styles.reviewType}>{objective || 'No objective given'}</Text>

              <View style={styles.reviewDivider} />

              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Schedule</Text>
                <Text style={styles.reviewVal}>
                  {startDate} to {endDate} ({computeDurationDays(startDate, endDate)} Days)
                </Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Operating Hours</Text>
                <Text style={styles.reviewVal}>{dailyStartTime} - {dailyEndTime}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Locations & Riders</Text>
                <Text style={styles.reviewVal}>
                  {locations.length} areas, {totalRiders} riders ({totalRiders * computeDurationDays(startDate, endDate)} Rider-Days)
                </Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Category</Text>
                <Text style={styles.reviewVal}>{(CATEGORIES.find(([k]) => k === category) || [null, 'Standard'])[1]}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Eligible Vehicles</Text>
                <Text style={styles.reviewVal}>{vehicles.length ? VEHICLES.filter((v) => vehicles.includes(v.key)).map((v) => v.label).join(', ') : 'Any vehicle'}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Rider Payout</Text>
                <Text style={styles.reviewVal}>{formatINR(Number(expectedRate) || 0)} / day</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Photo Slots</Text>
                <Text style={styles.reviewVal}>{SLOTS.map(([k, l]) => `${l} ${slots[k][0]}–${slots[k][1]}`).join(' · ')}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Rules</Text>
                <Text style={styles.reviewVal}>{instructions.split('\n').filter((l) => l.trim()).length || 'None'}{instructions.trim() ? ' listed' : ''}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Banner</Text>
                <Text style={styles.reviewVal}>{banner || initialCampaign?.image_url ? 'Added' : 'None'}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewKey}>Estimated Budget</Text>
                <Text style={[styles.reviewVal, { color: colors.primary, fontWeight: '700' }]}>
                  {formatINR(Number(estimatedBudget) || 0)}
                </Text>
              </View>
            </Card>

            <View style={styles.disclaimerBox}>
              <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
              <Text style={styles.disclaimerText}>
                When submitted, our operations team will review your parameters, verify slot availability, and confirm final commercial terms.
              </Text>
            </View>

            <Button label="Submit Campaign for Review" onPress={() => handleSave(true)} loading={submitting} style={{ marginTop: 16 }} />
            <Button label="Save as Draft" tone="outline" onPress={() => handleSave(false)} disabled={submitting} style={{ marginTop: 12 }} />
          </View>
        )}

        {/* Action Buttons for Steps 1 - 6 */}
        {step < 7 && (
          <View style={styles.btnRow}>
            {step > 1 && <Button label="Back" tone="outline" onPress={prevStep} style={{ flex: 1 }} />}
            <Button label="Continue" onPress={nextStep} style={{ flex: 2 }} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const specStyles = {
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  slotName: { width: 72, fontSize: 14, fontWeight: '700' },
  slotInput: { flex: 1, textAlign: 'center' },
  bannerBox: { height: 160, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', marginTop: 6 },
  bannerImg: { width: '100%', height: '100%' },
};

const radiusStyles = {
  radiusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  radiusCell: { width: '47%', flexGrow: 1 },
};

const makeStyles = (colors) =>
  StyleSheet.create({
    ...radiusStyles,
    ...specStyles,
    slotName: { ...specStyles.slotName, color: colors.text },
    bannerBox: { ...specStyles.bannerBox, borderColor: colors.primary, backgroundColor: colors.surface },
    screen: { flex: 1, backgroundColor: colors.background },
    headerWrap: { paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 10 },
    stepBadge: { fontSize: 13, fontWeight: '700', color: colors.primary },
    progressBarBg: { height: 4, backgroundColor: colors.surfaceAlt, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
    content: { padding: 16, paddingBottom: 40 },
    stepHeading: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 4 },
    stepDesc: { fontSize: 13, color: colors.textMuted, marginBottom: 20 },
    label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 12 },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
      fontSize: 14,
      color: colors.text,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 14,
      backgroundColor: colors.surfaceAlt,
    },
    chipActive: { backgroundColor: colors.primary },
    chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
    chipTextActive: { color: colors.onPrimary, fontWeight: '700' },
    locCard: { padding: 14, borderRadius: 12, marginBottom: 12 },
    locCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    locNum: { fontSize: 14, fontWeight: '700', color: colors.primary },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      marginTop: 4,
    },
    addBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    summaryBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      marginTop: 14,
    },
    summaryBarLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },
    summaryBarValue: { fontSize: 15, fontWeight: '800', color: colors.primary },
    vehicleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    vehicleCardActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    vehicleTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    vehicleSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
    checkText: { fontSize: 13, color: colors.text, flex: 1 },
    disclaimerBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.primarySoft,
      padding: 12,
      borderRadius: 12,
      marginVertical: 12,
    },
    disclaimerTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 2 },
    disclaimerText: { fontSize: 12, color: colors.primary, lineHeight: 16 },
    reviewCard: { padding: 16, borderRadius: 14 },
    reviewTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
    reviewType: { fontSize: 13, color: colors.textMuted },
    reviewDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    reviewKey: { fontSize: 13, color: colors.textMuted },
    reviewVal: { fontSize: 13, fontWeight: '600', color: colors.text },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  });
