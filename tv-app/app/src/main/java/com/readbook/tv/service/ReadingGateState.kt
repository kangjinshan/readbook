package com.readbook.tv.service

enum class LockReason {
    FORBIDDEN_TIME,
    DAILY_LIMIT_EXCEEDED,
    CONTINUOUS_LIMIT_EXCEEDED,
    NO_POLICY,
    SERVER_DENIED
}

sealed class ReadingGateState {
    data object Unlocked : ReadingGateState()

    data class TemporaryLock(
        val reason: LockReason,
        val message: String,
        val untilEpochMillis: Long
    ) : ReadingGateState()

    data class PolicyBlocked(
        val reason: LockReason,
        val message: String,
        val recheckAtEpochMillis: Long?
    ) : ReadingGateState()
}
