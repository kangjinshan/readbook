package com.readbook.tv.service

import java.time.Instant
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class ReadingControlCoordinator(
    private val lockStateStore: LockStateStore,
    private val beijingTimeProvider: BeijingTimeProvider,
    private val policyPreferences: ReadingPolicyPreferences
) {
    private val _state = MutableStateFlow<ReadingGateState>(ReadingGateState.Unlocked)
    val state: StateFlow<ReadingGateState> = _state

    init {
        recheck()
    }

    fun currentState(): ReadingGateState = recheck()

    fun isReadingAllowedNow(): Boolean = currentState() is ReadingGateState.Unlocked

    fun handlePolicySynced(): ReadingGateState {
        val now = beijingTimeProvider.currentInstant()
        val stored = lockStateStore.read()
        val state = when (stored) {
            is ReadingGateState.PolicyBlocked -> {
                if (stored.reason == LockReason.NO_POLICY) {
                    if (beijingTimeProvider.isWithinForbiddenWindow(
                            now,
                            policyPreferences.forbiddenStartTime,
                            policyPreferences.forbiddenEndTime
                        )
                    ) {
                        forbiddenTimeBlocked("当前为禁止阅读时段", now)
                    } else {
                        ReadingGateState.Unlocked
                    }
                } else {
                    recheckLockedState(stored, now)
                }
            }

            else -> recheckLockedState(stored, now)
        }
        return persistState(state, forceWrite = stored != state)
    }

    fun handleDailyReadingReset(now: Instant = beijingTimeProvider.currentInstant()): ReadingGateState {
        val stored = lockStateStore.read()
        val state = if (stored is ReadingGateState.PolicyBlocked && stored.reason == LockReason.DAILY_LIMIT_EXCEEDED) {
            currentPolicyState(now)
        } else {
            recheckLockedState(stored, now)
        }
        return persistState(state, forceWrite = stored != state)
    }

    fun handleSessionStartDenied(reason: String?, message: String?) {
        persistState(mapServerBlock(reason, message, beijingTimeProvider.currentInstant()))
    }

    fun handleHeartbeatResult(
        shouldLock: Boolean,
        reason: String?,
        message: String?,
        lockDurationMinutes: Int
    ) {
        if (!shouldLock) {
            recheck()
            return
        }

        val now = beijingTimeProvider.currentInstant()
        val state = if (normalizeReason(reason) == REASON_CONTINUOUS_LIMIT && lockDurationMinutes > 0) {
            ReadingGateState.TemporaryLock(
                reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
                message = message ?: "请休息一下",
                untilEpochMillis = now.plusSeconds(lockDurationMinutes * 60L).toEpochMilli()
            )
        } else {
            mapServerBlock(reason, message, now)
        }
        persistState(state)
    }

    fun recheck(now: Instant = beijingTimeProvider.currentInstant()): ReadingGateState =
        evaluateCurrentState(now)

    private fun evaluateCurrentState(now: Instant): ReadingGateState {
        val stored = lockStateStore.read()
        val evaluated = recheckLockedState(stored, now)
        return persistState(evaluated, forceWrite = stored != evaluated)
    }

    private fun recheckLockedState(stored: ReadingGateState, now: Instant): ReadingGateState {
        val nowEpochMillis = now.toEpochMilli()

        return when (stored) {
            ReadingGateState.Unlocked -> {
                currentPolicyState(now)
            }

            is ReadingGateState.TemporaryLock -> {
                if (stored.untilEpochMillis <= nowEpochMillis) {
                    currentPolicyState(now)
                } else {
                    stored
                }
            }

            is ReadingGateState.PolicyBlocked -> when (stored.reason) {
                LockReason.FORBIDDEN_TIME -> {
                    if (beijingTimeProvider.isWithinForbiddenWindow(
                            now,
                            policyPreferences.forbiddenStartTime,
                            policyPreferences.forbiddenEndTime
                        )
                    ) {
                        forbiddenTimeBlocked(stored.message, now)
                    } else {
                        ReadingGateState.Unlocked
                    }
                }

                LockReason.DAILY_LIMIT_EXCEEDED -> {
                    if (stored.recheckAtEpochMillis != null && stored.recheckAtEpochMillis <= nowEpochMillis) {
                        currentPolicyState(now)
                    } else {
                        stored.copy(
                            recheckAtEpochMillis = stored.recheckAtEpochMillis
                                ?: beijingTimeProvider.nextBeijingMidnight(now).toEpochMilli()
                        )
                    }
                }

                else -> {
                    if (stored.recheckAtEpochMillis != null && stored.recheckAtEpochMillis <= nowEpochMillis) {
                        currentPolicyState(now)
                    } else {
                        stored
                    }
                }
            }
        }
    }

    private fun currentPolicyState(now: Instant): ReadingGateState =
        if (beijingTimeProvider.isWithinForbiddenWindow(
                now,
                policyPreferences.forbiddenStartTime,
                policyPreferences.forbiddenEndTime
            )
        ) {
            forbiddenTimeBlocked("当前为禁止阅读时段", now)
        } else {
            ReadingGateState.Unlocked
        }

    private fun mapServerBlock(reason: String?, message: String?, now: Instant): ReadingGateState =
        when (normalizeReason(reason)) {
            REASON_FORBIDDEN_TIME -> forbiddenTimeBlocked(message ?: "当前为禁止阅读时段", now)
            REASON_DAILY_LIMIT -> dailyLimitBlocked(now, message ?: "今日阅读时长已达上限")
            REASON_NO_POLICY -> ReadingGateState.PolicyBlocked(
                reason = LockReason.NO_POLICY,
                message = message ?: "当前暂无可用阅读策略",
                recheckAtEpochMillis = null
            )
            else -> ReadingGateState.PolicyBlocked(
                reason = LockReason.SERVER_DENIED,
                message = message ?: "当前不允许阅读",
                recheckAtEpochMillis = null
            )
        }

    private fun forbiddenTimeBlocked(message: String, now: Instant): ReadingGateState =
        ReadingGateState.PolicyBlocked(
            reason = LockReason.FORBIDDEN_TIME,
            message = message,
            recheckAtEpochMillis = beijingTimeProvider.nextAllowedInstant(
                now,
                policyPreferences.forbiddenEndTime
            )?.toEpochMilli()
        )

    private fun dailyLimitBlocked(now: Instant, message: String): ReadingGateState =
        ReadingGateState.PolicyBlocked(
            reason = LockReason.DAILY_LIMIT_EXCEEDED,
            message = message,
            recheckAtEpochMillis = beijingTimeProvider.nextBeijingMidnight(now).toEpochMilli()
        )

    private fun persistState(state: ReadingGateState, forceWrite: Boolean = false): ReadingGateState {
        if (forceWrite || _state.value != state) {
            lockStateStore.write(state)
        }
        _state.value = state
        return state
    }

    private fun normalizeReason(reason: String?): String? = reason?.trim()?.lowercase()

    companion object {
        private const val REASON_FORBIDDEN_TIME = "forbidden_time"
        private const val REASON_DAILY_LIMIT = "daily_limit_exceeded"
        private const val REASON_CONTINUOUS_LIMIT = "continuous_limit_exceeded"
        private const val REASON_NO_POLICY = "no_policy"
    }
}
