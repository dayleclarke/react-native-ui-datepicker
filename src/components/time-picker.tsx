import React, { useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ScrollView,
  Text,
  I18nManager,
} from 'react-native';
import { useCalendarContext } from '../calendar-context';
import Wheel from './time-picker/wheel';
import { CONTAINER_HEIGHT } from '../enums';
import { formatNumber } from '../utils';
import { Numerals, PickerOption } from '../types';
import dayjs from 'dayjs';
import PeriodPicker from './time-picker/period-picker';

export type Period = 'AM' | 'PM';

const createNumberList = (
  num: number,
  numerals: Numerals,
  startFrom: number = 0
): PickerOption[] => {
  return Array.from({ length: num }, (_, i) => ({
    value: i + startFrom,
    text:
      i + startFrom < 10
        ? `${formatNumber(0, numerals)}${formatNumber(i + startFrom, numerals)}`
        : `${formatNumber(i + startFrom, numerals)}`,
  }));
};

const TimePicker = () => {
  const {
    currentDate,
    date,
    onSelectDate,
    styles,
    classNames,
    timeZone,
    numerals = 'latn',
    use12Hours,
  } = useCalendarContext();

  // Source of truth from parent
  const base = dayjs(date ?? currentDate);
  const hour24 = base.hour(); // 0..23
  const minute = base.minute(); // 0..59

  // 12h/24h derived
  const period: Period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour24 + 11) % 12) + 1; // 1..12
  const hourIndex12 = hour12 % 12; // 0..11 (12 -> 0)
  const hourIndex24 = hour24; // 0..23

  // Lists
  const hours = useMemo(() => {
    if (use12Hours) {
      return Array.from({ length: 12 }, (_, idx) => ({
        value: idx, // 0..11
        text:
          idx + 1 < 10
            ? `${formatNumber(0, numerals)}${formatNumber(idx + 1, numerals)}`
            : `${formatNumber(idx + 1, numerals)}`,
      }));
    }
    return Array.from({ length: 24 }, (_, h) => ({
      value: h,
      text:
        h < 10
          ? `${formatNumber(0, numerals)}${formatNumber(h, numerals)}`
          : `${formatNumber(h, numerals)}`,
    }));
  }, [numerals, use12Hours]);

  const minutes = useMemo(() => createNumberList(60, numerals), [numerals]);

  // Helper: 12h wheel index -> 24h hour using current period
  const indexTo24h = (idx: number, isPM: boolean) => {
    const i = Math.max(0, Math.min(11, idx));
    const val12 = ((i + 11) % 12) + 1; // 1..12 (0 => 12)
    if (isPM) return val12 === 12 ? 12 : val12 + 12;
    return val12 === 12 ? 0 : val12;
  };

  // Handlers — only update the part that changed
  const handleChangeHour = useCallback(
    (rawIndex: number) => {
      const b = (dayjs as any).tz
        ? (dayjs as any).tz((date ?? currentDate) as any, timeZone)
        : dayjs(date ?? currentDate);

      const isPM = hour24 >= 12;
      const h24 = use12Hours
        ? indexTo24h(rawIndex, isPM)
        : Math.max(0, Math.min(23, rawIndex));

      onSelectDate(b.hour(h24).minute(minute));
    },
    [date, currentDate, timeZone, use12Hours, onSelectDate, minute, hour24]
  );

  const handleChangeMinute = useCallback(
    (value: number) => {
      const b = (dayjs as any).tz
        ? (dayjs as any).tz((date ?? currentDate) as any, timeZone)
        : dayjs(date ?? currentDate);

      const m = Math.max(0, Math.min(59, value));
      onSelectDate(b.minute(m)); // minute-only
    },
    [date, currentDate, timeZone, onSelectDate]
  );

  const handlePeriodChange = useCallback(
    (newPeriod: Period) => {
      const b = (dayjs as any).tz
        ? (dayjs as any).tz((date ?? currentDate) as any, timeZone)
        : dayjs(date ?? currentDate);

      const h = b.hour(); // 0..23
      const cur12 = ((h + 11) % 12) + 1; // 1..12
      const newH =
        newPeriod === 'PM'
          ? cur12 === 12
            ? 12
            : cur12 + 12
          : cur12 === 12
            ? 0
            : cur12;

      onSelectDate(b.hour(newH));
    },
    [date, currentDate, timeZone, onSelectDate]
  );

  const timePickerContainerStyle: ViewStyle = useMemo(
    () => ({
      ...defaultStyles.timePickerContainer,
      flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    }),
    []
  );

  const timePickerTextStyle: TextStyle = useMemo(
    () => ({ ...defaultStyles.timeSeparator, ...styles?.time_label }),
    [styles?.time_label]
  );

  return (
    <ScrollView
      horizontal
      scrollEnabled={false}
      contentContainerStyle={defaultStyles.container}
      testID="time-selector"
    >
      <View style={timePickerContainerStyle}>
        <View style={defaultStyles.wheelContainer}>
          <Wheel
            value={use12Hours ? hourIndex12 : hourIndex24}
            items={hours}
            setValue={handleChangeHour}
            styles={styles}
            classNames={classNames}
          />
        </View>
        <Text style={timePickerTextStyle} className={classNames?.time_label}>
          :
        </Text>
        <View style={defaultStyles.wheelContainer}>
          <Wheel
            value={minute}
            items={minutes}
            setValue={handleChangeMinute}
            styles={styles}
            classNames={classNames}
          />
        </View>
      </View>

      {use12Hours ? (
        <View style={defaultStyles.periodContainer}>
          <PeriodPicker
            value={period}
            setValue={handlePeriodChange}
            styles={styles}
            classNames={classNames}
          />
        </View>
      ) : null}
    </ScrollView>
  );
};

const defaultStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wheelContainer: { flex: 1 },
  timePickerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CONTAINER_HEIGHT / 2,
    height: CONTAINER_HEIGHT / 2,
  },
  timeSeparator: { marginHorizontal: 5 },
  periodContainer: { marginLeft: 10 },
});

export default TimePicker;
