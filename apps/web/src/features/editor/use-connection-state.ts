import { ConnectionFailureReason, ConnectionState, RECOVERED_NOTICE_MS, SuperdocCollaborationState } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useReducer } from 'react';
import type { SuperDocCollaborationConnectionChangePayload, SuperDocCollaborationConnectionKind } from 'superdoc';
import { membersQueryKey } from './editor-api';

export enum TransportReading {
  Clear = 'clear',
  Lost = 'lost',
  Reconnecting = 'reconnecting',
  Failed = 'failed',
}

export type TransportReport = { reading: TransportReading | null; failureReason: ConnectionFailureReason | null; hasSynced: boolean };

enum ConnectionAction {
  Report = 'report',
  Recovered = 'recovered',
  NoticeEnded = 'notice-ended',
  Reset = 'reset',
}

type ConnectionStateInput = {
  documentId: string;
  isCurrentUserOnline: boolean | null;
  membersAnsweredAt: number | null;
  isSessionEnded: boolean;
};

type ConnectionStateView = {
  state: ConnectionState;
  failureReason: ConnectionFailureReason | null;
  reportTransport: (report: TransportReport) => void;
  resetConnection: () => void;
};

type Machine = {
  reading: TransportReading;
  failureReason: ConnectionFailureReason | null;
  lostAt: number | null;
  isNoticeShown: boolean;
};

type Action =
  | { type: ConnectionAction.Report; report: TransportReport; now: number }
  | { type: ConnectionAction.Recovered | ConnectionAction.NoticeEnded | ConnectionAction.Reset };

const INITIAL_MACHINE: Machine = { reading: TransportReading.Clear, failureReason: null, lostAt: null, isNoticeShown: false };

const FAILED_REPORT: TransportReport = {
  reading: TransportReading.Failed,
  failureReason: ConnectionFailureReason.Unknown,
  hasSynced: false,
};

export const SUPERSEDED_REPORT: TransportReport = {
  reading: TransportReading.Failed,
  failureReason: ConnectionFailureReason.Superseded,
  hasSynced: false,
};

const REPORT_BY_KIND: Record<SuperDocCollaborationConnectionKind, TransportReport> = {
  initial: { reading: TransportReading.Clear, failureReason: null, hasSynced: false },
  lost: { reading: TransportReading.Lost, failureReason: null, hasSynced: false },
  reconnecting: { reading: TransportReading.Reconnecting, failureReason: null, hasSynced: false },
  recovered: { reading: null, failureReason: null, hasSynced: true },
  failed: FAILED_REPORT,
};

const STATE_BY_READING: Record<TransportReading, ConnectionState> = {
  [TransportReading.Clear]: ConnectionState.Online,
  [TransportReading.Lost]: ConnectionState.Lost,
  [TransportReading.Reconnecting]: ConnectionState.Reconnecting,
  [TransportReading.Failed]: ConnectionState.Failed,
};

function isOutageReading(reading: TransportReading | null): boolean {
  return reading === TransportReading.Lost || reading === TransportReading.Reconnecting;
}

export function transportReportOf({ state, kind }: Pick<SuperDocCollaborationConnectionChangePayload, 'state' | 'kind'>): TransportReport {
  if (state === SuperdocCollaborationState.Failed) return FAILED_REPORT;
  const report = REPORT_BY_KIND[kind];
  if (state === SuperdocCollaborationState.Synced) return { ...report, hasSynced: true };
  return report;
}

export function mergeConnectionState({
  reading,
  isCurrentUserOnline,
}: {
  reading: TransportReading;
  isCurrentUserOnline: boolean | null;
}): ConnectionState {
  if (isOutageReading(reading) && isCurrentUserOnline === true) return ConnectionState.Recovered;
  return STATE_BY_READING[reading];
}

function failureReasonAfter({ current, incoming }: { current: ConnectionFailureReason | null; incoming: ConnectionFailureReason | null }) {
  const isCurrentSpecific = current !== null && current !== ConnectionFailureReason.Unknown;
  if (isCurrentSpecific || incoming === null) return current;
  return incoming;
}

function reportedMachine({ machine, report, now }: { machine: Machine; report: TransportReport; now: number }): Machine {
  const { reading } = report;
  if (machine.reading === TransportReading.Failed) {
    const failureReason = failureReasonAfter({ current: machine.failureReason, incoming: report.failureReason });
    return { ...machine, failureReason };
  }
  if (reading === null) return machine;
  if (reading === TransportReading.Failed) {
    return { ...machine, reading, failureReason: report.failureReason, isNoticeShown: false };
  }
  if (reading === TransportReading.Clear) return { ...machine, reading, lostAt: null };
  const isOutageOngoing = machine.lostAt !== null;
  return { ...machine, reading, lostAt: isOutageOngoing ? machine.lostAt : now, isNoticeShown: false };
}

const REDUCERS: { [Type in ConnectionAction]: (machine: Machine, action: Extract<Action, { type: Type }>) => Machine } = {
  [ConnectionAction.Report]: (machine, { report, now }) => reportedMachine({ machine, report, now }),
  [ConnectionAction.Recovered]: (machine) => {
    if (!isOutageReading(machine.reading)) return machine;
    return { ...machine, reading: TransportReading.Clear, lostAt: null, isNoticeShown: true };
  },
  [ConnectionAction.NoticeEnded]: (machine) => ({ ...machine, isNoticeShown: false }),
  [ConnectionAction.Reset]: () => INITIAL_MACHINE,
};

function reduceMachine(machine: Machine, action: Action): Machine {
  const reducer = REDUCERS[action.type] as (machine: Machine, action: Action) => Machine;
  return reducer(machine, action);
}

export function resolveFailureReason({
  failureReason,
  isSessionEnded,
}: {
  failureReason: ConnectionFailureReason | null;
  isSessionEnded: boolean;
}): ConnectionFailureReason | null {
  const isUnexplained = failureReason === ConnectionFailureReason.Unknown;
  if (isUnexplained && isSessionEnded) return ConnectionFailureReason.SessionEnded;
  return failureReason;
}

export function useConnectionState({
  documentId,
  isCurrentUserOnline,
  membersAnsweredAt,
  isSessionEnded,
}: ConnectionStateInput): ConnectionStateView {
  const queryClient = useQueryClient();
  const [machine, dispatch] = useReducer(reduceMachine, INITIAL_MACHINE);
  const { reading, failureReason, lostAt, isNoticeShown } = machine;
  const isAnsweredAfterLoss = lostAt !== null && membersAnsweredAt !== null && membersAnsweredAt > lostAt;
  const mergedState = mergeConnectionState({ reading, isCurrentUserOnline: isAnsweredAfterLoss ? isCurrentUserOnline : null });
  const isRecoveredNow = mergedState === ConnectionState.Recovered;
  const isSessionEndedDuringOutage = isSessionEnded && isOutageReading(reading);
  const transportState = isNoticeShown && reading === TransportReading.Clear ? ConnectionState.Recovered : mergedState;
  const state = isSessionEndedDuringOutage ? ConnectionState.Failed : transportState;
  const reportedFailureReason = isSessionEndedDuringOutage ? ConnectionFailureReason.Unknown : failureReason;

  useEffect(() => {
    if (isRecoveredNow) dispatch({ type: ConnectionAction.Recovered });
  }, [isRecoveredNow]);

  useEffect(() => {
    if (!isNoticeShown) return;
    const timer = setTimeout(() => dispatch({ type: ConnectionAction.NoticeEnded }), RECOVERED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [isNoticeShown]);

  const reportTransport = useCallback(
    (report: TransportReport): void => {
      const queryKey = membersQueryKey(documentId);
      const isOutageReport = isOutageReading(report.reading);
      if (isOutageReport) queryClient.cancelQueries({ queryKey });
      const isFailedReport = report.reading === TransportReading.Failed;
      if (isOutageReport || isFailedReport || report.hasSynced) queryClient.invalidateQueries({ queryKey });
      dispatch({ type: ConnectionAction.Report, report, now: Date.now() });
    },
    [queryClient, documentId],
  );

  const resetConnection = useCallback((): void => dispatch({ type: ConnectionAction.Reset }), []);

  return {
    state,
    failureReason: resolveFailureReason({ failureReason: reportedFailureReason, isSessionEnded }),
    reportTransport,
    resetConnection,
  };
}
