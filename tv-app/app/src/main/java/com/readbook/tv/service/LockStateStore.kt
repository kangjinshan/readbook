package com.readbook.tv.service

import com.readbook.tv.util.PreferenceManager

interface ReadingPolicyPreferences {
    val dailyLimitMinutes: Int
    val continuousLimitMinutes: Int
    val restMinutes: Int
    val forbiddenStartTime: String?
    val forbiddenEndTime: String?
}

interface GateStatePreferences {
    var gateStateType: String?
    var gateReason: String?
    var gateMessage: String?
    var gateUntilEpochMs: Long
    var gateRecheckEpochMs: Long
    var lockEndTime: Long
}

class PreferenceBackedGateStatePreferences(
    private val preferenceManager: PreferenceManager
) : GateStatePreferences {
    override var gateStateType: String?
        get() = preferenceManager.gateStateType
        set(value) {
            preferenceManager.gateStateType = value
        }

    override var gateReason: String?
        get() = preferenceManager.gateReason
        set(value) {
            preferenceManager.gateReason = value
        }

    override var gateMessage: String?
        get() = preferenceManager.gateMessage
        set(value) {
            preferenceManager.gateMessage = value
        }

    override var gateUntilEpochMs: Long
        get() = preferenceManager.gateUntilEpochMs
        set(value) {
            preferenceManager.gateUntilEpochMs = value
        }

    override var gateRecheckEpochMs: Long
        get() = preferenceManager.gateRecheckEpochMs
        set(value) {
            preferenceManager.gateRecheckEpochMs = value
        }

    override var lockEndTime: Long
        get() = preferenceManager.lockEndTime
        set(value) {
            preferenceManager.lockEndTime = value
        }
}

open class LockStateStore(
    private val prefs: GateStatePreferences,
    private val currentTimeMillis: () -> Long = System::currentTimeMillis
) {
    fun read(): ReadingGateState {
        val now = currentTimeMillis()
        val legacyEndTime = prefs.lockEndTime
        if (prefs.gateStateType == null && legacyEndTime > 0L) {
            if (legacyEndTime > now) {
                val migrated = ReadingGateState.TemporaryLock(
                    reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
                    message = DEFAULT_REST_MESSAGE,
                    untilEpochMillis = legacyEndTime
                )
                write(migrated)
                return migrated
            }
            prefs.lockEndTime = 0L
        }

        return when (prefs.gateStateType) {
            STATE_TEMPORARY -> {
                val untilEpochMs = prefs.gateUntilEpochMs
                if (untilEpochMs <= now) {
                    clear()
                    ReadingGateState.Unlocked
                } else {
                    ReadingGateState.TemporaryLock(
                        reason = parseReason(prefs.gateReason, LockReason.CONTINUOUS_LIMIT_EXCEEDED),
                        message = prefs.gateMessage ?: DEFAULT_REST_MESSAGE,
                        untilEpochMillis = untilEpochMs
                    )
                }
            }
            STATE_BLOCKED -> ReadingGateState.PolicyBlocked(
                reason = parseReason(prefs.gateReason, LockReason.SERVER_DENIED),
                message = prefs.gateMessage ?: DEFAULT_BLOCKED_MESSAGE,
                recheckAtEpochMillis = prefs.gateRecheckEpochMs.takeIf { it > 0L }
            )
            else -> ReadingGateState.Unlocked
        }
    }

    fun write(state: ReadingGateState) {
        when (state) {
            ReadingGateState.Unlocked -> {
                prefs.gateStateType = null
                prefs.gateReason = null
                prefs.gateMessage = null
                prefs.gateUntilEpochMs = 0L
                prefs.gateRecheckEpochMs = 0L
                prefs.lockEndTime = 0L
            }

            is ReadingGateState.TemporaryLock -> {
                prefs.gateUntilEpochMs = state.untilEpochMillis
                prefs.gateRecheckEpochMs = 0L
                prefs.lockEndTime = state.untilEpochMillis
                prefs.gateReason = state.reason.name
                prefs.gateMessage = state.message
                prefs.gateStateType = STATE_TEMPORARY
            }

            is ReadingGateState.PolicyBlocked -> {
                prefs.gateUntilEpochMs = 0L
                prefs.gateRecheckEpochMs = state.recheckAtEpochMillis ?: 0L
                prefs.lockEndTime = 0L
                prefs.gateReason = state.reason.name
                prefs.gateMessage = state.message
                prefs.gateStateType = STATE_BLOCKED
            }
        }
    }

    fun clear() = write(ReadingGateState.Unlocked)

    private fun parseReason(raw: String?, fallback: LockReason): LockReason =
        runCatching { LockReason.valueOf(raw ?: fallback.name) }.getOrDefault(fallback)

    companion object {
        private const val STATE_TEMPORARY = "temporary"
        private const val STATE_BLOCKED = "blocked"
        private const val DEFAULT_REST_MESSAGE = "请休息一下"
        private const val DEFAULT_BLOCKED_MESSAGE = "当前不允许阅读"
    }
}
