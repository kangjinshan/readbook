package com.readbook.tv.service

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DailyReadingResetApplierTest {

    private data class InMemoryResetPreferences(
        override var todayReadingSeconds: Long = 0L,
        override var continuousReadingSeconds: Long = 0L,
        override var todayDate: String? = "2026-04-18",
        override var lastReadingStoppedAtEpochMs: Long = 0L,
        override var lastAppliedDailyReadingResetEpochMs: Long = 0L
    ) : DailyReadingResetPreferences

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

    private fun fakePreferences() = object : ReadingPolicyPreferences {
        override val dailyLimitMinutes = 60
        override val continuousLimitMinutes = 20
        override val restMinutes = 5
        override val forbiddenStartTime: String? = "22:00"
        override val forbiddenEndTime: String? = "07:30"
    }

    @Test
    fun `applyIfNew clears counters and daily gate when reset marker advances`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T10:00:00Z")
        val resetPreferences = InMemoryResetPreferences(
            todayReadingSeconds = 3600L,
            continuousReadingSeconds = 1200L
        )
        val gateStore = LockStateStore(InMemoryGatePreferences()) { clock.currentInstant().toEpochMilli() }
        gateStore.write(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.DAILY_LIMIT_EXCEEDED,
                message = "今日阅读时长已达上限",
                recheckAtEpochMillis = Instant.parse("2026-04-18T16:00:00Z").toEpochMilli()
            )
        )
        val coordinator = ReadingControlCoordinator(gateStore, clock, fakePreferences())
        val applier = DailyReadingResetApplier(resetPreferences, clock, coordinator)

        val state = applier.applyIfNew(Instant.parse("2026-04-18T10:05:00Z").toEpochMilli())

        assertEquals(0L, resetPreferences.todayReadingSeconds)
        assertEquals(0L, resetPreferences.continuousReadingSeconds)
        assertEquals("2026-04-18", resetPreferences.todayDate)
        assertEquals(Instant.parse("2026-04-18T10:05:00Z").toEpochMilli(), resetPreferences.lastAppliedDailyReadingResetEpochMs)
        assertEquals(ReadingGateState.Unlocked, state)
    }

    @Test
    fun `applyIfNew ignores stale reset marker`() {
        val clock = FakeBeijingTimeProvider("2026-04-18T10:00:00Z")
        val resetAt = Instant.parse("2026-04-18T10:05:00Z").toEpochMilli()
        val resetPreferences = InMemoryResetPreferences(
            todayReadingSeconds = 3600L,
            continuousReadingSeconds = 1200L,
            lastAppliedDailyReadingResetEpochMs = resetAt
        )
        val coordinator = ReadingControlCoordinator(
            LockStateStore(InMemoryGatePreferences()) { clock.currentInstant().toEpochMilli() },
            clock,
            fakePreferences()
        )
        val applier = DailyReadingResetApplier(resetPreferences, clock, coordinator)

        val state = applier.applyIfNew(resetAt)

        assertNull(state)
        assertEquals(3600L, resetPreferences.todayReadingSeconds)
        assertEquals(1200L, resetPreferences.continuousReadingSeconds)
    }

    @Test
    fun `applyIfDayChanged clears counters and daily gate when local date is stale`() {
        val clock = FakeBeijingTimeProvider("2026-04-19T16:10:00Z")
        val resetPreferences = InMemoryResetPreferences(
            todayReadingSeconds = 28_800L,
            continuousReadingSeconds = 600L,
            todayDate = "2026-04-19"
        )
        val gateStore = LockStateStore(InMemoryGatePreferences()) { clock.currentInstant().toEpochMilli() }
        gateStore.write(
            ReadingGateState.PolicyBlocked(
                reason = LockReason.DAILY_LIMIT_EXCEEDED,
                message = "今日阅读时长已达上限",
                recheckAtEpochMillis = Instant.parse("2026-04-19T16:00:00Z").toEpochMilli()
            )
        )
        val coordinator = ReadingControlCoordinator(
            gateStore,
            clock,
            object : ReadingPolicyPreferences {
                override val dailyLimitMinutes = 60
                override val continuousLimitMinutes = 20
                override val restMinutes = 5
                override val forbiddenStartTime: String? = null
                override val forbiddenEndTime: String? = null
            }
        )
        val applier = DailyReadingResetApplier(resetPreferences, clock, coordinator)

        val state = applier.applyIfDayChanged()

        assertEquals(0L, resetPreferences.todayReadingSeconds)
        assertEquals(0L, resetPreferences.continuousReadingSeconds)
        assertEquals("2026-04-20", resetPreferences.todayDate)
        assertEquals(ReadingGateState.Unlocked, state)
    }
}
