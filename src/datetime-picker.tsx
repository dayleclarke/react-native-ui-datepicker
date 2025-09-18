import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { I18nManager } from 'react-native';
import {
  dateToUnix,
  getEndOfDay,
  areDatesOnSameDay,
  removeTime,
} from './utils';
import { CalendarContext } from './calendar-context';
import {
  CalendarViews,
  CalendarActionKind,
  CONTAINER_HEIGHT,
  WEEKDAYS_HEIGHT,
} from './enums';
import type {
  DateType,
  CalendarAction,
  LocalState,
  DatePickerBaseProps,
  SingleChange,
  RangeChange,
  MultiChange,
} from './types';
import Calendar from './components/calendar';
import { useDeepCompareMemo } from './utils';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import relativeTime from 'dayjs/plugin/relativeTime';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import duration from 'dayjs/plugin/duration';
import { usePrevious } from './hooks/use-previous';
import jalaliday from 'jalali-plugin-dayjs';

dayjs.extend(localeData);
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration);
dayjs.extend(jalaliday);

const isSameMinute = (a: dayjs.Dayjs, b: dayjs.Dayjs) =>
  a.year() === b.year() &&
  a.month() === b.month() &&
  a.date() === b.date() &&
  a.hour() === b.hour() &&
  a.minute() === b.minute();

const defer = (fn: () => void) => {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else setTimeout(fn, 0);
};

export interface DatePickerSingleProps extends DatePickerBaseProps {
  mode: 'single';
  date?: DateType;
  onChange?: SingleChange;
}

export interface DatePickerRangeProps extends DatePickerBaseProps {
  mode: 'range';
  startDate?: DateType;
  endDate?: DateType;
  onChange?: RangeChange;
}

export interface DatePickerMultipleProps extends DatePickerBaseProps {
  mode: 'multiple';
  dates?: DateType[];
  onChange?: MultiChange;
}

const DateTimePicker = (
  props: DatePickerSingleProps | DatePickerRangeProps | DatePickerMultipleProps
) => {
  const {
    mode = 'single',
    calendar = 'gregory',
    locale = 'en',
    numerals = 'latn',
    timeZone,
    showOutsideDays = false,
    timePicker = false,
    firstDayOfWeek,
    // startYear,
    // endYear,
    minDate,
    maxDate,
    enabledDates,
    disabledDates,
    date,
    startDate,
    endDate,
    dates,
    min,
    max,
    onChange,
    initialView = 'day',
    containerHeight = CONTAINER_HEIGHT,
    weekdaysHeight = WEEKDAYS_HEIGHT,
    style = {},
    className = '',
    classNames = {},
    styles = {},
    navigationPosition,
    weekdaysFormat = 'min',
    monthsFormat = 'full',
    monthCaptionFormat = 'full',
    multiRangeMode,
    hideHeader,
    hideWeekdays,
    disableMonthPicker,
    disableYearPicker,
    components = {},
    month,
    year,
    onMonthChange = () => {},
    onYearChange = () => {},
    use12Hours,
  } = props;

  const withTZ = useCallback(
    (d: dayjs.Dayjs | Date | string | number | null | undefined) =>
      dayjs.isDayjs(d) ? d.tz(timeZone, true) : dayjs.tz(d as any, timeZone),
    [timeZone]
  );

  // Apply global dayjs config only when inputs change
  useEffect(() => {
    if (timeZone) dayjs.tz.setDefault(timeZone);
    if ((dayjs as any).calendar && calendar) (dayjs as any).calendar(calendar);
    if (locale) dayjs.locale(locale);
  }, [timeZone, calendar, locale]);

  const prevTimezone = usePrevious(timeZone);
  const userChangeRef = useRef(false); // blocks effect while wheels update
  const selectSeqRef = useRef(0);

  const initialCalendarView: CalendarViews = useMemo(
    () => (mode !== 'single' && initialView === 'time' ? 'day' : initialView),
    [mode, initialView]
  );

  const firstDay = useMemo(
    () =>
      firstDayOfWeek && firstDayOfWeek > 0 && firstDayOfWeek <= 6
        ? firstDayOfWeek
        : 0,
    [firstDayOfWeek]
  );

  const initialState: LocalState = useMemo(() => {
    let initialDate = dayjs().tz(timeZone);

    if (mode === 'single' && date) initialDate = withTZ(date);
    if (mode === 'range' && startDate) initialDate = withTZ(startDate);
    if (mode === 'multiple' && dates && dates.length > 0)
      initialDate = withTZ(dates[0]);
    if (minDate && initialDate.isBefore(minDate)) initialDate = withTZ(minDate);
    if (month !== undefined && month && month >= 0 && month <= 11)
      initialDate = initialDate.tz(timeZone, true).month(month);
    if (year !== undefined && year >= 0)
      initialDate = initialDate.tz(timeZone, true).year(year);
    let _date = (date ? withTZ(date as any) : date) as DateType;
    if (_date && maxDate && withTZ(_date).isAfter(maxDate))
      _date = withTZ(maxDate);
    if (_date && minDate && withTZ(_date).isBefore(minDate))
      _date = withTZ(minDate);

    let start = (startDate ? withTZ(startDate as any) : startDate) as DateType;
    if (start && maxDate && withTZ(start as any).isAfter(maxDate))
      start = withTZ(maxDate as any);
    if (start && minDate && withTZ(start as any).isBefore(minDate))
      start = withTZ(minDate as any);

    let end = (endDate ? withTZ(endDate) : endDate) as DateType;
    if (end && maxDate && withTZ(end as any).isAfter(maxDate))
      end = withTZ(maxDate as any);
    if (end && minDate && withTZ(end as any).isBefore(minDate))
      end = withTZ(minDate as any);

    return {
      date: _date,
      startDate: start,
      endDate: end,
      dates,
      calendarView: initialCalendarView,
      currentDate: initialDate,
      currentYear: initialDate.year(),
      isRTL: calendar === 'jalali' || I18nManager.isRTL,
    };
  }, [
    timeZone,
    mode,
    date,
    withTZ,
    startDate,
    dates,
    minDate,
    month,
    year,
    maxDate,
    endDate,
    initialCalendarView,
    calendar,
  ]);

  const [timeSeed, setTimeSeed] = useState<{
    hour: number;
    minute: number;
  } | null>(null);
  const lastNonZeroTimeRef = useRef<{ hour: number; minute: number } | null>(
    null
  );

  const [state, dispatch] = useReducer(
    (prevState: LocalState, action: CalendarAction) => {
      switch (action.type) {
        case CalendarActionKind.SET_CALENDAR_VIEW:
          return {
            ...prevState,
            calendarView: action.payload,
          };
        case CalendarActionKind.CHANGE_CURRENT_DATE:
          return {
            ...prevState,
            currentDate: action.payload,
          };
        case CalendarActionKind.CHANGE_CURRENT_YEAR:
          return {
            ...prevState,
            currentYear: action.payload,
          };
        case CalendarActionKind.CHANGE_SELECTED_DATE:
          return {
            ...prevState,
            date: action.payload.date,
            currentDate: action.payload.date ?? prevState.currentDate,
          };
        case CalendarActionKind.CHANGE_SELECTED_RANGE:
          return {
            ...prevState,
            startDate: action.payload.startDate,
            endDate: action.payload.endDate,
          };
        case CalendarActionKind.CHANGE_SELECTED_MULTIPLE:
          return { ...prevState, dates: action.payload.dates };
        case CalendarActionKind.SET_IS_RTL:
          return { ...prevState, isRTL: action.payload };
        case CalendarActionKind.RESET_STATE:
          return action.payload;
        default:
          return prevState;
      }
    },
    initialState
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const newState = {
      ...initialState,
      isRTL: calendar === 'jalali' || I18nManager.isRTL,
    };
    defer(() => {
      dispatch({ type: CalendarActionKind.RESET_STATE, payload: newState });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar]);

  useEffect(() => {
    if (prevTimezone !== timeZone) {
      const newDate = dayjs().tz(timeZone);
      defer(() => {
        dispatch({
          type: CalendarActionKind.CHANGE_CURRENT_DATE,
          payload: newDate,
        });
      });
    }
  }, [timeZone, prevTimezone]);

  useEffect(() => {
    if (mode === 'single') {
      if (userChangeRef.current) {
        return;
      }
      if (typeof date === 'undefined') {
        return;
      }

      let next = withTZ(date);
      if (maxDate && next.isAfter(maxDate)) next = withTZ(maxDate);
      if (minDate && next.isBefore(minDate)) next = withTZ(minDate);
      const cur = withTZ(stateRef.current.date ?? stateRef.current.currentDate);
      if (isSameMinute(cur, next)) {
        return;
      }

      defer(() => {
        dispatch({
          type: CalendarActionKind.CHANGE_SELECTED_DATE,
          payload: { date: next },
        });
      });
    } else if (mode === 'range') {
      let start = (startDate ? withTZ(startDate) : startDate) as DateType;
      if (start && maxDate && withTZ(start as any).isAfter(maxDate))
        start = withTZ(maxDate as any);
      if (start && minDate && withTZ(start as any).isBefore(minDate))
        start = withTZ(minDate as any);

      let end = (endDate ? withTZ(endDate) : endDate) as DateType;
      if (end && maxDate && withTZ(end as any).isAfter(maxDate))
        end = withTZ(maxDate as any);
      if (end && minDate && withTZ(end as any).isBefore(minDate))
        end = withTZ(minDate as any);

      defer(() => {
        dispatch({
          type: CalendarActionKind.CHANGE_SELECTED_RANGE,
          payload: { startDate: start, endDate: end },
        });
      });

      if (prevTimezone !== timeZone) {
        defer(() => {
          (onChange as RangeChange)?.({
            startDate: start ? dayjs(start).toDate() : start,
            endDate: end ? dayjs(end).toDate() : end,
          });
        });
      }
    } else if (mode === 'multiple') {
      const _dates = dates?.map((d) => withTZ(d)) as DateType[];
      defer(() => {
        dispatch({
          type: CalendarActionKind.CHANGE_SELECTED_MULTIPLE,
          payload: { dates: _dates },
        });
      });

      if (prevTimezone !== timeZone) {
        defer(() => {
          (onChange as MultiChange)?.({
            dates: _dates.map((item) => dayjs(item).toDate()),
            change: 'updated',
          });
        });
      }
    }
  }, [
    mode,
    date,
    minDate,
    maxDate,
    timeZone,
    startDate,
    endDate,
    dates,
    prevTimezone,
    withTZ,
    onChange,
  ]);

  // Change calendar view; seed time when entering 'time' (deferred)
  const setCalendarView = useCallback(
    (view: CalendarViews) => {
      const prevView = stateRef.current.calendarView;
      if (view === prevView) return;

      if (view === 'time' && prevView !== 'time') {
        const cur = withTZ(
          stateRef.current.date ?? stateRef.current.currentDate
        );
        const seedH = cur.hour();
        const seedM = cur.minute();

        setTimeSeed({ hour: seedH, minute: seedM });

        const merged = cur.hour(seedH).minute(seedM);
        const existing = withTZ(
          stateRef.current.date ?? stateRef.current.currentDate
        );

        if (!isSameMinute(existing, merged)) {
          defer(() => {
            dispatch({
              type: CalendarActionKind.CHANGE_SELECTED_DATE,
              payload: { date: merged },
            });
            (onChange as SingleChange | undefined)?.({ date: merged.toDate() });
          });
        }
      }

      defer(() => {
        dispatch({ type: CalendarActionKind.SET_CALENDAR_VIEW, payload: view });
      });
    },
    [withTZ, onChange]
  );

  const seedHour = timeSeed?.hour ?? null;
  const seedMinute = timeSeed?.minute ?? null;

  const onSelectDate = useCallback(
    (selectedDate: DateType) => {
      if (!onChange) return;

      if (mode === 'single') {
        userChangeRef.current = true;

        // Keep wall-clock from wheels (no DST shift on parse)
        const picked = dayjs(selectedDate as any).tz(timeZone, true);
        const pickedHasTime = picked.hour() !== 0 || picked.minute() !== 0;

        // Reference time (current value or last seed)
        const base = withTZ(
          stateRef.current.date ??
            stateRef.current.currentDate ??
            dayjs().tz(timeZone)
        );
        const refH = typeof seedHour === 'number' ? seedHour : base.hour();
        const refM =
          typeof seedMinute === 'number' ? seedMinute : base.minute();

        let next: dayjs.Dayjs;

        if (pickedHasTime) {
          // Spike guards: if only one wheel changed, don't allow the other to jump to 0
          let h = picked.hour();
          let m = picked.minute();

          next = picked.hour(h).minute(m);

          // keep timeSeed fresh when user explicitly picks a time
          setTimeSeed({ hour: next.hour(), minute: next.minute() });
        } else {
          // Date-only selection: merge existing (or seed) time
          next = picked
            .hour(refH)
            .minute(refM)
            .second(base.second())
            .millisecond(base.millisecond());
        }

        // 👉 bump sequence AFTER computing next, so late commits can be dropped
        const mySeq = ++selectSeqRef.current;

        // Clamp to min/max using withTZ for consistency
        if (maxDate && withTZ(next).isAfter(maxDate)) next = withTZ(maxDate);
        if (minDate && withTZ(next).isBefore(minDate)) next = withTZ(minDate);

        const existing = withTZ(
          stateRef.current.date ?? stateRef.current.currentDate
        );
        if (isSameMinute(existing, next)) {
          userChangeRef.current = false;
          return;
        }

        const hOut = next.hour();
        const mOut = next.minute();
        if (hOut !== 0 || mOut !== 0) {
          lastNonZeroTimeRef.current = { hour: hOut, minute: mOut };
        }

        defer(() => {
          // Drop stale commits from earlier wheel events
          if (mySeq !== selectSeqRef.current) {
            userChangeRef.current = false;
            return;
          }
          dispatch({
            type: CalendarActionKind.CHANGE_SELECTED_DATE,
            payload: { date: next },
          });
          (onChange as SingleChange)({ date: next.toDate() });
          userChangeRef.current = false;
        });
      } else if (mode === 'range') {
        let start = removeTime(stateRef.current.startDate, timeZone);
        let end = removeTime(stateRef.current.endDate, timeZone);
        const selected = removeTime(selectedDate, timeZone);
        let isStart: boolean = true;
        let isReset: boolean = false;

        if (
          dateToUnix(selected) !== dateToUnix(end) &&
          dateToUnix(selected) >= dateToUnix(start) &&
          dateToUnix(start) !== dateToUnix(end)
        ) {
          isStart = false;
        } else if (start && dateToUnix(selected) === dateToUnix(start)) {
          isReset = true;
        }

        if (start && end) {
          if (
            dateToUnix(start) === dateToUnix(end) &&
            dateToUnix(selected) > dateToUnix(start)
          ) {
            isStart = false;
          }

          if (
            dateToUnix(selected) > dateToUnix(start) &&
            dateToUnix(selected) === dateToUnix(end)
          ) {
            end = undefined;
          }
        }

        if (start && !end && dateToUnix(selected) < dateToUnix(start)) {
          end = start;
        }

        if (isStart && end && (min || max)) {
          const numberOfDays = dayjs(end).diff(selected, 'day');

          if ((max && numberOfDays > max) || (min && numberOfDays < min)) {
            isStart = true;
            end = undefined;
          }
        }

        if (!isStart && start && (min || max)) {
          const numberOfDays = dayjs(selected).diff(start, 'day');

          if (dateToUnix(selected) === dateToUnix(start)) {
            isReset = true;
          } else if (
            (max && numberOfDays > max) ||
            (min && numberOfDays < min)
          ) {
            isStart = true;
            end = undefined;
          }
        }

        if (isReset) {
          defer(() => {
            (onChange as RangeChange)({
              startDate: undefined,
              endDate: undefined,
            });
          });
        } else {
          defer(() => {
            (onChange as RangeChange)({
              startDate: isStart
                ? dayjs(selected).toDate()
                : start
                  ? dayjs.tz(start).toDate()
                  : start,
              endDate: !isStart
                ? dayjs.tz(getEndOfDay(selected), timeZone).toDate()
                : end
                  ? dayjs.tz(getEndOfDay(end), timeZone).toDate()
                  : end,
            });
          });
        }
      } else if (mode === 'multiple') {
        const safeDates = (stateRef.current.dates as DateType[]) || [];
        const newDate = dayjs(selectedDate as any)
          .tz(timeZone, true)
          .startOf('day');

        const exists = safeDates.some((ed) => areDatesOnSameDay(ed, newDate));
        const newDates = exists
          ? safeDates.filter((ed) => !areDatesOnSameDay(ed, newDate))
          : [...safeDates, newDate];

        if (max && newDates.length > max) return;

        newDates.sort((a, b) => (dayjs(a).isAfter(dayjs(b)) ? 1 : -1));
        const _dates = newDates.map((d) => withTZ(d)) as DateType[];

        defer(() => {
          (onChange as MultiChange)({
            dates: _dates.map((item) => dayjs(item).toDate()),
            datePressed: newDate ? dayjs(newDate).toDate() : newDate,
            change: exists ? 'removed' : 'added',
          });
        });
      }
    },
    [
      onChange,
      mode,
      timeZone,
      withTZ,
      seedHour,
      seedMinute,
      maxDate,
      minDate,
      min,
      max,
    ]
  );

  // set the active displayed month
  const onSelectMonth = useCallback(
    (value: number) => {
      const base = withTZ(stateRef.current.currentDate);
      const currentMonth = base.month();
      const newDate = base.month(value);
      if (value !== currentMonth) onMonthChange(value);
      defer(() => {
        dispatch({
          type: CalendarActionKind.CHANGE_CURRENT_DATE,
          payload: newDate,
        });
      });
      setCalendarView('day');
    },
    [withTZ, onMonthChange, setCalendarView]
  );

  // set the active displayed year
  const onSelectYear = useCallback(
    (value: number) => {
      const base = withTZ(stateRef.current.currentDate);
      const currentYear = base.year();
      const newDate = base.year(value);
      if (value !== currentYear) onYearChange(value);
      defer(() => {
        dispatch({
          type: CalendarActionKind.CHANGE_CURRENT_DATE,
          payload: newDate,
        });
      });
      setCalendarView('day');
    },
    [withTZ, onYearChange, setCalendarView]
  );

  // change month by offset
  const onChangeMonth = useCallback(
    (value: number) => {
      const base = withTZ(stateRef.current.currentDate);
      const newDate = base.add(value, 'month');
      defer(() => {
        dispatch({
          type: CalendarActionKind.CHANGE_CURRENT_DATE,
          payload: newDate,
        });
      });
    },
    [withTZ]
  );

  const onChangeYear = useCallback((value: number) => {
    defer(() => {
      dispatch({
        type: CalendarActionKind.CHANGE_CURRENT_YEAR,
        payload: value,
      });
    });
  }, []);

  const onConfirm = useCallback(() => {
    const base = withTZ(stateRef.current.date ?? stateRef.current.currentDate);
    const h = typeof seedHour === 'number' ? seedHour : base.hour();
    const m = typeof seedMinute === 'number' ? seedMinute : base.minute();
    const merged = base.hour(h).minute(m);

    const existing = withTZ(
      stateRef.current.date ?? stateRef.current.currentDate
    );
    if (isSameMinute(existing, merged)) {
      return;
    }

    if (h !== 0 || m !== 0) {
      lastNonZeroTimeRef.current = { hour: h, minute: m };
    }

    defer(() => {
      dispatch({
        type: CalendarActionKind.CHANGE_SELECTED_DATE,
        payload: { date: merged },
      });
      (onChange as SingleChange | undefined)?.({ date: merged.toDate() });
    });
  }, [withTZ, seedHour, seedMinute, onChange]);

  // External month/year props
  useEffect(() => {
    if (month !== undefined && month >= 0 && month <= 11) onSelectMonth(month);
  }, [month, onSelectMonth]);
  useEffect(() => {
    if (year !== undefined && year >= 0) onSelectYear(year);
  }, [year, onSelectYear]);

  const memoizedStyles = useDeepCompareMemo({ ...styles }, [styles]);
  const memoizedClassNames = useDeepCompareMemo({ ...classNames }, [
    classNames,
  ]);
  const memoizedComponents = useMemo(() => ({ ...components }), [components]);

  const baseContextValue = useMemo(
    () => ({
      mode,
      calendar,
      locale,
      numerals,
      timeZone,
      showOutsideDays,
      timePicker,
      minDate,
      maxDate,
      min,
      max,
      enabledDates,
      disabledDates,
      firstDayOfWeek: firstDay,
      containerHeight,
      weekdaysHeight,
      navigationPosition,
      weekdaysFormat,
      monthsFormat,
      monthCaptionFormat,
      multiRangeMode,
      hideHeader,
      hideWeekdays,
      disableMonthPicker,
      disableYearPicker,
      style,
      className,
      use12Hours,
    }),
    [
      mode,
      calendar,
      locale,
      numerals,
      timeZone,
      showOutsideDays,
      timePicker,
      minDate,
      maxDate,
      min,
      max,
      enabledDates,
      disabledDates,
      firstDay,
      containerHeight,
      weekdaysHeight,
      navigationPosition,
      weekdaysFormat,
      monthsFormat,
      monthCaptionFormat,
      multiRangeMode,
      hideHeader,
      hideWeekdays,
      disableMonthPicker,
      disableYearPicker,
      style,
      className,
      use12Hours,
    ]
  );

  const handlerContextValue = useMemo(
    () => ({
      setCalendarView,
      onSelectDate,
      onSelectMonth,
      onSelectYear,
      onChangeMonth,
      onChangeYear,
      onConfirm,
    }),
    [
      setCalendarView,
      onSelectDate,
      onSelectMonth,
      onSelectYear,
      onChangeMonth,
      onChangeYear,
      onConfirm,
    ]
  );

  const styleContextValue = useMemo(
    () => ({ classNames: memoizedClassNames, styles: memoizedStyles }),
    [memoizedClassNames, memoizedStyles]
  );

  const memoizedValue = useMemo(
    () => ({
      ...state,
      ...baseContextValue,
      ...handlerContextValue,
      ...styleContextValue,
      components: memoizedComponents,
      timeSeed,
    }),
    [
      state,
      baseContextValue,
      handlerContextValue,
      styleContextValue,
      memoizedComponents,
      timeSeed,
    ]
  );

  return (
    <CalendarContext.Provider value={memoizedValue}>
      <Calendar />
    </CalendarContext.Provider>
  );
};

export default DateTimePicker;
