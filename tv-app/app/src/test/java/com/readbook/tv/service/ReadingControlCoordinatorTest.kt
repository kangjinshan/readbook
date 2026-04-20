package com.readbook.tv.service

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadingControlCoordinatorTest {

    private data class InMemoryGatePreferences(
        override var gateStateType: String? = null,
        override var gateReason: String? = null,
        override var gateMessage: String? = null,
        override var gateUntilEpochMs: Long = 0L,
        override var gateRecheckEpochMs: Long = 0L,
        override var lockEndTime: Long = 0L
    ) : GateStatePreferences

    private class FakeBeijingTimeProvider(instantText: String) : BeijingTimeProvider() {
        private val fixed = Instant.parse(instantText)

        override fun currentInstant(): Instant = fixed
    }

    private fun fakePreferences(
        dailyLimitMinutes: Int = 60,
        continuousLimitMinutes: Int = 20,
        restMinutes: Int = 5
    ) = object : ReadingPolicyPreferences {
        override val dailyLimitMinutes = dailyLimitMinutes
        override val continuousLimitMinutes = continuousLimitMinutes
        override val restMinutes = restMinutes
        override val forbiddenStartTime: String? = "22:00"
        override val forbiddenEndTime: String? = "07:30"
    }

    @Test
    fun `forbidden session denial becomes policy blocked until next allowed time`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T14:30:00Z")
        val store = LockStateStore(InMemoryGatePreferences()) { clock.currentInstant().toEpochMilli() }
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        coordinator.handleSessionStartDenied(
            reason = "forbidden_time",
            message = "当前为禁止阅读时段（22:00-07:30）"
        )

        assertEquals(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.FORBIDDEN_TIME,
                message = "当前为禁止阅读时段（22:00-07:30）",
                recheckAtEpochMillis = Instant.parse("2026-04-18T23:30:00Z").toEpochMilli()
            ),
            coordinator.currentState()
        )
    }

    @Test
    fun `continuous heartbeat lock becomes temporary lock`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T12:00:00Z")
        val store = LockStateStore(InMemoryGatePreferences()) { clock.currentInstant().toEpochMilli() }
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        coordinator.handleHeartbeatResult(
            shouldLock = true,
            reason = "continuous_limit_exceeded",
            message = "连续阅读已达20分钟，请休息5分钟",
            lockDurationMinutes = 5
        )

        assertEquals(
            ReadingGateState.TemporaryLock(
                reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
                message = "连续阅读已达20分钟，请休息5分钟",
                untilEpochMillis = Instant.parse("2026-04-18T12:05:00Z").toEpochMilli()
            ),
            coordinator.currentState()
        )
    }

    @Test
    fun `daily limit uses policy blocked instead of zero second timer`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T10:00:00Z")
        val store = LockStateStore(InMemoryGatePreferences()) { clock.currentInstant().toEpochMilli() }
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences(dailyLimitMinutes = 60)
        )

        coordinator.handleHeartbeatResult(
            shouldLock = true,
            reason = "daily_limit_exceeded",
            message = "今日阅读时长已达60分钟上限",
            lockDurationMinutes = 0
        )

        assertTrue(coordinator.currentState() is ReadingGateState.PolicyBlocked)
    }

    @Test
    fun `manual daily reset clears daily limit block`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T10:00:00Z")
        val prefs = InMemoryGatePreferences()
        val store = LockStateStore(prefs) { clock.currentInstant().toEpochMilli() }
        store.write(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.DAILY_LIMIT_EXCEEDED,
                message = "今日阅读时长已达上限",
                recheckAtEpochMillis = Instant.parse("2026-04-18T16:00:00Z").toEpochMilli()
            )
        )
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        assertEquals(ReadingGateState.Unlocked, coordinator.handleDailyReadingReset())
    }

    @Test
    fun `manual daily reset keeps temporary rest lock`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T10:00:00Z")
        val prefs = InMemoryGatePreferences()
        val store = LockStateStore(prefs) { clock.currentInstant().toEpochMilli() }
        val temporaryLock = ReadingGateState.TemporaryLock(
            reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
            message = "请休息一下",
            untilEpochMillis = Instant.parse("2026-04-18T10:05:00Z").toEpochMilli()
        )
        store.write(temporaryLock)
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        assertEquals(temporaryLock, coordinator.handleDailyReadingReset())
    }

    @Test
    fun `recheck unlocks expired policy block`() {
        val clock = FakeBeijingTimeProvider("2026-04-19T00:10:00Z")
        val prefs = InMemoryGatePreferences()
        val store = LockStateStore(prefs) { clock.currentInstant().toEpochMilli() }
        store.write(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.DAILY_LIMIT_EXCEEDED,
                message = "今日阅读时长已达上限",
                recheckAtEpochMillis = Instant.parse("2026-04-18T16:00:00Z").toEpochMilli()
            )
        )
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        assertEquals(ReadingGateState.Unlocked, coordinator.currentState())
        assertEquals(ReadingGateState.Unlocked, store.read())
    }

    @Test
    fun `policy sync clears no policy block`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T10:00:00Z")
        val prefs = InMemoryGatePreferences()
        val store = LockStateStore(prefs) { clock.currentInstant().toEpochMilli() }
        store.write(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.NO_POLICY,
                message = "当前暂无可用阅读策略",
                recheckAtEpochMillis = null
            )
        )
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        assertEquals(ReadingGateState.Unlocked, coordinator.handlePolicySynced())
        assertEquals(ReadingGateState.Unlocked, store.read())
    }

    @Test
    fun `policy sync during forbidden window becomes forbidden block`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T14:30:00Z")
        val prefs = InMemoryGatePreferences()
        val store = LockStateStore(prefs) { clock.currentInstant().toEpochMilli() }
        store.write(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.NO_POLICY,
                message = "当前暂无可用阅读策略",
                recheckAtEpochMillis = null
            )
        )
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        assertEquals(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.FORBIDDEN_TIME,
                message = "当前为禁止阅读时段",
                recheckAtEpochMillis = Instant.parse("2026-04-18T23:30:00Z").toEpochMilli()
            ),
            coordinator.handlePolicySynced()
        )
    }

    @Test
    fun `expired daily limit during forbidden window rolls into forbidden block`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T14:30:00Z")
        val prefs = InMemoryGatePreferences()
        val store = LockStateStore(prefs) { clock.currentInstant().toEpochMilli() }
        store.write(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.DAILY_LIMIT_EXCEEDED,
                message = "今日阅读时长已达上限",
                recheckAtEpochMillis = Instant.parse("2026-04-18T13:00:00Z").toEpochMilli()
            )
        )
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        assertEquals(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.FORBIDDEN_TIME,
                message = "当前为禁止阅读时段",
                recheckAtEpochMillis = Instant.parse("2026-04-18T23:30:00Z").toEpochMilli()
            ),
            coordinator.currentState()
        )
    }

    @Test
    fun `expired temporary lock during forbidden window rolls into forbidden block`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T14:30:00Z")
        val prefs = InMemoryGatePreferences()
        val store = LockStateStore(prefs) { clock.currentInstant().toEpochMilli() }
        store.write(
            ReadingGateState.TemporaryLock(
                reason = LockReason.CONTINUOUS_LIMIT_EXCEEDED,
                message = "请休息一下",
                untilEpochMillis = Instant.parse("2026-04-18T14:00:00Z").toEpochMilli()
            )
        )
        val coordinator = ReadingControlCoordinator(
            lockStateStore = store,
            beijingTimeProvider = clock,
            policyPreferences = fakePreferences()
        )

        assertEquals(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.FORBIDDEN_TIME,
                message = "当前为禁止阅读时段",
                recheckAtEpochMillis = Instant.parse("2026-04-18T23:30:00Z").toEpochMilli()
            ),
            coordinator.currentState()
        )
    }
}
